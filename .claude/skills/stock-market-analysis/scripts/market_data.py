#!/usr/bin/env python3
"""
market_data.py - 주식 시장 데이터 수집 CLI (한국/미국 통합)

Python 표준 라이브러리만 사용합니다. 외부 패키지 설치가 필요 없습니다.
모든 명령은 기본적으로 JSON을 stdout으로 출력하며, --format text 로 사람이 읽기 좋은
요약을 낼 수 있습니다. 실패한 소스는 결과 안에서 "errors" 로 보고되고, 나머지 데이터는
그대로 반환합니다(부분 실패가 전체 분석을 막지 않도록).

사용 예:
    python market_data.py search "삼성전자"
    python market_data.py quote 005930 AAPL
    python market_data.py fundamentals 005930
    python market_data.py technicals AAPL --range 1y
    python market_data.py sentiment
    python market_data.py peers 005930
    python market_data.py report 005930 --format text
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
TIMEOUT = 20

# Yahoo quoteSummary는 세션 쿠키 + crumb 토큰을 요구합니다. 프로세스당 한 번만 발급받아
# 재사용하도록 모듈 전역에 캐싱합니다.
_yahoo_opener = None
_yahoo_crumb = None


# --------------------------------------------------------------------------
# HTTP 하부 계층
# --------------------------------------------------------------------------
def http_json(url: str, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def yahoo_session():
    """쿠키 + crumb을 확보한 opener를 반환합니다 (quoteSummary 전용)."""
    global _yahoo_opener, _yahoo_crumb
    if _yahoo_opener is not None:
        return _yahoo_opener, _yahoo_crumb

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", UA)]
    try:
        # 이 요청은 404를 반환하지만 필요한 세션 쿠키를 심어줍니다.
        opener.open("https://fc.yahoo.com", timeout=TIMEOUT).read()
    except Exception:
        pass
    try:
        crumb = opener.open(
            "https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=TIMEOUT
        ).read().decode()
    except Exception:
        crumb = None

    _yahoo_opener, _yahoo_crumb = opener, crumb
    return opener, crumb


def yahoo_quote_summary(symbol: str, modules: list[str]) -> dict:
    opener, crumb = yahoo_session()
    if not crumb:
        raise RuntimeError("Yahoo crumb 발급 실패")
    url = (
        f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/"
        f"{urllib.parse.quote(symbol)}?modules={','.join(modules)}"
        f"&crumb={urllib.parse.quote(crumb)}"
    )
    with opener.open(url, timeout=TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
    results = (data.get("quoteSummary") or {}).get("result") or []
    return results[0] if results else {}


def raw(node, key, default=None):
    """Yahoo의 {"raw": x, "fmt": "..."} 래퍼에서 숫자만 꺼냅니다."""
    v = (node or {}).get(key)
    if isinstance(v, dict):
        return v.get("raw", default)
    return v if v is not None else default


# --------------------------------------------------------------------------
# 종목 식별
# --------------------------------------------------------------------------
KR_CODE = re.compile(r"^\d{6}[A-Z0-9]?$")
TICKER = re.compile(r"^[\^]?[A-Z][A-Z0-9.\-=]*$")


def naver_autocomplete(query: str) -> list[dict]:
    """네이버 종목 자동완성. 한글/영문 모두, 한국/미국 종목 모두 검색됩니다.

    Yahoo 검색은 한글 질의에 400을 반환하므로 이쪽이 1차 소스입니다.
    typeCode(KOSPI/KOSDAQ)를 주기 때문에 .KS/.KQ 접미사 판별에도 씁니다.
    """
    url = (
        "https://ac.stock.naver.com/ac?q="
        f"{urllib.parse.quote(query)}&target=stock%2Cindex%2Cmarketindicator"
    )
    items = http_json(url).get("items", [])
    out = []
    for i in items:
        code = i.get("code", "")
        nation, type_code = i.get("nationCode"), i.get("typeCode")
        if nation == "KOR":
            sym = code + (".KQ" if type_code == "KOSDAQ" else ".KS")
            market = "KR"
        elif nation == "USA":
            sym, market = code, "US"
        else:
            sym, market = code, nation or "?"
        out.append(
            {
                "symbol": sym,
                "name": i.get("name"),
                "exchange": type_code,
                "type": i.get("category"),
                "market": market,
                "naver_code": code if nation == "KOR" else None,
            }
        )
    return out


def yahoo_search(query: str, limit: int = 8) -> list[dict]:
    url = (
        "https://query2.finance.yahoo.com/v1/finance/search?q="
        f"{urllib.parse.quote(query)}&quotesCount={limit}&newsCount=0&lang=en-US"
    )
    out = []
    for q in http_json(url).get("quotes", []):
        sym = q.get("symbol", "")
        out.append(
            {
                "symbol": sym,
                "name": q.get("longname") or q.get("shortname"),
                "exchange": q.get("exchDisp") or q.get("exchange"),
                "type": q.get("quoteType"),
                "market": "KR" if sym.endswith((".KS", ".KQ")) else "US",
                "naver_code": sym[:-3] if sym.endswith((".KS", ".KQ")) else None,
            }
        )
    return out


def search_symbol(query: str, limit: int = 8) -> dict:
    """회사명/티커/코드로 종목을 찾습니다. 두 소스를 합쳐 중복을 제거합니다.

    한글은 Yahoo가 400을 내므로 네이버만, 영문은 양쪽을 조회해 커버리지를 넓힙니다.
    """
    quotes, errors, seen = [], {}, set()
    is_ascii = query.isascii()

    for name, fn in [("naver", naver_autocomplete), ("yahoo", yahoo_search)]:
        if name == "yahoo" and not is_ascii:
            continue  # Yahoo 검색은 비ASCII 질의를 거부합니다
        try:
            for q in fn(query):
                if q["symbol"] and q["symbol"] not in seen:
                    seen.add(q["symbol"])
                    quotes.append({**q, "source": name})
        except Exception as e:
            errors[name] = f"{type(e).__name__}: {e}"

    result = {"query": query, "quotes": quotes[:limit]}
    if errors:
        result["errors"] = errors
    return result


_classify_cache: dict[str, dict] = {}


def classify(symbol: str) -> dict:
    """입력 문자열을 시장/코드로 정규화합니다.

    받아들이는 형태:
      - "005930", "005930.KS", "005930.KQ" -> 한국
      - "AAPL", "^VIX", "BRK-B"            -> 미국
      - "삼성전자", "에코프로"              -> 검색으로 자동 해석(최상위 매치)

    한국 종목의 .KS/.KQ는 네이버 자동완성의 KOSPI/KOSDAQ 구분으로 확정합니다.
    판별에 실패하면 .KS로 가정합니다 - 시세는 네이버로도 조회되므로 치명적이지 않습니다.
    """
    if symbol in _classify_cache:
        return _classify_cache[symbol]
    result = _classify(symbol)
    _classify_cache[symbol] = result
    return result


def _classify(symbol: str) -> dict:
    s = symbol.strip()
    su = s.upper()

    if su.endswith(".KS") or su.endswith(".KQ"):
        return {"input": symbol, "market": "KR", "naver_code": su[:-3], "yahoo_symbol": su,
                "resolved_from": None}

    if KR_CODE.match(su):
        suffix = ".KS"
        try:
            for q in naver_autocomplete(su):
                if q.get("naver_code") == su:
                    suffix = "." + q["symbol"].split(".")[-1]
                    break
        except Exception:
            pass
        return {"input": symbol, "market": "KR", "naver_code": su, "yahoo_symbol": su + suffix,
                "resolved_from": None}

    if TICKER.match(su):
        return {"input": symbol, "market": "US", "naver_code": None, "yahoo_symbol": su,
                "resolved_from": None}

    # 코드도 티커도 아니면 회사명으로 보고 검색해 최상위 매치를 씁니다.
    hits = search_symbol(s, limit=5).get("quotes", [])
    equities = [h for h in hits if h.get("type") in (None, "stock", "EQUITY")] or hits
    if not equities:
        raise RuntimeError(f"'{symbol}' 에 해당하는 종목을 찾지 못했습니다. `search` 명령으로 다른 키워드를 시도하세요.")
    top = equities[0]
    return {
        "input": symbol,
        "market": top["market"],
        "naver_code": top.get("naver_code"),
        "yahoo_symbol": top["symbol"],
        "resolved_from": {"matched_name": top.get("name"), "candidates": [h["symbol"] for h in equities[:5]]},
    }


# --------------------------------------------------------------------------
# 시세 & 기술적 지표
# --------------------------------------------------------------------------
def yahoo_chart(symbol: str, rng: str = "1y", interval: str = "1d") -> dict:
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
        f"?range={rng}&interval={interval}"
    )
    data = http_json(url)
    results = (data.get("chart") or {}).get("result") or []
    if not results:
        raise RuntimeError(f"{symbol}: 시세 데이터 없음")
    return results[0]


def sma(values: list[float], n: int):
    if len(values) < n:
        return None
    return sum(values[-n:]) / n


def rsi(values: list[float], n: int = 14):
    """Wilder RSI. 과매수(>70)/과매도(<30) 판단용."""
    if len(values) < n + 1:
        return None
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = values[i] - values[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    ag, al = gains / n, losses / n
    for i in range(n + 1, len(values)):
        d = values[i] - values[i - 1]
        ag = (ag * (n - 1) + max(d, 0.0)) / n
        al = (al * (n - 1) + max(-d, 0.0)) / n
    if al == 0:
        return 100.0
    rs = ag / al
    return round(100 - 100 / (1 + rs), 2)


def annualized_vol(closes: list[float]):
    if len(closes) < 30:
        return None
    rets = [
        (closes[i] / closes[i - 1] - 1)
        for i in range(1, len(closes))
        if closes[i - 1]
    ]
    if len(rets) < 2:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return round((var ** 0.5) * (252 ** 0.5) * 100, 2)


def prev_close(meta: dict, closes: list[float], price):
    """전일 종가를 고릅니다.

    meta.chartPreviousClose는 "조회 구간 직전"의 종가라 range=5d면 5일 전 값이 됩니다.
    일간 등락률에는 쓸 수 없으므로 시계열의 직전 종가를 사용합니다.
    """
    if meta.get("previousClose") is not None:
        return meta["previousClose"]
    if len(closes) >= 2 and price:
        same_day = abs(closes[-1] - price) / price < 1e-4
        return closes[-2] if same_day else closes[-1]
    return meta.get("chartPreviousClose")


def get_quote(symbol: str) -> dict:
    ident = classify(symbol)
    ch = yahoo_chart(ident["yahoo_symbol"], rng="5d", interval="1d")
    m = ch["meta"]
    price = m.get("regularMarketPrice")
    closes = [c for c in ch["indicators"]["quote"][0]["close"] if c is not None]
    prev = prev_close(m, closes, price)
    out = {
        **ident,
        "name": m.get("longName") or m.get("shortName"),
        "currency": m.get("currency"),
        "exchange": m.get("fullExchangeName"),
        "price": price,
        "previous_close": prev,
        "change_pct": round((price / prev - 1) * 100, 2) if price and prev else None,
        "day_high": m.get("regularMarketDayHigh"),
        "day_low": m.get("regularMarketDayLow"),
        "volume": m.get("regularMarketVolume"),
        "week52_high": m.get("fiftyTwoWeekHigh"),
        "week52_low": m.get("fiftyTwoWeekLow"),
    }
    hi, lo = out["week52_high"], out["week52_low"]
    if price and hi and lo and hi != lo:
        # 52주 밴드 내 위치(0=연저점, 100=연고점). 밸류에이션과 별개로 "지금 비싼가"의 감각.
        out["week52_position_pct"] = round((price - lo) / (hi - lo) * 100, 1)
    return out


def get_technicals(symbol: str, rng: str = "1y") -> dict:
    ident = classify(symbol)
    ch = yahoo_chart(ident["yahoo_symbol"], rng=rng, interval="1d")
    closes = [c for c in ch["indicators"]["quote"][0]["close"] if c is not None]
    if len(closes) < 20:
        raise RuntimeError(f"{symbol}: 지표 계산에 필요한 데이터 부족")

    # 이격도와 수익률의 기준 가격은 현재가로 통일합니다. 마지막 완결 종가를 쓰면
    # 장중에 trade_levels.py 와 다른 이격도가 나와 두 결과를 나란히 놓을 수 없습니다.
    price = ch["meta"].get("regularMarketPrice") or closes[-1]

    def pos(n):
        v = sma(closes, n)
        if not v:
            return None
        return {"value": round(v, 2), "price_vs_sma_pct": round((price / v - 1) * 100, 2)}

    def ret(days):
        # 거래일 기준 근사(1M≈21일). 휴장일 때문에 데이터가 조금 모자랄 수 있으므로,
        # 요청 구간의 90% 이상이 확보됐다면 가장 오래된 종가로 대체해 계산합니다.
        avail = len(closes) - 1
        if avail <= 0:
            return None
        idx = days if avail >= days else (avail if avail >= days * 0.9 else None)
        if idx is None:
            return None
        return round((price / closes[-idx - 1] - 1) * 100, 2)

    return {
        **ident,
        "range": rng,
        "data_points": len(closes),
        "price": round(price, 2),
        "last_completed_close": round(closes[-1], 2),
        "price_basis": "현재가" if ch["meta"].get("regularMarketPrice") else "마지막 종가",
        "sma20": pos(20),
        "sma60": pos(60),
        "sma120": pos(120),
        "rsi14": rsi(closes),
        "annualized_volatility_pct": annualized_vol(closes),
        "returns_pct": {"1m": ret(21), "3m": ret(63), "6m": ret(126), "1y": ret(252)},
        "max_drawdown_pct": max_drawdown(closes),
    }


def max_drawdown(closes: list[float]):
    peak, mdd = closes[0], 0.0
    for c in closes:
        peak = max(peak, c)
        mdd = min(mdd, c / peak - 1)
    return round(mdd * 100, 2)


# --------------------------------------------------------------------------
# 펀더멘털
# --------------------------------------------------------------------------
def naver_integration(code: str) -> dict:
    return http_json(f"https://m.stock.naver.com/api/stock/{code}/integration")


def naver_finance(code: str, period: str = "annual") -> dict:
    return http_json(f"https://m.stock.naver.com/api/stock/{code}/finance/{period}")


def kr_fundamentals(code: str) -> dict:
    integ = naver_integration(code)
    totals = {i.get("code"): i.get("value") for i in integ.get("totalInfos", [])}

    fin = naver_finance(code, "annual")
    info = fin.get("financeInfo", {})
    periods = [t["key"] for t in info.get("trTitleList", [])]
    consensus = {t["key"] for t in info.get("trTitleList", []) if t.get("isConsensus") == "Y"}
    series = {}
    for row in info.get("rowList", []):
        title = row.get("title")
        cols = {k: (v or {}).get("value") for k, v in (row.get("columns") or {}).items()}
        series[title] = {p: cols.get(p) for p in periods}

    # 최근 수급(외국인/기관/개인 순매수)은 정성 판단의 근거로 자주 쓰이므로 함께 실어줍니다.
    flows = [
        {
            "date": d.get("bizdate"),
            "close": d.get("closePrice"),
            "foreigner_net": d.get("foreignerPureBuyQuant"),
            "institution_net": d.get("organPureBuyQuant"),
            "individual_net": d.get("individualPureBuyQuant"),
            "foreigner_hold_ratio": d.get("foreignerHoldRatio"),
        }
        for d in (integ.get("dealTrendInfos") or [])[:10]
    ]

    return {
        "market": "KR",
        "code": code,
        "name": integ.get("stockName"),
        "source": "naver",
        "valuation": {
            "per": totals.get("per"),
            "forward_per": totals.get("cnsPer"),
            "eps": totals.get("eps"),
            "forward_eps": totals.get("cnsEps"),
            "pbr": totals.get("pbr"),
            "bps": totals.get("bps"),
            "dividend_yield": totals.get("dividendYieldRatio"),
            "dividend_per_share": totals.get("dividend"),
            "market_cap": totals.get("marketValue"),
            "foreign_ownership": totals.get("foreignRate"),
        },
        "annual_periods": periods,
        "consensus_periods": sorted(consensus),
        "annual_financials": series,
        "recent_flows": flows,
        "analyst_consensus": integ.get("consensusInfo"),
        "business_description": (integ.get("description") or "").strip() or None,
    }


US_MODULES = [
    "price",
    "summaryDetail",
    "defaultKeyStatistics",
    "financialData",
    "assetProfile",
    "incomeStatementHistory",
]


def us_fundamentals(symbol: str) -> dict:
    d = yahoo_quote_summary(symbol, US_MODULES)
    sd, ks, fd = d.get("summaryDetail", {}), d.get("defaultKeyStatistics", {}), d.get("financialData", {})
    profile = d.get("assetProfile", {})
    price_mod = d.get("price", {})

    income = []
    for st in (d.get("incomeStatementHistory") or {}).get("incomeStatementHistory", []) or []:
        income.append(
            {
                "period": (st.get("endDate") or {}).get("fmt"),
                "revenue": raw(st, "totalRevenue"),
                "operating_income": raw(st, "operatingIncome"),
                "net_income": raw(st, "netIncome"),
            }
        )

    def pct(x):
        return round(x * 100, 2) if isinstance(x, (int, float)) else None

    return {
        "market": "US",
        "code": symbol,
        "name": price_mod.get("longName") or price_mod.get("shortName") or symbol,
        "source": "yahoo",
        "valuation": {
            "per": raw(sd, "trailingPE"),
            "forward_per": raw(sd, "forwardPE"),
            "peg": raw(ks, "pegRatio"),
            "pbr": raw(ks, "priceToBook"),
            "psr": raw(sd, "priceToSalesTrailing12Months"),
            "ev_ebitda": raw(ks, "enterpriseToEbitda"),
            "eps_trailing": raw(ks, "trailingEps"),
            "market_cap": raw(sd, "marketCap"),
            "dividend_yield_pct": pct(raw(sd, "dividendYield") or 0) or None,
            "beta": raw(sd, "beta"),
        },
        "profitability": {
            "roe_pct": pct(raw(fd, "returnOnEquity")),
            "roa_pct": pct(raw(fd, "returnOnAssets")),
            "gross_margin_pct": pct(raw(fd, "grossMargins")),
            "operating_margin_pct": pct(raw(fd, "operatingMargins")),
            "profit_margin_pct": pct(raw(fd, "profitMargins")),
            "revenue_growth_pct": pct(raw(fd, "revenueGrowth")),
            "earnings_growth_pct": pct(raw(fd, "earningsGrowth")),
        },
        "financial_health": {
            "total_cash": raw(fd, "totalCash"),
            "total_debt": raw(fd, "totalDebt"),
            "debt_to_equity": raw(fd, "debtToEquity"),
            "current_ratio": raw(fd, "currentRatio"),
            "free_cashflow": raw(fd, "freeCashflow"),
        },
        "analyst": {
            "recommendation": fd.get("recommendationKey"),
            "target_mean": raw(fd, "targetMeanPrice"),
            "target_high": raw(fd, "targetHighPrice"),
            "target_low": raw(fd, "targetLowPrice"),
            "analyst_count": raw(fd, "numberOfAnalystOpinions"),
        },
        "profile": {
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "employees": profile.get("fullTimeEmployees"),
            "country": profile.get("country"),
            "summary": profile.get("longBusinessSummary"),
        },
        "income_statement_history": income,
    }


def get_fundamentals(symbol: str) -> dict:
    ident = classify(symbol)
    if ident["market"] == "KR":
        return {**ident, **kr_fundamentals(ident["naver_code"])}
    return {**ident, **us_fundamentals(ident["yahoo_symbol"])}


# --------------------------------------------------------------------------
# 시장 심리 (공포/탐욕 지수)
# --------------------------------------------------------------------------
def cnn_fear_greed() -> dict:
    d = http_json(
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        headers={"Referer": "https://edition.cnn.com/", "Origin": "https://edition.cnn.com"},
    )
    fg = d.get("fear_and_greed", {})
    return {
        "score": round(fg.get("score", 0), 1),
        "rating": fg.get("rating"),
        "as_of": fg.get("timestamp"),
        "previous_close": round(fg.get("previous_close", 0), 1),
        "week_ago": round(fg.get("previous_1_week", 0), 1),
        "month_ago": round(fg.get("previous_1_month", 0), 1),
        "year_ago": round(fg.get("previous_1_year", 0), 1),
    }


def index_snapshot(symbol: str, label: str) -> dict:
    ch = yahoo_chart(symbol, rng="1mo", interval="1d")
    m = ch["meta"]
    closes = [c for c in ch["indicators"]["quote"][0]["close"] if c is not None]
    price = m.get("regularMarketPrice") or (closes[-1] if closes else None)

    # meta.chartPreviousClose는 "조회 구간 직전"의 종가라서 1mo 조회 시 한 달 전 값이 됩니다.
    # 일간 등락률을 원하므로 시계열의 마지막 두 종가로 계산하고, meta.previousClose를 우선합니다.
    prev = m.get("previousClose")
    if prev is None and len(closes) >= 2:
        # 시계열 마지막 종가는 대개 현재가와 같은 값(당일)이므로 그 직전 종가를 전일로 봅니다.
        # Yahoo가 소수점 정밀도를 조금 다르게 주는 경우가 있어 상대 오차로 비교합니다.
        same_day = price and abs(closes[-1] - price) / price < 1e-4
        prev = closes[-2] if same_day else closes[-1]

    return {
        "label": label,
        "symbol": symbol,
        "value": round(price, 2) if price else None,
        "change_pct": round((price / prev - 1) * 100, 2) if price and prev else None,
        "month_ago": round(closes[0], 2) if closes else None,
        "change_1m_pct": round((price / closes[0] - 1) * 100, 2) if price and closes else None,
    }


def naver_index(code: str) -> dict:
    d = http_json(f"https://m.stock.naver.com/api/index/{code}/basic")
    return {
        "label": d.get("stockName") or code,
        "symbol": code,
        "value": d.get("closePrice"),
        "change_pct": d.get("fluctuationsRatio"),
        "direction": ((d.get("compareToPreviousPrice") or {}).get("name")),
    }


def get_sentiment() -> dict:
    out = {"indicators": {}, "errors": {}}

    def add(key, fn):
        try:
            out["indicators"][key] = fn()
        except Exception as e:
            out["errors"][key] = f"{type(e).__name__}: {e}"

    add("cnn_fear_greed", cnn_fear_greed)
    add("vix", lambda: index_snapshot("^VIX", "VIX (변동성지수)"))
    add("sp500", lambda: index_snapshot("^GSPC", "S&P 500"))
    add("nasdaq", lambda: index_snapshot("^IXIC", "NASDAQ Composite"))
    add("us10y", lambda: index_snapshot("^TNX", "미국 10년물 금리"))
    add("dollar_index", lambda: index_snapshot("DX-Y.NYB", "달러인덱스"))
    add("kospi", lambda: naver_index("KOSPI"))
    add("kosdaq", lambda: naver_index("KOSDAQ"))
    add("usdkrw", lambda: index_snapshot("KRW=X", "원/달러 환율"))
    add("wti", lambda: index_snapshot("CL=F", "WTI 원유"))
    add("gold", lambda: index_snapshot("GC=F", "금"))

    fg = out["indicators"].get("cnn_fear_greed")
    if fg:
        out["interpretation"] = fear_greed_zone(fg["score"])
    return out


def fear_greed_zone(score: float) -> str:
    if score < 25:
        return "극단적 공포(0-24): 과매도 구간일 가능성. 역발상 매수 관점에서 관찰 대상이나, 하락 추세 지속 여부를 함께 확인해야 합니다."
    if score < 45:
        return "공포(25-44): 위험 회피 심리 우세. 우량주 분할 매수 논의가 나오는 구간입니다."
    if score < 55:
        return "중립(45-54): 뚜렷한 방향성 없음. 개별 종목 펀더멘털이 주가를 좌우합니다."
    if score < 75:
        return "탐욕(55-74): 위험 선호 우세. 추세 추종에 유리하나 신규 진입 시 손절선을 명확히 해야 합니다."
    return "극단적 탐욕(75-100): 과열 구간. 차익 실현과 비중 축소를 검토할 시점입니다."


# --------------------------------------------------------------------------
# 동종업계 비교
# --------------------------------------------------------------------------
def get_peers(symbol: str) -> dict:
    ident = classify(symbol)
    if ident["market"] == "KR":
        integ = naver_integration(ident["naver_code"])
        peers = [
            {
                "code": p.get("itemCode"),
                "name": p.get("stockName"),
                "price": p.get("closePrice"),
                "change_pct": p.get("fluctuationsRatio"),
                "market_cap": p.get("marketValue"),
            }
            for p in (integ.get("industryCompareInfo") or [])
        ]
        return {**ident, "industry_code": integ.get("industryCode"), "peers": peers}

    d = yahoo_quote_summary(ident["yahoo_symbol"], ["assetProfile"])
    profile = d.get("assetProfile", {})
    return {
        **ident,
        "sector": profile.get("sector"),
        "industry": profile.get("industry"),
        "peers": [],
        "note": (
            "미국 종목은 동종업계 목록이 API로 제공되지 않습니다. "
            "sector/industry를 근거로 비교 대상을 직접 지정한 뒤 "
            "`fundamentals` 를 여러 티커에 대해 실행해 비교하세요."
        ),
    }


# --------------------------------------------------------------------------
# 통합 리포트
# --------------------------------------------------------------------------
def get_report(symbol: str, rng: str = "1y") -> dict:
    ident = classify(symbol)
    out = {"symbol": ident, "errors": {}}

    def add(key, fn):
        try:
            out[key] = fn()
        except Exception as e:
            out["errors"][key] = f"{type(e).__name__}: {e}"

    add("quote", lambda: get_quote(symbol))
    add("technicals", lambda: get_technicals(symbol, rng))
    add("fundamentals", lambda: get_fundamentals(symbol))
    add("peers", lambda: get_peers(symbol))
    add("sentiment", get_sentiment)
    return out


# --------------------------------------------------------------------------
# 출력
# --------------------------------------------------------------------------
def fmt(v, suffix=""):
    if v is None:
        return "N/A"
    if isinstance(v, float):
        return f"{v:,.2f}{suffix}"
    if isinstance(v, int):
        return f"{v:,}{suffix}"
    return f"{v}{suffix}"


def render_text(cmd: str, data: dict) -> str:
    L = []
    if cmd == "search":
        L.append(f"검색어: {data['query']}")
        for q in data["quotes"]:
            L.append(f"  {q['symbol']:<14} {q['market']:<3} {q['type'] or '':<8} {q['name'] or ''} ({q['exchange']})")
        return "\n".join(L)

    if cmd == "sentiment":
        L.append("=== 시장 심리 지표 ===")
        for k, v in data["indicators"].items():
            if k == "cnn_fear_greed":
                L.append(f"  CNN 공포탐욕지수 : {v['score']} ({v['rating']}) | 1주전 {v['week_ago']} / 1개월전 {v['month_ago']} / 1년전 {v['year_ago']}")
            else:
                L.append(f"  {v.get('label', k):<18}: {fmt(v.get('value'))} ({fmt(v.get('change_pct'))}%)")
        if data.get("interpretation"):
            L.append(f"\n해석: {data['interpretation']}")
        for k, e in data.get("errors", {}).items():
            L.append(f"  [수집실패] {k}: {e}")
        return "\n".join(L)

    if cmd in ("quote", "technicals", "fundamentals", "peers"):
        return json.dumps(data, ensure_ascii=False, indent=2)

    if cmd == "report":
        q = data.get("quote", {})
        t = data.get("technicals", {})
        f = data.get("fundamentals", {})
        L.append(f"=== {q.get('name') or data['symbol']['input']} ({data['symbol']['yahoo_symbol']}) ===")
        L.append(f"현재가 {fmt(q.get('price'))} {q.get('currency') or ''} ({fmt(q.get('change_pct'))}%) | "
                 f"52주 밴드 위치 {fmt(q.get('week52_position_pct'))}%")
        if t:
            r = t.get("returns_pct", {})
            L.append(f"수익률 1M {fmt(r.get('1m'))}% / 3M {fmt(r.get('3m'))}% / 6M {fmt(r.get('6m'))}% / 1Y {fmt(r.get('1y'))}%")
            L.append(f"RSI14 {fmt(t.get('rsi14'))} | 연변동성 {fmt(t.get('annualized_volatility_pct'))}% | MDD {fmt(t.get('max_drawdown_pct'))}%")
            for n in ("sma20", "sma60", "sma120"):
                s = t.get(n)
                if s:
                    L.append(f"  {n.upper():<7} {fmt(s['value'])} (이격 {fmt(s['price_vs_sma_pct'])}%)")
        if f:
            L.append("\n[밸류에이션]")
            for k, v in (f.get("valuation") or {}).items():
                L.append(f"  {k:<22}: {fmt(v)}")
            if f.get("profitability"):
                L.append("[수익성]")
                for k, v in f["profitability"].items():
                    L.append(f"  {k:<22}: {fmt(v)}")
        s = data.get("sentiment", {}).get("indicators", {}).get("cnn_fear_greed")
        if s:
            L.append(f"\n[시장 심리] CNN 공포탐욕지수 {s['score']} ({s['rating']})")
        for k, e in data.get("errors", {}).items():
            L.append(f"[수집실패] {k}: {e}")
        L.append("\n※ 본 데이터는 정보 제공 목적이며 투자 권유가 아닙니다.")
        return "\n".join(L)

    return json.dumps(data, ensure_ascii=False, indent=2)


def _use_utf8():
    """Windows 콘솔 기본 코덱(cp949)으로는 한글 출력이 깨집니다. argparse가 stderr로
    오류를 쓰기 전에 호출해야 인자 오류 메시지까지 정상 출력됩니다."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def main():
    _use_utf8()
    p = argparse.ArgumentParser(
        description="주식 시장 데이터 수집 CLI (한국/미국)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "command",
        choices=["search", "quote", "technicals", "fundamentals", "sentiment", "peers", "report"],
    )
    p.add_argument("args", nargs="*", help="종목 코드/티커/검색어")
    p.add_argument("--range", default="1y", help="기술적 지표 조회 기간 (1mo/3mo/6mo/1y/2y/5y)")
    p.add_argument("--format", choices=["json", "text"], default="json")
    a = p.parse_args()

    cmd = a.command
    try:
        if cmd == "sentiment":
            result = get_sentiment()
        elif cmd == "search":
            if not a.args:
                p.error("search 명령에는 검색어가 필요합니다")
            result = search_symbol(" ".join(a.args))
        else:
            if not a.args:
                p.error(f"{cmd} 명령에는 종목 코드/티커가 필요합니다")
            fn = {
                "quote": get_quote,
                "fundamentals": get_fundamentals,
                "peers": get_peers,
            }.get(cmd)
            if cmd == "technicals":
                results = [get_technicals(s, a.range) for s in a.args]
            elif cmd == "report":
                results = [get_report(s, a.range) for s in a.args]
            else:
                results = []
                for s in a.args:
                    try:
                        results.append(fn(s))
                    except Exception as e:
                        results.append({"input": s, "error": f"{type(e).__name__}: {e}"})
            result = results[0] if len(results) == 1 else results
    except Exception as e:
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}, ensure_ascii=False))
        sys.exit(1)

    if a.format == "text":
        if isinstance(result, list):
            print("\n\n".join(render_text(cmd, r) for r in result))
        else:
            print(render_text(cmd, result))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
