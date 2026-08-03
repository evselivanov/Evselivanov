import fs from 'fs';
const DIR = '/tmp/claude-0/-home-user-Evselivanov/b8b3e960-1c98-5f52-95c4-8a9c5deff3c3/scratchpad';
const V6 = '0x111111125421ca6dc452d289314280a0f8842a65';
const OF = '0xfec331350fce78ba658e082a71da20ac9f8d798a99b3c79681c8440cbfe77e07';
const TR = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RPC = 'https://bsc-dataseed.binance.org';

async function rpc(method, params) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

const lines = fs.readFileSync(DIR + '/fills-24h.jsonl', 'utf8').trim().split('\n').map(JSON.parse);

// ---- 1. Реконструкция обратным проходом от OrderFilled ----
const fills = [];
let bad = 0;
for (const t of lines) {
  const logs = t.logs;
  const ofIdx = logs.map((l, i) => (l.address.toLowerCase() === V6 && l.topics[0] === OF) ? i : -1).filter(i => i >= 0);
  let prev = -1;
  for (const oi of ofIdx) {
    const seg = [];
    for (let i = prev + 1; i < oi; i++) {
      const l = logs[i];
      if (l.topics[0] === TR && l.topics.length === 3 && l.data && l.data !== '0x')
        seg.push({ token: l.address.toLowerCase(), from: '0x' + l.topics[1].slice(26),
          to: '0x' + l.topics[2].slice(26), amt: BigInt(l.data) });
    }
    prev = oi;
    if (!seg.length) { bad++; continue; }
    const L1 = seg[seg.length - 1];               // последний перевод перед OrderFilled = выплата мейкеру
    const maker = L1.to, takerAsset = L1.token;
    const taking = seg.filter(x => x.to === maker && x.token === takerAsset).reduce((s, x) => s + x.amt, 0n);
    const sentTr = seg.filter(x => x.from === maker && x.token !== takerAsset);
    if (!sentTr.length) { bad++; continue; }
    const makerAsset = sentTr[sentTr.length - 1].token;
    const making = sentTr.filter(x => x.token === makerAsset).reduce((s, x) => s + x.amt, 0n);
    if (making === 0n || taking === 0n) { bad++; continue; }
    fills.push({ block: t.block, tx: t.txHash, resolver: (t.to || '').toLowerCase(), maker,
      makerAsset, making, takerAsset, taking });
  }
}
console.log(`Восстановлено: ${fills.length} из 4339 | не удалось: ${bad}`);

// ---- 2. Метаданные токенов ----
const tokens = [...new Set(fills.flatMap(f => [f.makerAsset, f.takerAsset]))];
const meta = {};
for (let i = 0; i < tokens.length; i += 10) {
  await Promise.all(tokens.slice(i, i + 10).map(async a => {
    try {
      const [sym, dec] = await Promise.all([
        rpc('eth_call', [{ to: a, data: '0x95d89b41' }, 'latest']),
        rpc('eth_call', [{ to: a, data: '0x313ce567' }, 'latest']),
      ]);
      let symbol = '';
      try {
        const hex = sym.slice(2);
        // string ABI: offset+len+data, либо bytes32
        symbol = hex.length > 128
          ? Buffer.from(hex.slice(128, 128 + parseInt(hex.slice(64, 128), 16) * 2), 'hex').toString('utf8')
          : Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
      } catch {}
      meta[a] = { symbol: symbol.replace(/[^\x20-\x7E]/g, '') || a.slice(0, 8), dec: parseInt(dec, 16) || 18 };
    } catch { meta[a] = { symbol: a.slice(0, 8), dec: 18 }; }
  }));
}
console.log('Метаданные получены для', Object.keys(meta).length, 'токенов');

// ---- 3. Метки времени (интерполяция по якорям) ----
const blocks = fills.map(f => f.block);
const bMin = Math.min(...blocks), bMax = Math.max(...blocks);
const anchors = [];
for (let n = bMin; n <= bMax + 19999; n += 20000) {
  const b = Math.min(n, bMax);
  const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
  anchors.push([b, parseInt(blk.timestamp, 16)]);
  if (b === bMax) break;
}
function tsOf(n) {
  for (let i = 0; i < anchors.length - 1; i++) {
    const [b1, t1] = anchors[i], [b2, t2] = anchors[i + 1];
    if (n >= b1 && n <= b2) return Math.round(t1 + (n - b1) * (t2 - t1) / (b2 - b1));
  }
  return anchors[anchors.length - 1][1];
}

fills.forEach(f => f.ts = tsOf(f.block));
fs.writeFileSync(DIR + '/fills-final.json', JSON.stringify(fills.map(f => ({ ...f, making: f.making.toString(), taking: f.taking.toString() })), null, 0));
fs.writeFileSync(DIR + '/token-meta.json', JSON.stringify(meta));

// ---- 4. Топ монет по числу филлов ----
const byToken = {};
for (const f of fills) {
  for (const [a, side] of [[f.makerAsset, 'sell'], [f.takerAsset, 'buy']]) {
    byToken[a] = byToken[a] || { sym: meta[a].symbol, fills: 0 };
    byToken[a].fills++;
  }
}
console.log('\nТоп-20 токенов по участию в филлах:');
Object.entries(byToken).sort((a, b) => b[1].fills - a[1].fills).slice(0, 20)
  .forEach(([a, v]) => console.log(`  ${v.sym.padEnd(12)} ${a}  — ${v.fills}`));
