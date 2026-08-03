import fs from 'fs';
const DIR = '/tmp/claude-0/-home-user-Evselivanov/b8b3e960-1c98-5f52-95c4-8a9c5deff3c3/scratchpad';
const fills = JSON.parse(fs.readFileSync(DIR + '/fills-final.json', 'utf8'));
const meta = JSON.parse(fs.readFileSync(DIR + '/token-meta.json', 'utf8'));

const STABLES = new Set([
  '0x55d398326f99059ff775485246999027b3197955', // USDT
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
  '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409', // FDUSD
]);
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';

// --- сопоставление токен-акций с тикерами Yahoo ---
const STOCK_BASES = new Set(['SPY','TSLA','NVDA','MSFT','AAPL','GOOGL','GOOG','MU','QQQ','AMZN','META','COIN','HOOD','MSTR','AVGO','AMD','PLTR','CRCL','NFLX','INTC','ORCL','GLD']);
function yahooSym(sym) {
  for (const suf of ['on', 'B', 'x', 'b']) if (sym.endsWith(suf) && STOCK_BASES.has(sym.slice(0, -suf.length))) return sym.slice(0, -suf.length);
  if (STOCK_BASES.has(sym)) return sym;
  return null;
}

// --- рефы Yahoo (минутки за 5 дней; вне сессии — последняя предыдущая цена) ---
async function yahooSeries(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=5d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const res = (await r.json()).chart?.result?.[0];
  if (!res?.timestamp) return null;
  const ts = res.timestamp, cl = res.indicators.quote[0].close;
  const pts = ts.map((t, i) => [t, cl[i]]).filter(([, c]) => c != null);
  return pts;
}
// --- рефы GeckoTerminal (минутные OHLCV главного пула) ---
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gtSeries(tokenAddr, untilTs, fromTs) {
  const rp = await fetch(`https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${tokenAddr}/pools?page=1`, { headers: { accept: 'application/json' } });
  const pools = (await rp.json()).data;
  if (!pools?.length) return null;
  const pool = pools.sort((a, b) => parseFloat(b.attributes.reserve_in_usd) - parseFloat(a.attributes.reserve_in_usd))[0];
  const poolAddr = pool.attributes.address;
  const baseIsToken = pool.relationships.base_token.data.id.toLowerCase().endsWith(tokenAddr);
  const pts = [];
  let before = untilTs + 3600;
  for (let k = 0; k < 2; k++) {
    await sleep(2100);
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${poolAddr}/ohlcv/minute?aggregate=1&limit=1000&before_timestamp=${before}&token=${baseIsToken ? 'base' : 'quote'}`, { headers: { accept: 'application/json' } });
    const list = (await r.json()).data?.attributes?.ohlcv_list || [];
    pts.push(...list.map(c => [c[0], c[4]]));
    if (!list.length || list.at(-1)[0] <= fromTs) break;
    before = list.at(-1)[0];
  }
  pts.sort((a, b) => a[0] - b[0]);
  return pts.length ? pts : null;
}
function refAt(pts, ts) {
  // ближайшая предыдущая точка (бинпоиск не нужен — линейный с конца дорого; отсортировано)
  let lo = 0, hi = pts.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= ts) { ans = pts[m][1]; lo = m + 1; } else hi = m - 1; }
  return ans;
}

const tsMin = Math.min(...fills.map(f => f.ts)), tsMax = Math.max(...fills.map(f => f.ts));

// какие рефы нужны
const need = {};   // addr -> {sym, kind}
for (const f of fills) for (const a of [f.makerAsset, f.takerAsset]) {
  if (STABLES.has(a)) continue;
  const sym = meta[a].symbol;
  need[a] = { sym, kind: a === WBNB ? 'gt' : (yahooSym(sym) ? 'yahoo' : 'gt') };
}
// частота токенов — GT только для тех, где ≥5 филлов (щадим rate limit)
const cnt = {};
fills.forEach(f => [f.makerAsset, f.takerAsset].forEach(a => cnt[a] = (cnt[a] || 0) + 1));

const refs = {};
for (const [a, { sym, kind }] of Object.entries(need)) {
  try {
    if (kind === 'yahoo') {
      const y = yahooSym(sym);
      refs[a] = refs[a] || await yahooSeries(y);
      console.log(`реф ${sym} ← Yahoo:${y}: ${refs[a]?.length ?? 0} точек`);
    } else if (cnt[a] >= 5) {
      refs[a] = await gtSeries(a, tsMax, tsMin - 3600);
      console.log(`реф ${sym} ← GeckoTerminal: ${refs[a]?.length ?? 0} точек`);
    }
  } catch (e) { console.log(`реф ${sym}: ошибка ${e.message.slice(0, 60)}`); }
}
fs.writeFileSync(DIR + '/refs.json', JSON.stringify(refs));

// --- расчёт отклонений ---
const bnbRef = refs[WBNB];
const rows = [], skipped = { noQuote: 0, noRef: 0 };
for (const f of fills) {
  const mA = f.makerAsset, tA = f.takerAsset;
  let quote = null, token = null, side = null; // side: мейкер sell/buy токена
  if (STABLES.has(mA) || (mA === WBNB && !STABLES.has(tA))) { quote = mA; token = tA; side = 'BUY'; }
  if (STABLES.has(tA) || (tA === WBNB && !STABLES.has(mA))) { quote = tA; token = mA; side = 'SELL'; }
  if (STABLES.has(mA) && STABLES.has(tA)) { quote = tA; token = mA; side = 'SELL'; }
  if (!quote) { skipped.noQuote++; continue; }
  const qDec = meta[quote].dec, tDec = meta[token].dec;
  const qAmt = Number(side === 'BUY' ? f.making : f.taking) / 10 ** qDec;
  const tAmt = Number(side === 'BUY' ? f.taking : f.making) / 10 ** tDec;
  if (!qAmt || !tAmt) { skipped.noQuote++; continue; }
  let qUsd = qAmt;
  if (quote === WBNB) { const p = bnbRef && refAt(bnbRef, f.ts); if (!p) { skipped.noRef++; continue; } qUsd = qAmt * p; }
  const exec = qUsd / tAmt;
  let ref = STABLES.has(token) ? 1 : (refs[token] ? refAt(refs[token], f.ts) : null);
  const dev = ref ? (exec - ref) / ref * 100 : null;
  rows.push({ ts: f.ts, block: f.block, tx: f.tx, maker: f.maker, resolver: f.resolver,
    token: meta[token].symbol, tokenAddr: token, side, tAmt, usd: qUsd, exec, ref, dev });
  if (ref === null) skipped.noRef++;
}
fs.writeFileSync(DIR + '/rows.json', JSON.stringify(rows));
console.log(`\nОценено филлов: ${rows.length} | без котируемой ноги: ${skipped.noQuote} | без референса: ${skipped.noRef}`);

// --- сводка по токенам ---
const agg = {};
for (const r of rows) {
  const k = r.token;
  agg[k] = agg[k] || { fills: 0, usd: 0, devs: [], ge10: 0 };
  agg[k].fills++; agg[k].usd += r.usd;
  if (r.dev !== null && isFinite(r.dev)) { agg[k].devs.push(r.dev); if (Math.abs(r.dev) >= 10) agg[k].ge10++; }
}
console.log('\nТокен        | филлов | объём $   | медиана откл.% | |откл|>=10%');
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].usd - a[1].usd).slice(0, 25)) {
  const med = v.devs.length ? v.devs.sort((x, y) => x - y)[v.devs.length >> 1].toFixed(2) : '—';
  console.log(`${k.padEnd(12)} | ${String(v.fills).padStart(6)} | ${v.usd.toFixed(0).padStart(9)} | ${String(med).padStart(14)} | ${v.ge10}`);
}

// --- события ≥10% ---
const big = rows.filter(r => r.dev !== null && isFinite(r.dev) && Math.abs(r.dev) >= 10).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
console.log(`\nФиллы с отклонением ≥10% от референса: ${big.length}`);
for (const r of big.slice(0, 25)) {
  const d = new Date(r.ts * 1000).toISOString().slice(5, 16);
  console.log(`${d} | ${r.token.padEnd(10)} | мейкер ${r.side === 'SELL' ? 'ПРОДАЛ' : 'КУПИЛ'} | exec=$${r.exec.toPrecision(5)} ref=$${r.ref.toPrecision(5)} | ${r.dev > 0 ? '+' : ''}${r.dev.toFixed(1)}% | $${r.usd.toFixed(0)} | ${r.tx}`);
}
