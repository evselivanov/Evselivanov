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

// Известные адреса роутеров 1inch (одинаковы во всех EVM-сетях)
const routers = {
  'AggregationRouterV6': '0x111111125421cA6dc452d289314280a0f8842A65',
  'AggregationRouterV5': '0x1111111254EEB25477B68fb85Ed929f73A960582',
  'AggregationRouterV4': '0x1111111254fb6c44bAC0beD2854e76F90643097d',
};
for (const [name, addr] of Object.entries(routers)) {
  const code = await rpc('eth_getCode', [addr, 'latest']);
  console.log(`${name} ${addr}: ${code === '0x' ? 'НЕТ контракта' : 'контракт развёрнут, код ' + ((code.length-2)/2) + ' байт'}`);
}
