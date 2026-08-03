import fs from 'fs';
const DIR = '/tmp/claude-0/-home-user-Evselivanov/b8b3e960-1c98-5f52-95c4-8a9c5deff3c3/scratchpad';
const OUT = DIR + '/swaps-full.jsonl';
const STATE = DIR + '/swaps-full-state.json';

const ENDPOINTS = [
  'https://bsc-dataseed.binance.org','https://bsc-dataseed1.binance.org','https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org','https://bsc-dataseed4.binance.org','https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed2.defibit.io','https://bsc-dataseed1.ninicoin.io','https://bsc-dataseed2.ninicoin.io',
  'https://bsc.meowrpc.com',
];
const { map } = JSON.parse(fs.readFileSync(DIR + '/universe.json', 'utf8'));
// исключаем из триггеров котировочные и сверхликвидные обёртки (иначе датасет = весь BSC)
const EXCLUDE = new Set([
  '0x55d398326f99059ff775485246999027b3197955','0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  '0xe9e7cea3dedca5984780bafc599bd69add087d56','0xc5f0f7b66764f6ec8c8dff7ba683102295e16409',
  '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3','0x14016e85a25aeb13065688cafb43044c2ef86784',
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',
  '0x2170ed0880ac9a755fd29b2688956bd959f933f8','0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
]);
const TARGET = new Set(Object.keys(map).filter(a => !EXCLUDE.has(a)));
const TR = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const V2SWAP = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const V3SWAP = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';

async function rpcOn(url, method, params, timeout = 20000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }), signal: ctrl.signal });
    const j = await res.json();
    if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 80));
    return j.result;
  } finally { clearTimeout(t); }
}

const START = 113627786, END = 113742986;
let done = 0, kept = 0;
let doneSet = null;
if (fs.existsSync(STATE)) {
  doneSet = new Set(JSON.parse(fs.readFileSync(STATE, 'utf8')).doneBlocks);
  done = doneSet.size;
  console.log(`Возобновление: ${done} блоков готово`);
} else fs.writeFileSync(OUT, '');
const doneBlocks = doneSet ? [...doneSet] : [];
const queue = [];
for (let n = START; n <= END; n++) if (!doneSet || !doneSet.has(n)) queue.push(n);
console.log(`В очереди ${queue.length} блоков, целевых токенов: ${TARGET.size}`);

let qi = 0; const retries = []; const t0 = Date.now(); const total = END - START + 1;
async function worker(url) {
  let fails = 0;
  while (true) {
    let n;
    if (qi < queue.length) n = queue[qi++];
    else if (retries.length) n = retries.pop();
    else return;
    try {
      const receipts = await rpcOn(url, 'eth_getBlockReceipts', ['0x' + n.toString(16)]);
      for (const r of receipts) {
        if (r.status !== '0x1') continue;
        let touches = false;
        for (const l of r.logs) if (l.topics[0] === TR && TARGET.has(l.address.toLowerCase())) { touches = true; break; }
        if (!touches) continue;
        const swaps = r.logs.filter(l => l.topics[0] === V2SWAP || l.topics[0] === V3SWAP)
          .map(l => ({ p: l.address.toLowerCase(), v: l.topics[0] === V2SWAP ? 2 : 3, d: l.data }));
        if (!swaps.length) continue;
        kept++;
        fs.appendFileSync(OUT, JSON.stringify({ b: n, tx: r.transactionHash, s: swaps }) + '\n');
      }
      done++; doneBlocks.push(n); fails = 0;
      if (done % 5000 === 0) {
        const rate = done / ((Date.now() - t0) / 1000);
        console.log(`${done}/${total} | сделок-tx: ${kept} | ${rate.toFixed(0)} блк/с | ETA ${((total - done) / rate / 60).toFixed(0)} мин`);
        fs.writeFileSync(STATE, JSON.stringify({ doneBlocks }));
      }
    } catch (e) {
      retries.push(n); fails++;
      await new Promise(r => setTimeout(r, Math.min(500 * fails, 10000)));
      if (fails > 20) { console.log(`${url} отключён`); return; }
    }
  }
}
await Promise.all(ENDPOINTS.flatMap(u => Array.from({ length: 5 }, () => worker(u))));
fs.writeFileSync(STATE, JSON.stringify({ doneBlocks }));
console.log(`ГОТОВО: ${done}/${total} блоков, ${kept} транзакций со свопами за ${((Date.now()-t0)/60000).toFixed(1)} мин`);
