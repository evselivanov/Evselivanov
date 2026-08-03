import fs from 'fs';
import readline from 'readline';
const DIR = '/tmp/claude-0/-home-user-Evselivanov/b8b3e960-1c98-5f52-95c4-8a9c5deff3c3/scratchpad';
const uni = JSON.parse(fs.readFileSync(DIR + '/universe-meta.json', 'utf8'));
const RPCS = ['https://bsc-dataseed.binance.org','https://bsc-dataseed1.defibit.io','https://bsc-dataseed1.ninicoin.io','https://bsc.meowrpc.com'];
let rr = 0;
async function rpc(method, params) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(RPCS[rr++ % RPCS.length], { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (i === 3) throw e; }
  }
}
const STABLES = new Set(['0x55d398326f99059ff775485246999027b3197955','0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d','0xe9e7cea3dedca5984780bafc599bd69add087d56','0xc5f0f7b66764f6ec8c8dff7ba683102295e16409']);
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
const START = 113627786, END = 113742986;

// --- 1. пулы: собрать уникальные, резолвить token0/token1 (кэш прошлого прогона годится) ---
const pools = fs.existsSync(DIR + '/pools.json') ? JSON.parse(fs.readFileSync(DIR + '/pools.json', 'utf8')) : {};
const unknown = new Set();
{
  const rl = readline.createInterface({ input: fs.createReadStream(DIR + '/swaps-full.jsonl') });
  for await (const ln of rl) { if (!ln) continue; const t = JSON.parse(ln); for (const s of t.s) if (pools[s.p] === undefined) unknown.add(s.p); }
}
console.log(`Пулов к резолву: ${unknown.size} (кэш: ${Object.keys(pools).length})`);
const ulist = [...unknown];
for (let i = 0; i < ulist.length; i += 25) {
  await Promise.all(ulist.slice(i, i + 25).map(async p => {
    try {
      const [t0, t1] = await Promise.all([
        rpc('eth_call', [{ to: p, data: '0x0dfe1681' }, 'latest']),
        rpc('eth_call', [{ to: p, data: '0xd21220a7' }, 'latest']),
      ]);
      pools[p] = (t0?.length === 66 && t1?.length === 66) ? ['0x' + t0.slice(26), '0x' + t1.slice(26)] : null;
    } catch { pools[p] = null; }
  }));
  if (i && i % 2500 === 0) { console.log(`  пулы: ${i}/${ulist.length}`); fs.writeFileSync(DIR + '/pools.json', JSON.stringify(pools)); }
}
fs.writeFileSync(DIR + '/pools.json', JSON.stringify(pools));

// --- 2. какие токены реально торговались против котировок — для них качаем рефы ---
const isQ = a => STABLES.has(a) || a === WBNB;
function classify(pp) {
  if (!pp) return null;
  const [t0, t1] = pp;
  if (uni[t0] && !isQ(t0) && isQ(t1)) return { token: t0, quote: t1, tokIs0: true };
  if (uni[t1] && !isQ(t1) && isQ(t0)) return { token: t1, quote: t0, tokIs0: false };
  return null;
}
const traded = new Set();
{
  const rl = readline.createInterface({ input: fs.createReadStream(DIR + '/swaps-full.jsonl') });
  for await (const ln of rl) { if (!ln) continue; const t = JSON.parse(ln); for (const s of t.s) { const c = classify(pools[s.p]); if (c) traded.add(c.token); } }
}
console.log(`Токенов с реальными сделками против USD/BNB-котировок: ${traded.size}`);

// --- 3. рефы: минутки с приоритетной биржи токена + BNB ---
const tsAnchors = [];
for (let n = START; n <= END + 19999; n += 20000) {
  const b = Math.min(n, END);
  const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
  tsAnchors.push([b, parseInt(blk.timestamp, 16)]);
  if (b === END) break;
}
const tsOf = n => {
  for (let i = 0; i < tsAnchors.length - 1; i++) {
    const [b1, x1] = tsAnchors[i], [b2, x2] = tsAnchors[i + 1];
    if (n >= b1 && n <= b2) return Math.round(x1 + (n - b1) * (x2 - x1) / (b2 - b1));
  }
  return tsAnchors.at(-1)[1];
};
const tsMin = tsOf(START), tsMax = tsOf(END);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function klines(exch, sym) {
  try {
    const out = [];
    if (exch === 'Binance') {
      for (let t = tsMin * 1000; t < tsMax * 1000; t += 1000 * 60000) {
        const j = await (await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1m&startTime=${t}&endTime=${Math.min(t + 1000 * 60000, tsMax * 1000 + 60000)}&limit=1000`)).json();
        if (!Array.isArray(j)) return null;
        out.push(...j.map(c => [c[0] / 1000, +c[4]]));
      }
    } else if (exch === 'MEXC') {
      for (let t = tsMin * 1000; t < tsMax * 1000; t += 1000 * 60000) {
        const j = await (await fetch(`https://api.mexc.com/api/v3/klines?symbol=${sym}USDT&interval=1m&startTime=${t}&endTime=${Math.min(t + 1000 * 60000, tsMax * 1000 + 60000)}&limit=1000`)).json();
        if (!Array.isArray(j)) return null;
        out.push(...j.map(c => [c[0] / 1000, +c[4]]));
        await sleep(100);
      }
    } else {
      for (let t = tsMin; t < tsMax; t += 1000 * 60) {
        const j = await (await fetch(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${sym}_USDT&interval=1m&from=${t}&to=${Math.min(t + 1000 * 60, tsMax + 60)}`)).json();
        if (!Array.isArray(j)) return null;
        out.push(...j.map(c => [+c[0], +c[2]]));
        await sleep(100);
      }
    }
    if (out.length < 30) return null;
    out.sort((a, b) => a[0] - b[0]);
    return out;
  } catch { return null; }
}
const refsFile = DIR + '/refs-full.json';
const refs = fs.existsSync(refsFile) ? JSON.parse(fs.readFileSync(refsFile, 'utf8')) : {};
let fetched = 0;
const wantList = [...traded, WBNB];
for (const a of wantList) {
  if (refs[a] !== undefined) continue;
  const info = uni[a] || (a === WBNB ? { sym: 'BNB', src: ['Binance'] } : null);
  if (!info) { refs[a] = null; continue; }
  const symClean = info.sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let got = null, src = null;
  for (const e of info.src) { got = await klines(e, symClean); if (got) { src = e; break; } }
  refs[a] = got ? { src, pts: got } : null;
  if (++fetched % 50 === 0) { console.log(`  рефы: ${fetched}, последний ${info.sym} ${src || 'нет'}`); fs.writeFileSync(refsFile, JSON.stringify(refs)); }
}
fs.writeFileSync(refsFile, JSON.stringify(refs));
console.log(`Рефы готовы: ${Object.values(refs).filter(Boolean).length} токенов с ценами цекс`);

const refAt = (entry, ts) => {
  if (!entry) return null;
  const pts = entry.pts;
  let lo = 0, hi = pts.length - 1, ans = null, at = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= ts) { ans = pts[m][1]; at = pts[m][0]; lo = m + 1; } else hi = m - 1; }
  return ans !== null && ts - at <= 300 ? ans : null;
};

// --- 4. расчёт сделок ---
const I256 = h => { const v = BigInt(h); return v >= (1n << 255n) ? v - (1n << 256n) : v; };
const byTok = {};
let priced = 0;
const csvPath = DIR + '/all-trades-full.csv';
fs.writeFileSync(csvPath, 'ts,block,tx,pool,ver,token,side,usd,exec,ref,dev_pct,cex\n');
let csvBuf = [];
{
  const rl = readline.createInterface({ input: fs.createReadStream(DIR + '/swaps-full.jsonl') });
  for await (const ln of rl) {
    if (!ln) continue;
    const t = JSON.parse(ln);
    const ts = tsOf(t.b);
    for (const s of t.s) {
      const c = classify(pools[s.p]);
      if (!c || !refs[c.token]) continue;
      const d = s.d.slice(2);
      let tokAmt, quoteAmt, side;
      if (s.v === 2) {
        if (d.length < 256) continue;
        const [a0i, a1i, a0o, a1o] = [0, 1, 2, 3].map(k => BigInt('0x' + d.slice(k * 64, k * 64 + 64)));
        const tIn = c.tokIs0 ? a0i : a1i, tOut = c.tokIs0 ? a0o : a1o;
        const qIn = c.tokIs0 ? a1i : a0i, qOut = c.tokIs0 ? a1o : a0o;
        if (tOut > 0n && qIn > 0n) { side = 'BUY'; tokAmt = tOut; quoteAmt = qIn; }
        else if (tIn > 0n && qOut > 0n) { side = 'SELL'; tokAmt = tIn; quoteAmt = qOut; }
        else continue;
      } else {
        if (d.length < 128) continue;
        const a0 = I256('0x' + d.slice(0, 64)), a1 = I256('0x' + d.slice(64, 128));
        const tA = c.tokIs0 ? a0 : a1, qA = c.tokIs0 ? a1 : a0;
        if (tA === 0n || qA === 0n) continue;
        side = tA < 0n ? 'BUY' : 'SELL';
        tokAmt = tA < 0n ? -tA : tA; quoteAmt = qA < 0n ? -qA : qA;
      }
      const tokN = Number(tokAmt) / 10 ** uni[c.token].dec;
      let quoteUsd = Number(quoteAmt) / 1e18; // все котировки BSC (USDT/USDC/BUSD/FDUSD/WBNB) — 18 знаков
      if (!tokN || !quoteUsd) continue;
      if (c.quote === WBNB) { const p = refAt(refs[WBNB], ts); if (!p) continue; quoteUsd *= p; }
      const ref = refAt(refs[c.token], ts);
      if (!ref) continue;
      const exec = quoteUsd / tokN;
      const dev = (exec - ref) / ref * 100;
      priced++;
      const sym = uni[c.token].sym;
      (byTok[c.token] = byTok[c.token] || []).push({ ts, b: t.b, tx: t.tx, side, usd: quoteUsd, exec, ref, dev });
      csvBuf.push(`${ts},${t.b},${t.tx},${s.p},${s.v},${sym},${side},${quoteUsd.toFixed(2)},${exec.toPrecision(8)},${ref.toPrecision(8)},${dev.toFixed(3)},${refs[c.token].src}`);
      if (csvBuf.length >= 50000) { fs.appendFileSync(csvPath, csvBuf.join('\n') + '\n'); csvBuf = []; }
    }
  }
}
if (csvBuf.length) fs.appendFileSync(csvPath, csvBuf.join('\n') + '\n');
console.log(`Оценённых сделок: ${priced}`);

// --- 5. отсев коллизий и статистика ---
const collisions = [];
for (const [a, rs] of Object.entries(byTok)) {
  const ds = rs.map(r => Math.abs(r.dev)).sort((x, y) => x - y);
  if (ds[ds.length >> 1] > 60) { collisions.push(uni[a].sym); byTok[a] = null; }
}
console.log(`Коллизии тикеров (исключены из статистики): ${collisions.length}: ${collisions.slice(0, 30).join(', ')}${collisions.length > 30 ? '…' : ''}`);

const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const stats = {};
const all = [];
for (const [a, rs] of Object.entries(byTok)) {
  if (!rs) continue;
  const ds = rs.map(r => r.dev).sort((x, y) => x - y);
  stats[uni[a].sym] = { addr: a, cex: refs[a].src, trades: rs.length, usd: +rs.reduce((s, r) => s + r.usd, 0).toFixed(0),
    med: +q(ds, 0.5).toFixed(2), p1: +q(ds, 0.01).toFixed(2), p99: +q(ds, 0.99).toFixed(2),
    below5: ds.filter(x => x <= -5).length, below10: ds.filter(x => x <= -10).length,
    below20: ds.filter(x => x <= -20).length, below50: ds.filter(x => x <= -50).length };
  rs.forEach(r => all.push({ ...r, sym: uni[a].sym, addr: a, src: refs[a].src }));
}
fs.writeFileSync(DIR + '/full-stats.json', JSON.stringify(stats, null, 1));

for (const thr of [50, 20]) {
  const hits = all.filter(r => r.dev <= -thr).sort((x, y) => x.dev - y.dev);
  const toks = {};
  hits.forEach(h => toks[h.sym] = (toks[h.sym] || 0) + 1);
  console.log(`\n=== НИЖЕ РЫНКА НА ${thr}%+: ${hits.length} сделок, монет: ${Object.keys(toks).length}`);
  console.log('Монеты:', JSON.stringify(toks));
  for (const r of hits.slice(0, 30)) {
    const d = new Date(r.ts * 1000).toISOString().slice(5, 16);
    console.log(`${d} | ${r.sym.padEnd(9)} | ${r.side === 'BUY' ? 'куплено ' : 'продано'} | exec=$${r.exec.toPrecision(5)} ref(${r.src})=$${r.ref.toPrecision(5)} | ${r.dev.toFixed(1)}% | $${r.usd.toFixed(0)} | ${r.tx.slice(0, 22)}…`);
  }
}
console.log('\nИтого токенов в статистике:', Object.keys(stats).length);
console.log('Суммарный объём оценённых сделок: $' + Object.values(stats).reduce((s, v) => s + v.usd, 0).toLocaleString());
