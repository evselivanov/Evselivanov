#!/usr/bin/env python3
"""
Выгрузка сырых данных гео-заблокированных бирж с телефона (a-Shell mini).
Binance и Bybit недоступны из облака (451/403), Bitmart из облака отдаёт
обрезанный листинг (64 пары) — эти три выгружаем с телефона.

Ключи: из переменных окружения (B_KEY/B_SECRET, BY_KEY/BY_SECRET) или из
файла keys.json рядом со скриптом: {"B_KEY": "...", "B_SECRET": "...",
"BY_KEY": "...", "BY_SECRET": "..."}. Файл keys.json никуда не отправлять!

Результат — папка dumps/ с пятью JSON-файлами. Их прислать в облачную сессию.
"""

import hashlib, hmac, json, os, time, urllib.parse, urllib.request

KEYS = {}
if os.path.exists("keys.json"):
    with open("keys.json") as f:
        KEYS = json.load(f)

def key(name):
    return os.environ.get(name) or KEYS.get(name, "")

UA = {"User-Agent": "Mozilla/5.0"}

def get(url, extra={}):
    req = urllib.request.Request(url, headers={**UA, **extra})
    return json.load(urllib.request.urlopen(req, timeout=60))

def save(name, data):
    os.makedirs("dumps", exist_ok=True)
    with open(os.path.join("dumps", name), "w") as f:
        json.dump(data, f)
    print(f"{name}: {len(data)} записей")

def dump_binance():
    q = urllib.parse.urlencode({"timestamp": int(time.time() * 1000), "recvWindow": 10000})
    sig = hmac.new(key("B_SECRET").encode(), q.encode(), hashlib.sha256).hexdigest()
    data = get(f"https://api.binance.com/sapi/v1/capital/config/getall?{q}&signature={sig}",
               {"X-MBX-APIKEY": key("B_KEY")})
    save("binance_coins.json", data)

def dump_bybit():
    info = get("https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000")
    save("bybit_markets.json", info["result"]["list"])
    ts, recv = str(int(time.time() * 1000)), "10000"
    sig = hmac.new(key("BY_SECRET").encode(), (ts + key("BY_KEY") + recv).encode(),
                   hashlib.sha256).hexdigest()
    data = get("https://api.bybit.com/v5/asset/coin/query-info",
               {"X-BAPI-API-KEY": key("BY_KEY"), "X-BAPI-TIMESTAMP": ts,
                "X-BAPI-RECV-WINDOW": recv, "X-BAPI-SIGN": sig})
    save("bybit_coins.json", data["result"]["rows"])

def dump_bitmart():
    syms = get("https://api-cloud.bitmart.com/spot/v1/symbols/details")["data"]["symbols"]
    save("bitmart_symbols.json", syms)
    cur = get("https://api-cloud.bitmart.com/account/v1/currencies")["data"]["currencies"]
    save("bitmart_currencies.json", cur)

if __name__ == "__main__":
    for name, fn in [("Binance", dump_binance), ("Bybit", dump_bybit),
                     ("Bitmart", dump_bitmart)]:
        try:
            fn()
        except Exception as e:
            print(f"{name}: ОШИБКА — {e}")
    print("Готово. Пришлите файлы из папки dumps/ в облачную сессию.")
