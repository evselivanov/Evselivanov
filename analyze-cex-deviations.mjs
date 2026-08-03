import fs from 'fs';
const DIR = '/tmp/claude-0/-home-user-Evselivanov/b8b3e960-1c98-5f52-95c4-8a9c5deff3c3/scratchpad';
const fills = JSON.parse(fs.readFileSync(DIR + '/fills-final.json', 'utf8'));
const meta = JSON.parse(fs.readFileSync(DIR + '/token-meta.json', 'utf8'));

const STABLES = new Set(['0x55d398326f99059ff775485246999027b3197955','0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d','0xe9e7cea3dedca5984780bafc599bd69add087d56','0xc5f0f7b66764f6ec8c8dff7ba683102295e16409']);
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
const CEXSYM = { WBNB: 'BNB', BTCB: 'BTC', ETH: 'ETH' };  // адресные обёртки → базовый тикер

const tsMin = Math.min(...fills.map(f => f.ts)), tsMax = Math.max(...fills.map(f => f.ts));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- загрузка минуток с трёх бирж ---
async function klBinance(sym) {
  const out = [];
  for (let t = tsMin * 1000; t < tsMax * 1000; t += 1000 * 60000) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1m&startTime=${t}&endTime=${Math.min(t + 1000 * 60000, tsMax * 1000 + 60000)}&limit=1000`);
    const j = await r.json();
    if (!Array.isArray(j)) return null;
    out.push(...j.map(c => [c[0] / 1000, +c[4]]));
  }
  return out.length ? out : null;
}
async function klMexc(sym) {
  const out = [];
  for (let t = tsMin * 1000; t < tsMax * 1000; t += 1000 * 60000) {
    const r = await fetch(`https://api.mexc.com/api/v3/klines?symbol=${sym}USDT&interval=1m&startTime=${t}&endTime=${Math.min(t + 1000 * 60000, tsMax * 1000 + 60000)}&limit=1000`);
    const j = await r.json();
    if (!Array.isArray(j)) return null;
    out.push(...j.map(c => [c[0] / 1000, +c[4]]));
    await sleep(150);
  }
  return out.length ? out : null;
}
async function klGate(sym) {
  const out = [];
  for (let t = tsMin; t < tsMax; t += 1000 * 60) {
    const r = await fetch(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${sym}_USDT&interval=1m&from=${t}&to=${Math.min(t + 1000 * 60, tsMax + 60)}`);
    const j = await r.json();
    if (!Array.isArray(j)) return null;
    out.push(...j.map(c => [+c[0], +c[2]]));
    await sleep(150);
  }
  return out.length ? out : null;
}

// --- какие токены пробуем на цексах ---
const cnt = {};
fills.forEach(f => [f.makerAsset, f.takerAsset].forEach(a => cnt[a] = (cnt[a] || 0) + 1));
const candidates = Object.keys(cnt).filter(a => !STABLES.has(a));
const refs = {}, source = {};
for (const a of candidates) {
  const rawSym = meta[a].symbol;
  const sym = (CEXSYM[rawSym] || rawSym).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!sym || sym.length > 12) continue;
  let pts = null, src = null;
  for (const [name, fn] of [['Binance', klBinance], ['MEXC', klMexc], ['Gate', klGate]]) {
    try { pts = await fn(sym); } catch { pts = null; }
    if (pts && pts.length > 100) { src = name; break; }
    pts = null;
  }
  if (pts) { pts.sort((x, y) => x[0] - y[0]); refs[a] = pts; source[a] = src; console.log(`${rawSym.padEnd(10)} → ${src} (${pts.length} мин), посл. цена $${pts.at(-1)[1]}`); }
}

function refAt(pts, ts) {
  let lo = 0, hi = pts.length - 1, ans = null, anst = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= ts) { ans = pts[m][1]; anst = pts[m][0]; lo = m + 1; } else hi = m - 1; }
  return ans !== null && ts - anst <= 300 ? ans : null; // не старше 5 минут
}

// --- пересчёт филлов против CEX-референсов ---
const perTxMaker = {};
fills.forEach(f => { const k = f.tx + f.maker; perTxMaker[k] = (perTxMaker[k] || 0) + 1; });

const rows = [];
for (const f of fills) {
  const mA = f.makerAsset, tA = f.takerAsset;
  let quote = null, token = null, side = null;
  if (STABLES.has(mA) || (mA === WBNB && !STABLES.has(tA) && tA !== WBNB)) { quote = mA; token = tA; side = 'BUY'; }
  if (STABLES.has(tA) || (tA === WBNB && !STABLES.has(mA) && mA !== WBNB)) { quote = tA; token = mA; side = 'SELL'; }
  if (STABLES.has(mA) && STABLES.has(tA)) continue;
  if (!quote || !refs[token]) continue;
  const qAmt = Number(side === 'BUY' ? f.making : f.taking) / 10 ** meta[quote].dec;
  const tAmt = Number(side === 'BUY' ? f.taking : f.making) / 10 ** meta[token].dec;
  if (!qAmt || !tAmt) continue;
  let qUsd = qAmt;
  if (quote === WBNB) { const p = refs[WBNB] && refAt(refs[WBNB], f.ts); if (!p) continue; qUsd = qAmt * p; }
  const ref = refAt(refs[token], f.ts);
  if (!ref) continue;
  const exec = qUsd / tAmt;
  rows.push({ ts: f.ts, tx: f.tx, maker: f.maker, token: meta[token].symbol, tokenAddr: token,
    side, usd: qUsd, exec, ref, dev: (exec - ref) / ref * 100, src: source[token],
    artifactRisk: perTxMaker[f.tx + f.maker] > 1 });
}

// --- санити: коллизии символов (медиана exec против CEX должна быть близка) ---
const byTok = {};
rows.forEach(r => (byTok[r.tokenAddr] = byTok[r.tokenAddr] || []).push(r));
const dropped = [];
for (const [a, rs] of Object.entries(byTok)) {
  const meds = rs.map(r => r.exec / r.ref).sort((x, y) => x - y);
  const med = meds[meds.length >> 1];
  if (med < 0.5 || med > 2) { dropped.push(meta[a].symbol + ` (медиана x${med.toFixed(2)})`); rs.forEach(r => r.collision = true); }
}
const ok = rows.filter(r => !r.collision);
console.log(`\nОценено против CEX: ${ok.length} филлов | отброшено как коллизия символа: ${dropped.join(', ') || 'нет'}`);

// --- сводка по токенам ---
console.log('\nТокен      | цекс    | филлов | медиана откл.% | мин.% | макс.%');
for (const [a, rs0] of Object.entries(byTok)) {
  const rs = rs0.filter(r => !r.collision);
  if (!rs.length) continue;
  const ds = rs.map(r => r.dev).sort((x, y) => x - y);
  console.log(`${meta[a].symbol.padEnd(10)} | ${rs[0].src.padEnd(7)} | ${String(rs.length).padStart(6)} | ${ds[ds.length >> 1].toFixed(2).padStart(14)} | ${ds[0].toFixed(1).padStart(5)} | ${ds.at(-1).toFixed(1)}`);
}

// --- сделки ниже рынка на 20%+ (и для сравнения на 5%+) ---
for (const thr of [20, 10, 5]) {
  const hits = ok.filter(r => r.dev <= -thr).sort((a, b) => a.dev - b.dev);
  console.log(`\n=== Цена сделки ниже рыночной на ${thr}%+ : ${hits.length}`);
  for (const r of hits.slice(0, 15)) {
    const d = new Date(r.ts * 1000).toISOString().slice(5, 16);
    console.log(`${d} | ${r.token.padEnd(8)} | мейкер ${r.side === 'SELL' ? 'ПРОДАЛ дёшево' : 'КУПИЛ дёшево'} | exec=$${r.exec.toPrecision(5)} ref(${r.src})=$${r.ref.toPrecision(5)} | ${r.dev.toFixed(1)}% | $${r.usd.toFixed(0)}${r.artifactRisk ? ' | РИСК АРТЕФАКТА' : ''} | ${r.tx}`);
  }
}
fs.writeFileSync(DIR + '/rows-cex.json', JSON.stringify(rows));
