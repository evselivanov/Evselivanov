import fs from 'fs';
const DIR = '/tmp/claude-0/-home-user-Evselivanov/b8b3e960-1c98-5f52-95c4-8a9c5deff3c3/scratchpad';
const OUT = DIR + '/fills-24h.jsonl';
const STATE = DIR + '/collect-state.json';

const ENDPOINTS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed4.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed2.defibit.io',
  'https://bsc-dataseed1.ninicoin.io',
  'https://bsc-dataseed2.ninicoin.io',
  'https://bsc.meowrpc.com',
];
const V6 = '0x111111125421ca6dc452d289314280a0f8842a65';
const TOPIC = '0xfec331350fce78ba658e082a71da20ac9f8d798a99b3c79681c8440cbfe77e07';
const WORKERS_PER_EP = 5;

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

const latest = parseInt(await rpcOn(ENDPOINTS[0], 'eth_blockNumber', []), 16);
let START = latest - 115200, END = latest;
let done = 0, matched = 0;
// возобновление после рестарта
let doneSet = null;
if (fs.existsSync(STATE)) {
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  START = st.start; END = st.end;
  doneSet = new Set(st.doneBlocks);
  done = doneSet.size;
  console.log(`Возобновление: ${done} блоков уже обработано`);
} else {
  fs.writeFileSync(OUT, '');
}
const doneBlocks = doneSet ? [...doneSet] : [];

const queue = [];
for (let n = START; n <= END; n++) if (!doneSet || !doneSet.has(n)) queue.push(n);
const total = END - START + 1;
console.log(`Диапазон ${START}…${END} (${total} блоков), в очереди ${queue.length}`);

let qi = 0;
const retries = [];
const t0 = Date.now();

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
        const hit = r.logs.some(l => l.address.toLowerCase() === V6 && l.topics[0] === TOPIC);
        if (hit) {
          matched++;
          fs.appendFileSync(OUT, JSON.stringify({ block: n, txHash: r.transactionHash,
            from: r.from, to: r.to, status: r.status, gasUsed: r.gasUsed, logs: r.logs }) + '\n');
        }
      }
      done++; doneBlocks.push(n); fails = 0;
      if (done % 2000 === 0) {
        const rate = done / ((Date.now() - t0) / 1000);
        console.log(`${done}/${total} | найдено tx: ${matched} | ${rate.toFixed(0)} блк/с | ETA ${((total - done) / rate / 60).toFixed(0)} мин`);
        fs.writeFileSync(STATE, JSON.stringify({ start: START, end: END, doneBlocks }));
      }
    } catch (e) {
      retries.push(n);
      fails++;
      await new Promise(r => setTimeout(r, Math.min(500 * fails, 10000)));
      if (fails > 20) { console.log(`Эндпоинт ${url} отключён после 20 ошибок подряд`); return; }
    }
  }
}

await Promise.all(ENDPOINTS.flatMap(u => Array.from({ length: WORKERS_PER_EP }, () => worker(u))));
fs.writeFileSync(STATE, JSON.stringify({ start: START, end: END, doneBlocks }));
console.log(`ГОТОВО: обработано ${done}/${total} блоков, найдено ${matched} транзакций с OrderFilled за ${((Date.now()-t0)/60000).toFixed(1)} мин`);
if (done < total) console.log(`ВНИМАНИЕ: ${total - done} блоков не обработано (перезапусти для добора)`);
