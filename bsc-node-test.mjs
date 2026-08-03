const RPC = 'https://bsc-dataseed.binance.org/';
async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const { result, error } = await res.json();
  if (error) throw new Error(error.message);
  return result;
}
const chainId = parseInt(await rpc('eth_chainId'), 16);
const block = parseInt(await rpc('eth_blockNumber'), 16);
const gas = parseInt(await rpc('eth_gasPrice'), 16) / 1e9;
const b = await rpc('eth_getBlockByNumber', ['latest', false]);
console.log('chainId:', chainId);
console.log('блок:', block);
console.log('газ (gwei):', gas);
console.log('транзакций в последнем блоке:', b.transactions.length);
console.log('время блока:', new Date(parseInt(b.timestamp, 16) * 1000).toISOString());
