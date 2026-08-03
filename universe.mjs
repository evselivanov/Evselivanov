import fs from 'fs';
const DIR = '/tmp/claude-0/-home-user-Evselivanov/b8b3e960-1c98-5f52-95c4-8a9c5deff3c3/scratchpad';

// 1. Списки USDT-пар трёх бирж
const bases = { Binance: new Set(), MEXC: new Set(), Gate: new Set() };
try {
  const j = await (await fetch('https://data-api.binance.vision/api/v3/exchangeInfo')).json();
  for (const s of j.symbols) if (s.quoteAsset === 'USDT' && s.status === 'TRADING') bases.Binance.add(s.baseAsset.toUpperCase());
} catch (e) { console.log('Binance list ошибка:', e.message); }
try {
  const j = await (await fetch('https://api.mexc.com/api/v3/exchangeInfo')).json();
  for (const s of j.symbols) if (s.quoteAsset === 'USDT' && s.status === '1') bases.MEXC.add(s.baseAsset.toUpperCase());
} catch (e) { console.log('MEXC list ошибка:', e.message); }
try {
  const j = await (await fetch('https://api.gateio.ws/api/v4/spot/currency_pairs')).json();
  for (const s of j) if (s.quote === 'USDT' && s.trade_status === 'tradable') bases.Gate.add(s.base.toUpperCase());
} catch (e) { console.log('Gate list ошибка:', e.message); }
for (const [k, v] of Object.entries(bases)) console.log(`${k}: ${v.size} монет с парой к USDT`);
const union = new Set([...bases.Binance, ...bases.MEXC, ...bases.Gate]);
console.log('Объединение:', union.size);

// 2. CoinGecko: монета → адрес контракта в BSC
const r = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
const cg = await r.json();
if (!Array.isArray(cg)) { console.log('CoinGecko ответ:', JSON.stringify(cg).slice(0, 200)); process.exit(1); }
console.log('CoinGecko монет всего:', cg.length);
const map = {}; // addr -> {sym, sources}
let matched = 0;
for (const c of cg) {
  const addr = c.platforms?.['binance-smart-chain']?.toLowerCase();
  if (!addr || !addr.startsWith('0x') || addr.length !== 42) continue;
  const sym = (c.symbol || '').toUpperCase();
  if (!union.has(sym)) continue;
  const src = ['Binance', 'MEXC', 'Gate'].filter(e => bases[e].has(sym));
  if (!map[addr]) { map[addr] = { sym, src }; matched++; }
}
console.log(`Монет бирж с контрактом в BSC: ${matched}`);
const bySrc = { Binance: 0, MEXC: 0, Gate: 0 };
for (const v of Object.values(map)) bySrc[v.src[0]]++;
console.log('По приоритетному источнику:', JSON.stringify(bySrc));
fs.writeFileSync(DIR + '/universe.json', JSON.stringify({ map, counts: { Binance: bases.Binance.size, MEXC: bases.MEXC.size, Gate: bases.Gate.size, union: union.size, bscMatched: matched } }));
