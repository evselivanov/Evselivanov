const RPC = 'https://bsc-dataseed.binance.org/';
let id = 0;
async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++id }),
  });
  const { result, error } = await res.json();
  if (error) throw new Error(error.message);
  return result;
}

const routers = {
  '0x111111125421ca6dc452d289314280a0f8842a65': 'V6',
  '0x1111111254eeb25477b68fb85ed929f73a960582': 'V5',
  '0x1111111254fb6c44bac0bed2854e76f90643097d': 'V4',
};
const selectors = {
  '0x07ed2379': 'swap',
  '0x83800a8e': 'unoswap (V6)',
  '0x8770ba91': 'unoswap2 (V6)',
  '0x19367472': 'unoswap3 (V6)',
  '0x0502b1c5': 'unoswap (V5)',
  '0x12aa3caf': 'swap (V5)',
  '0xe449022e': 'uniswapV3Swap',
  '0xd2d374e5': 'unoswapTo (V6)',
  '0xea76dddf': 'unoswapTo2 (V6)',
  '0x9fda64bd': 'clipperSwap',
  '0xf497df75': 'fillOrderArgs (V6 limit)',
};

const latest = parseInt(await rpc('eth_blockNumber'), 16);
const N = 300;
console.log(`Сканирую блоки ${latest - N + 1}…${latest}`);

const found = [];
for (let start = latest - N + 1; start <= latest; start += 20) {
  const batch = [];
  for (let n = start; n < Math.min(start + 20, latest + 1); n++)
    batch.push(rpc('eth_getBlockByNumber', ['0x' + n.toString(16), true]).catch(() => null));
  for (const b of await Promise.all(batch)) {
    if (!b) continue;
    for (const tx of b.transactions)
      if (tx.to && routers[tx.to.toLowerCase()])
        found.push({ block: parseInt(b.number, 16), hash: tx.hash, from: tx.from,
          router: routers[tx.to.toLowerCase()], sel: tx.input.slice(0, 10),
          valueBNB: parseInt(tx.value, 16) / 1e18 });
  }
}

console.log(`\nНайдено транзакций через 1inch: ${found.length} за ${N} блоков (~${Math.round(N*0.75)} сек)\n`);
for (const t of found.slice(0, 8)) {
  const method = selectors[t.sel] || `метод ${t.sel}`;
  console.log(`блок ${t.block} | ${t.router} | ${method} | от ${t.from.slice(0,10)}… | ${t.valueBNB ? t.valueBNB.toFixed(4) + ' BNB' : 'токен→токен'}`);
  console.log(`  ${t.hash}`);
}

// Разбор одной транзакции глубже: чек receipt + Transfer-события
if (found.length) {
  const t = found[0];
  const r = await rpc('eth_getTransactionReceipt', [t.hash]);
  const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  console.log(`\nДетальный разбор ${t.hash}:`);
  console.log(`  статус: ${r.status === '0x1' ? 'успех' : 'ошибка'}, газ: ${parseInt(r.gasUsed,16)}`);
  for (const log of r.logs.filter(l => l.topics[0] === TRANSFER).slice(0, 6)) {
    const from = '0x' + log.topics[1].slice(26), to = '0x' + log.topics[2].slice(26);
    console.log(`  Transfer токена ${log.address.slice(0,12)}…: ${from.slice(0,10)}… → ${to.slice(0,10)}…, кол-во (raw): ${BigInt(log.data)}`);
  }
}
