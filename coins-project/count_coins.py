#!/usr/bin/env python3
"""
Подсчёт уникальных монет на CEX-биржах по сетям.
Критерий: депозит открыт + идут спотовые торги.
Уникальность внутри сети: по адресу контракта и по тикеру.
Каскад: Binance -> MEXC -> Gate -> Bybit -> HTX -> KuCoin -> BingX ->
        Bitget -> CoinEx -> Bitmart -> XT.

Ключи берутся из переменных окружения. Задайте перед запуском, например:
    export B_KEY=...  B_SECRET=...
    export MX_KEY=... MX_SECRET=...
    export G_KEY=...  G_SECRET=...
    export BY_KEY=... BY_SECRET=...
    export H_KEY=...  H_SECRET=...
    export KC_KEY=... KC_SECRET=... KC_PASS=...
    export BX_KEY=... BX_SECRET=...
    export BG_KEY=... BG_SECRET=... BG_PASS=...
    export CX_KEY=... CX_SECRET=...
    export BM_KEY=... BM_SECRET=...
    export XT_KEY=... XT_SECRET=...
Публичные эндпоинты (Gate, Bitget, Bybit-market, CoinEx, Bitmart, XT) работают и без ключей.
"""

import base64, hashlib, hmac, json, os, time, urllib.parse, urllib.request
from collections import Counter

def env(name):
    return os.environ.get(name, "")

B_KEY, B_SECRET = env("B_KEY"), env("B_SECRET")
MX_KEY, MX_SECRET = env("MX_KEY"), env("MX_SECRET")
G_KEY, G_SECRET = env("G_KEY"), env("G_SECRET")
BY_KEY, BY_SECRET = env("BY_KEY"), env("BY_SECRET")
H_KEY, H_SECRET = env("H_KEY"), env("H_SECRET")
KC_KEY, KC_SECRET, KC_PASS = env("KC_KEY"), env("KC_SECRET"), env("KC_PASS")
BX_KEY, BX_SECRET = env("BX_KEY"), env("BX_SECRET")
BG_KEY, BG_SECRET, BG_PASS = env("BG_KEY"), env("BG_SECRET"), env("BG_PASS")
CX_KEY, CX_SECRET = env("CX_KEY"), env("CX_SECRET")
BM_KEY, BM_SECRET = env("BM_KEY"), env("BM_SECRET")
XT_KEY, XT_SECRET = env("XT_KEY"), env("XT_SECRET")

UA = {"User-Agent": "Mozilla/5.0"}
REPORT = []

# Гео-заблокированные из облака биржи можно посчитать по выгрузкам с телефона
# (см. phone_dump.py): если в DUMP_DIR лежит соответствующий JSON, берём его.
DUMP_DIR = os.environ.get("DUMP_DIR", "dumps")

def dump(name):
    p = os.path.join(DUMP_DIR, name)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return None

def log(msg):
    print(msg)
    REPORT.append(str(msg))

def get(url, extra={}):
    req = urllib.request.Request(url, headers={**UA, **extra})
    return json.load(urllib.request.urlopen(req, timeout=60))

def signed_qs(base, key, secret, header):
    q = urllib.parse.urlencode({"timestamp": int(time.time() * 1000), "recvWindow": 10000})
    sig = hmac.new(secret.encode(), q.encode(), hashlib.sha256).hexdigest()
    return get(f"{base}?{q}&signature={sig}", {header: key})

ALIAS = {
    "ERC20": "ETH", "ETHEREUM": "ETH", "ETHEREUMERC20": "ETH", "ETHERC20": "ETH",
    "BEP20": "BSC", "BNBSMARTCHAIN": "BSC", "BNBSMARTCHAINBEP20": "BSC",
    "BEP20BSC": "BSC", "BINANCESMARTCHAIN": "BSC", "BSCBNB": "BSC",
    "TRC20": "TRX", "TRON": "TRX", "TRONTRC20": "TRX", "TRC20WBTC": "TRX",
    "SOLANA": "SOL", "SPL": "SOL", "SOLANASOL": "SOL",
    "POLYGON": "MATIC", "POLYGONPOS": "MATIC", "POL": "MATIC", "POLYGONMATIC": "MATIC",
    "ARBITRUMONE": "ARBITRUM", "ARB": "ARBITRUM", "ARBEVM": "ARBITRUM",
    "ARBITRUMONEARB": "ARBITRUM", "ARBI": "ARBITRUM",
    "OP": "OPTIMISM", "OPETH": "OPTIMISM", "OPTIMISMOP": "OPTIMISM",
    "OPTIMISTICETHEREUM": "OPTIMISM",
    "AVAXCCHAIN": "AVAXC", "CAVAX": "AVAXC", "AVAX": "AVAXC",
    "AVALANCHE": "AVAXC", "AVALANCHECCHAIN": "AVAXC", "AVAC": "AVAXC",
    "TONCOIN": "TON", "THEOPENNETWORK": "TON", "TONCOINTON": "TON",
    "TONNETWORK": "TON", "OPENTON": "TON", "TONMEMO": "TON",
    "APTOS": "APT", "APTOSAPT": "APT",
    "FANTOM": "FTM", "BITCOIN": "BTC", "SEGWITBTC": "BTC", "BTCSEGWIT": "BTC",
    "BASEEVM": "BASE", "BASEMAINNET": "BASE", "BASEETH": "BASE", "BASEERC20": "BASE",
    "ZKSYNCERA": "ZKSYNC", "ZKSERA": "ZKSYNC", "ZKSYNCERAETH": "ZKSYNC",
    "ZKS20": "ZKSYNC", "ZKV2": "ZKSYNC",
    "CHZ2": "CHZ", "CHILIZ": "CHZ", "CHILIZCHAIN": "CHZ", "CHILIZCHAINCHZ": "CHZ",
    "CHILIZCHZ": "CHZ",
    "RIPPLE": "XRP", "RIPPLEXRP": "XRP", "XRPLEDGER": "XRP",
    "LINEAETH": "LINEA",
    "KAIAKLAY": "KAIA", "KLAYTN": "KAIA", "KLAY": "KAIA",
    "CARDANO": "ADA", "CARDANOADA": "ADA",
    "MNT": "MANTLE",
    "KASKRC20": "KRC20", "KASPLEX": "KRC20", "KASPA": "KAS",
    "BTCBRC": "BRC20", "BTCBRC20": "BRC20", "ORDIBTC": "BRC20",
    "RUNESBTC": "RUNES", "BTCRUNES": "RUNES",
    "STELLARNETWORK": "XLM", "STELLARLUMENS": "XLM", "STELLAR": "XLM",
    "LITECOIN": "LTC", "BITCOINCASH": "BCH", "BCHN": "BCH", "BCHSV": "BSV",
    "DOGECOIN": "DOGE", "MONERO": "XMR", "ZCASH": "ZEC", "DECRED": "DCR",
    "ALGORAND": "ALGO", "COSMOS": "ATOM", "ATOM1": "ATOM",
    "POLKADOT": "DOT", "KUSAMA": "KSM",
    "FILECOIN": "FIL", "SIACOIN": "SC", "TEZOS": "XTZ", "HARMONY": "ONE",
    "ETHEREUMCLASSIC": "ETC", "ETHEREUMPOW": "ETHW", "ETHPOW": "ETHW",
    "INTERNETCOMPUTER": "ICP", "ICPCHAT": "ICP", "ICPOGY": "ICP",
    "ELROND": "EGLD", "ELRONDEGOLD": "EGLD",
    "VECHAIN": "VET", "INJECTIVE": "INJ", "CELESTIA": "TIA",
    "BITTENSOR": "TAO", "CASPER": "CSPR", "POLYMESH": "POLYX",
    "AKASH": "AKT", "ICON": "ICX", "LUKSO": "LYX", "ERGO": "ERG",
    "ONTOLOGY": "ONT", "NEARPROTOCOL": "NEAR", "STACKS": "STX",
    "TERRA": "LUNA", "LUNANEW": "LUNA",
    "CRONOS": "CRO", "CRONOSCHAIN": "CRO", "CROCRONOS": "CRO",
    "CONFLUXESPACE": "CFXEVM",
    "SCROLLETH": "SCROLL",
    "STARK": "STARKNET", "STARKETH": "STARKNET", "STRKETH": "STARKNET",
    "MANTAETH": "MANTA", "MANTANETWORK": "MANTA",
    "MODEETH": "MODE", "BLASTETH": "BLAST", "TAIKOETH": "TAIKO",
    "BOBAEVM": "BOBA", "AURORAEVM": "AURORA",
    "ASTR": "ASTAR", "ASTREVM": "ASTAR", "ASTAREVM": "ASTAR", "ASTARNETWORK": "ASTAR",
    "METISTOKEN": "METIS", "XDCNETWORKXDC": "XDC", "OASIS": "ROSE",
    "STATEMINT": "ASSETHUBDOT", "POLKADOTASSETHUB": "ASSETHUBDOT",
    "ASSETHUBPOLKADOT": "ASSETHUBDOT", "DOTSM": "ASSETHUBDOT", "DOTAH": "ASSETHUBDOT",
    "DOTASSETHUB": "ASSETHUBDOT",
    "KSMASSETHUB": "ASSETHUBKSM", "ASSETHUBKUSAMA": "ASSETHUBKSM",
    "KSMSM": "ASSETHUBKSM", "KSMAH": "ASSETHUBKSM", "STATEMINE": "ASSETHUBKSM",
    "LIGHTNINGBTC": "LIGHTNING", "LIGHTNINGNETWORK": "LIGHTNING",
    "ENJIN": "ENJ", "ENJINRELAYCHAIN": "ENJ",
    "XTZEVM": "ETHERLINK", "ETHERLINKXTZ": "ETHERLINK",
    "TELOSEVM": "TELOS", "TLOSEVM": "TELOS", "TLOS": "TELOS", "TELOSZERO": "TELOS",
    "WAXP": "WAX", "WAX1": "WAX",
    "KAVAEVMCOCHAIN": "KAVAEVM",
    "HYPE": "HYPEREVM", "HYPEEVM": "HYPEREVM",
    "XCHNEW": "XCH", "REEFNEW": "REEF", "PINETWORK": "PI",
    "POCKET": "POKT", "POKTSHANNON": "POKT", "POKTCOSMOS": "POKT",
    "DYMENSION": "DYM", "DYMEVM": "DYM",
    "ZETACHAIN": "ZETA", "ZETAEVM": "ZETA",
    "CHEQD": "CHEQ", "NANO": "XNO", "INITIA": "INIT",
    "BOUNCEBIT": "BB", "BABYLON": "BABY", "BBN": "BABY",
    "MOVEMENT": "MOVE", "MOVAMAINNET": "MOVA", "BERACHAIN": "BERA",
    "S": "SONIC", "SHM": "SHARDEUM", "SHMEVM": "SHARDEUM",
    "KLEVER": "KLV", "PROTON": "XPR", "RONIN": "RON", "NIMIQ": "NIM",
    "ARWEAVE": "AR", "FLARE": "FLR", "ECASH": "XEC",
    "ROBINETH": "ROBINHOOD", "ETHROB": "ROBINHOOD",
    "ETHBASE": "BASE", "ETHARB": "ARBITRUM", "ETHOP": "OPTIMISM",
    "ETHBLAST": "BLAST", "ETHLINEA": "LINEA", "ETHZKSYNC": "ZKSYNC",
    "BTCMERLIN": "MERLIN",
    "MERLBTC": "MERLIN", "MERLINBTC": "MERLIN", "BTRBTC": "BITLAYER",
    "COREDAO": "CORE", "CAP20": "CORE", "WORLDCHAIN": "WLD", "OKBEVM": "XLAYER",
    "CANTONNETWORK": "CANTON", "PHAROSMAINNET": "PHAROS",
    "VICTION": "VIC", "TOMO": "VIC", "STRATISEVM": "STRAX", "CHROMIA": "CHR",
    "QUB": "QUBIC", "BITYUAN": "BTY", "NEON3": "NEO3",
    "A": "VAULTA", "EOS": "VAULTA", "EOSIO": "VAULTA",
    "IOTAL1": "IOTA", "PLAYA3ULL": "3ULL", "IMMUTABLEZKEVM": "IMMUTABLE",
    "THORCHAIN": "RUNE", "NEM": "XEM", "ABSTRACT": "ABS", "SOPHON": "SOPH",
    "BELDEX": "BDX", "BELLSCOIN": "BELLS", "SALVIUM1": "SALVIUM",
    "NEOXGAS": "NEOX", "TARI": "XTM", "ETNSC": "ETN", "ETNEVM": "ETN",
    "MOBNEW": "MOB", "XWCXWC": "XWC", "KOMODO": "KMD", "THETATOKEN": "THETA",
    "GT": "GATECHAIN", "GTEVM": "GATECHAIN", "HPPMAINET": "HPP", "FCT2": "FCT",
    "TERRACLASSIC": "LUNC", "HUMANODE": "HMND", "CHIA": "XCH", "HEDERA": "HBAR",
    "VERGE": "XVG", "APECHAIN": "APE", "STABLECHAIN": "STABLE",
}

def norm(s):
    s = str(s)
    if "(" in s and ")" in s:
        inner = s[s.rfind("(") + 1:s.rfind(")")].strip()
        if inner:
            s = inner
    s = "".join(ch for ch in s.upper() if ch.isalnum())
    return ALIAS.get(s, s)

def binance():
    data = dump("binance_coins.json") or signed_qs(
        "https://api.binance.com/sapi/v1/capital/config/getall",
        B_KEY, B_SECRET, "X-MBX-APIKEY")
    return [(c["coin"].upper(), norm(n["network"]), (n.get("contractAddress") or "").lower())
            for c in data if c.get("trading")
            for n in c.get("networkList", []) if n.get("depositEnable")]

def mexc():
    info = get("https://api.mexc.com/api/v3/exchangeInfo")
    trade = {s["baseAsset"].upper() for s in info.get("symbols", [])
             if s.get("isSpotTradingAllowed") or s.get("status") in ("1", "ENABLED", "TRADING")}
    data = signed_qs("https://api.mexc.com/api/v3/capital/config/getall",
                     MX_KEY, MX_SECRET, "X-MEXC-APIKEY")
    return [(c["coin"].upper(), norm(n.get("network") or n.get("netWork")),
             (n.get("contract") or n.get("contractAddress") or "").lower())
            for c in data if c["coin"].upper() in trade
            for n in c.get("networkList", []) if n.get("depositEnable")]

def gate():
    path = "/api/v4/spot/currencies"
    t = str(int(time.time()))
    body_hash = hashlib.sha512(b"").hexdigest()
    extra = {"Accept": "application/json"}
    if G_KEY and G_SECRET:
        sign = hmac.new(G_SECRET.encode(), f"GET\n{path}\n\n{body_hash}\n{t}".encode(),
                        hashlib.sha512).hexdigest()
        extra.update({"KEY": G_KEY, "Timestamp": t, "SIGN": sign})
    data = get("https://api.gateio.ws" + path, extra)
    out = []
    for c in data:
        if c.get("trade_disabled") or c.get("delisted"):
            continue
        chains = c.get("chains") or ([{"name": c["chain"]}] if c.get("chain") else [])
        for ch in chains:
            if ch.get("deposit_disabled", c.get("deposit_disabled")):
                continue
            out.append((c["currency"].upper(), norm(ch.get("name")), (ch.get("addr") or "").lower()))
    return out

def bybit():
    mk = dump("bybit_markets.json")
    if mk is None:
        info = get("https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000")
        mk = info["result"]["list"]
    trade = {s["baseCoin"].upper() for s in mk if s.get("status") == "Trading"}
    rows = dump("bybit_coins.json")
    if rows is None:
        ts, recv = str(int(time.time() * 1000)), "10000"
        sign = hmac.new(BY_SECRET.encode(), (ts + BY_KEY + recv).encode(), hashlib.sha256).hexdigest()
        data = get("https://api.bybit.com/v5/asset/coin/query-info",
                   {"X-BAPI-API-KEY": BY_KEY, "X-BAPI-TIMESTAMP": ts,
                    "X-BAPI-RECV-WINDOW": recv, "X-BAPI-SIGN": sign})
        rows = data["result"]["rows"]
    out = []
    for c in rows:
        if c["coin"].upper() not in trade:
            continue
        for ch in c.get("chains", []):
            if str(ch.get("chainDeposit")) != "1":
                continue
            out.append((c["coin"].upper(), norm(ch.get("chain") or ch.get("chainType")),
                        (ch.get("contractAddress") or "").lower()))
    return out

def htx():
    syms = get("https://api.huobi.pro/v1/common/symbols")["data"]
    trade = {s["base-currency"].upper() for s in syms if s.get("state") == "online"}
    params = {"AccessKeyId": H_KEY, "SignatureMethod": "HmacSHA256",
              "SignatureVersion": "2",
              "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())}
    q = urllib.parse.urlencode(sorted(params.items()))
    payload = f"GET\napi.huobi.pro\n/v2/reference/currencies\n{q}"
    sig = base64.b64encode(hmac.new(H_SECRET.encode(), payload.encode(),
                                    hashlib.sha256).digest()).decode()
    data = get(f"https://api.huobi.pro/v2/reference/currencies?{q}&Signature="
               + urllib.parse.quote(sig, safe=""))["data"]
    out = []
    for c in data:
        if c["currency"].upper() not in trade:
            continue
        for ch in c.get("chains", []):
            if ch.get("depositStatus") != "allowed":
                continue
            out.append((c["currency"].upper(), norm(ch.get("displayName") or ch.get("chain")),
                        (ch.get("contractAddress") or "").lower()))
    return out

def kucoin():
    syms = get("https://api.kucoin.com/api/v2/symbols")["data"]
    trade = {s["baseCurrency"].upper() for s in syms if s.get("enableTrading")}
    ts, path = str(int(time.time() * 1000)), "/api/v3/currencies"
    sig = base64.b64encode(hmac.new(KC_SECRET.encode(), (ts + "GET" + path).encode(),
                                    hashlib.sha256).digest()).decode()
    pp = base64.b64encode(hmac.new(KC_SECRET.encode(), KC_PASS.encode(),
                                   hashlib.sha256).digest()).decode()
    data = get("https://api.kucoin.com" + path,
               {"KC-API-KEY": KC_KEY, "KC-API-SIGN": sig, "KC-API-TIMESTAMP": ts,
                "KC-API-PASSPHRASE": pp, "KC-API-KEY-VERSION": "3"})["data"]
    return [(c["currency"].upper(), norm(ch.get("chainName") or ch.get("chainId")),
             (ch.get("contractAddress") or "").lower())
            for c in data if c["currency"].upper() in trade
            for ch in (c.get("chains") or []) if ch.get("isDepositEnabled")]

def bingx():
    p = get("https://open-api.bingx.com/openApi/spot/v1/common/symbols")
    syms = (p.get("data") or {}).get("symbols")
    if syms is None:
        raise RuntimeError("symbols: " + str(p)[:150])
    trade = {s["symbol"].split("-")[0].upper() for s in syms}
    data, errs = None, []
    for path in ("/openApi/wallets/v1/capital/config/getall",
                 "/openApi/wallet/v1/capital/config/getall"):
        q = urllib.parse.urlencode({"timestamp": int(time.time() * 1000), "recvWindow": 10000})
        sig = hmac.new(BX_SECRET.encode(), q.encode(), hashlib.sha256).hexdigest()
        try:
            p = get(f"https://open-api.bingx.com{path}?{q}&signature={sig}",
                    {"X-BX-APIKEY": BX_KEY})
        except Exception as e:
            errs.append(f"{path}: {e}")
            continue
        data = p.get("data")
        if data is not None:
            break
        errs.append(f"{path}: {str(p)[:100]}")
    if data is None:
        raise RuntimeError(" | ".join(errs))
    return [((c.get("coin") or c.get("name")).upper(), norm(n.get("network")),
             (n.get("contractAddress") or n.get("contract") or "").lower())
            for c in data if (c.get("coin") or c.get("name")).upper() in trade
            for n in c.get("networkList", []) if n.get("depositEnable")]

def bitget():
    syms = get("https://api.bitget.com/api/v2/spot/public/symbols")["data"]
    trade = {s["baseCoin"].upper() for s in syms if s.get("status") == "online"}
    data = get("https://api.bitget.com/api/v2/spot/public/coins")["data"]
    return [(c["coin"].upper(), norm(ch.get("chain")), (ch.get("contractAddress") or "").lower())
            for c in data if c["coin"].upper() in trade
            for ch in (c.get("chains") or []) if str(ch.get("rechargeable")).lower() == "true"]

def coinex():
    mk = get("https://api.coinex.com/v2/spot/market")["data"]
    trade = {m["base_ccy"].upper() for m in mk}
    cfg = get("https://api.coinex.com/v2/assets/all-deposit-withdraw-config")["data"]
    out = []
    for item in cfg:
        a = item.get("asset") or {}
        sym = (a.get("ccy") or "").upper()
        if sym not in trade:
            continue
        for ch in item.get("chains") or []:
            if not ch.get("deposit_enabled", ch.get("can_deposit")):
                continue
            out.append((sym, norm(ch.get("chain")), (ch.get("contract_address") or "").lower()))
    return out

def bitmart():
    # Из облака (US-IP) Bitmart отдаёт обрезанный листинг (~64 пары) —
    # полный список пар и валют кладите выгрузкой с телефона в dumps/.
    syms = dump("bitmart_symbols.json")
    if syms is None:
        syms = get("https://api-cloud.bitmart.com/spot/v1/symbols/details")["data"]["symbols"]
    trade = {s["base_currency"].upper() for s in syms if s.get("trade_status") == "trading"}
    cur = dump("bitmart_currencies.json")
    if cur is None:
        cur = get("https://api-cloud.bitmart.com/account/v1/currencies")["data"]["currencies"]
    out = []
    for c in cur:
        cid = str(c.get("currency") or c.get("id") or "")
        sym = cid.split("-")[0].upper()
        if sym not in trade or c.get("deposit_enabled") is False:
            continue
        net = c.get("network") or (cid.split("-", 1)[1] if "-" in cid else sym)
        out.append((sym, norm(net), (c.get("contract_address") or "").lower()))
    return out

def xt():
    syms = get("https://sapi.xt.com/v4/public/symbol")["result"]["symbols"]
    trade = {s["baseCurrency"].upper() for s in syms if s.get("state") in ("ONLINE", None)}
    cur = get("https://sapi.xt.com/v4/public/wallet/support/currency")["result"]
    return [(c["currency"].upper(), norm(ch.get("chain")), "")
            for c in cur if c["currency"].upper() in trade
            for ch in (c.get("supportChains") or []) if ch.get("depositEnabled")]

# --- кандидаты (публичные, ключи не нужны). Раскомментируйте в ORDER, чтобы включить. ---

def coinbase():
    prods = get("https://api.exchange.coinbase.com/products")
    trade = {p["base_currency"].upper() for p in prods if not p.get("trading_disabled")}
    out = []
    for c in get("https://api.exchange.coinbase.com/currencies"):
        sym = str(c.get("id") or "").upper()
        if sym not in trade or c.get("status") != "online":
            continue
        for n in c.get("supported_networks") or []:
            if n.get("status") in (None, "online"):
                out.append((sym, norm(n.get("id") or n.get("name")),
                            (n.get("contract_address") or "").lower()))
    return out

def poloniex():
    mk = get("https://api.poloniex.com/markets")
    trade = {m["symbol"].split("_")[0].upper() for m in mk
             if str(m.get("state", "NORMAL")).upper() in ("NORMAL", "ONLINE")}
    out = []
    for c in get("https://api.poloniex.com/v2/currencies"):
        sym = str(c.get("coin") or c.get("currency") or "").upper()
        if sym not in trade:
            continue
        for n in c.get("networkList") or []:
            dep, contract = None, ""
            for k, v in n.items():
                kl = k.lower()
                if "deposit" in kl and dep is None and not isinstance(v, (dict, list)):
                    dep = v
                if "contract" in kl and isinstance(v, str) and len(v) > 8:
                    contract = v
            if dep in (False, 0, "false", "DISABLED", "disabled"):
                continue
            out.append((sym, norm(n.get("blockchain") or n.get("network")
                                  or n.get("chainName") or n.get("name")), contract.lower()))
    return out

def backpack():
    mk = get("https://api.backpack.exchange/api/v1/markets")
    trade = {str(m.get("baseSymbol") or "").upper() for m in mk}
    out = []
    for c in get("https://api.backpack.exchange/api/v1/assets"):
        sym = str(c.get("symbol") or "").upper()
        if trade and sym not in trade:
            continue
        for t in c.get("tokens") or []:
            if t.get("depositEnabled") is False:
                continue
            out.append((sym, norm(t.get("blockchain") or t.get("chain") or ""),
                        (t.get("contractAddress") or "").lower()))
    return out

def cointr():
    syms = get("https://api.cointr.com/api/v2/spot/public/symbols")["data"]
    trade = {s["baseCoin"].upper() for s in syms if s.get("status") == "online"}
    data = get("https://api.cointr.com/api/v2/spot/public/coins")["data"]
    return [(c["coin"].upper(), norm(ch.get("chain")), (ch.get("contractAddress") or "").lower())
            for c in data if c["coin"].upper() in trade
            for ch in (c.get("chains") or []) if str(ch.get("rechargeable")).lower() == "true"]

def weex():
    prods = get("https://api-spot.weex.com/api/v2/public/products")["data"]
    trade = set()
    for s in prods:
        s = s.split("_")[0].upper()
        for q in ("USDT", "USDC", "BTC", "ETH"):
            if s.endswith(q) and len(s) > len(q):
                trade.add(s[:-len(q)])
                break
    data = get("https://api-spot.weex.com/api/v2/public/currencies")["data"]
    return [(c["coinName"].upper(), norm(ch.get("chain")),
             (ch.get("contractAddress") or "").lower())
            for c in data if str(c.get("coinName") or "").upper() in trade
            for ch in (c.get("chains") or [])
            if str(ch.get("rechargeable")).lower() == "true"]

# --- Каскад. Добавьте кандидатов в конец списка, чтобы учесть их монеты. ---
ORDER = [("Binance", binance), ("MEXC", mexc), ("Gate", gate), ("Bybit", bybit),
         ("HTX", htx), ("KuCoin", kucoin), ("BingX", bingx), ("Bitget", bitget),
         ("CoinEx", coinex), ("Bitmart", bitmart), ("XT", xt)]
# ("Coinbase", coinbase), ("Poloniex", poloniex), ("Backpack", backpack), ("WEEX", weex), ("CoinTR", cointr)

def main():
    seen = set()
    new_net = {}
    for ex, fn in ORDER:
        new_net[ex] = Counter()
        try:
            rows = fn()
        except Exception as e:
            log(f"{ex}: ОШИБКА — {e}")
            continue
        for sym, net, contract in rows:
            if net == "ITSNOTACHAIN":   # премаркет Gate — исключаем
                continue
            kc = (net, "C:" + contract) if contract else None
            ks = (net, "S:" + sym)
            if ks not in seen and (kc is None or kc not in seen):
                new_net[ex][net] += 1
            seen.add(ks)
            if kc:
                seen.add(kc)
        log(f"{ex}: {len(rows)} записей, новых уникальных: {sum(new_net[ex].values())}")

    nets = set()
    for ex in new_net:
        nets |= set(new_net[ex])
    uniq = {n: sum(new_net[ex].get(n, 0) for ex in new_net) for n in nets}
    big = {n: v for n, v in uniq.items() if v > 5}
    other = sum(v for n, v in uniq.items() if v <= 5)

    log(f"\n{'Сеть':<15}{'Уникум':>8}")
    log("-" * 23)
    for n in sorted(big, key=big.get, reverse=True):
        log(f"{n[:14]:<15}{uniq[n]:>8}")
    log("-" * 23)
    log(f"{'прочие(<=5)':<15}{other:>8}")
    log(f"\nИТОГО сетей: {len(nets)} (в таблице: {len(big)})")
    log(f"ИТОГО уникальных монет: {sum(uniq.values())}")

    with open("report.txt", "w") as f:
        f.write("\n".join(REPORT) + "\n")

    exs = [e for e, _ in ORDER]
    with open("networks.csv", "w") as f:
        f.write("network;" + ";".join(exs) + ";total\n")
        for n in sorted(uniq, key=uniq.get, reverse=True):
            f.write(n + ";" + ";".join(str(new_net[e].get(n, 0)) for e in exs) + f";{uniq[n]}\n")

    html = ["<!doctype html><html><head><meta charset='utf-8'>",
            "<meta name='viewport' content='width=device-width, initial-scale=1'>",
            "<style>body{font-family:-apple-system,sans-serif;margin:12px}",
            "table{border-collapse:collapse;font-size:13px}",
            "th,td{border:1px solid #bbb;padding:3px 6px;text-align:right;white-space:nowrap}",
            "th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:#fff}",
            "thead th{position:sticky;top:0;background:#e8e8e8}",
            "tr:nth-child(even) td{background:#f6f6f6}</style></head><body>",
            "<h3>Уникальные монеты по сетям и биржам</h3>",
            "<p style='font-size:12px'>" + "<br>".join(
                x for x in REPORT if "записей" in x or "ОШИБКА" in x) + "</p>",
            "<table><thead><tr><th>Сеть</th>"
            + "".join("<th>" + e + "</th>" for e in exs) + "<th>Итого</th></tr></thead><tbody>"]
    for n in sorted(uniq, key=uniq.get, reverse=True):
        html.append("<tr><td>" + n + "</td>"
                    + "".join("<td>" + (str(new_net[e].get(n, 0)) if new_net[e].get(n, 0) else "")
                              + "</td>" for e in exs)
                    + "<td><b>" + str(uniq[n]) + "</b></td></tr>")
    html.append("<tr><td><b>ИТОГО</b></td>"
                + "".join("<td><b>" + str(sum(new_net[e].values())) + "</b></td>" for e in exs)
                + "<td><b>" + str(sum(uniq.values())) + "</b></td></tr>")
    html.append("</tbody></table></body></html>")
    with open("report.html", "w") as f:
        f.write("\n".join(html))
    print("\nСохранено: report.txt, networks.csv, report.html")

if __name__ == "__main__":
    main()
