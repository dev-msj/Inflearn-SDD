#!/usr/bin/env python3
"""
trade_levels.py - 매매 계획 수립에 필요한 가격 레벨과 리스크 수치를 계산

market_data.py 와 같은 공개 시세를 쓰되, 여기서는 "어디서 사고 어디서 손절하는가"에
필요한 값만 계산합니다. 지지/저항 군집, ATR 기반 손절 거리, 피보나치 되돌림,
거래량 밀집 구간, 포지션 사이징은 손으로 하면 틀리기 쉬워 스크립트가 맡습니다.

이 스크립트는 **레벨을 계산할 뿐 매매를 판단하지 않습니다.** 어느 레벨을 쓸지,
진입할지 말지는 보고서의 펀더멘털 분석과 함께 사람이 결정할 몫입니다.

사용 예:
    python trade_levels.py 005930
    python trade_levels.py AAPL --range 2y --format text
    python trade_levels.py 삼성전자 --account 10000000 --risk-pct 2 --format text
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from market_data import classify, yahoo_chart, sma, rsi  # noqa: E402


# --------------------------------------------------------------------------
# OHLCV 로딩
# --------------------------------------------------------------------------
def load_ohlcv(symbol: str, rng: str) -> dict:
    ident = classify(symbol)
    ch = yahoo_chart(ident["yahoo_symbol"], rng=rng, interval="1d")
    q = ch["indicators"]["quote"][0]
    ts = ch.get("timestamp") or []
    rows = []
    for i in range(len(ts)):
        o, h, l, c, v = (q["open"][i], q["high"][i], q["low"][i], q["close"][i], q["volume"][i])
        if None in (h, l, c):
            continue
        rows.append({"t": ts[i], "o": o, "h": h, "l": l, "c": c, "v": v or 0})
    if len(rows) < 30:
        raise RuntimeError(f"{symbol}: 레벨 계산에 필요한 데이터 부족 ({len(rows)}일)")
    meta = ch["meta"]
    return {
        "ident": ident,
        "rows": rows,
        "name": meta.get("longName") or meta.get("shortName") or ident["yahoo_symbol"],
        "currency": meta.get("currency"),
        "price": meta.get("regularMarketPrice") or rows[-1]["c"],
    }


# --------------------------------------------------------------------------
# 변동성: ATR
# --------------------------------------------------------------------------
def atr(rows: list[dict], n: int = 14):
    """Wilder ATR. 손절 폭을 종목의 실제 변동성에 맞추기 위한 기준값입니다.

    고정 비율(예: -5%) 손절은 변동성이 큰 종목에서는 노이즈에 걸려 털리고,
    변동성이 작은 종목에서는 지나치게 늦게 작동합니다.
    """
    if len(rows) < n + 1:
        return None
    trs = []
    for i in range(1, len(rows)):
        h, l, pc = rows[i]["h"], rows[i]["l"], rows[i - 1]["c"]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    val = sum(trs[:n]) / n
    for tr in trs[n:]:
        val = (val * (n - 1) + tr) / n
    return val


# --------------------------------------------------------------------------
# 지지/저항: 스윙 피벗 군집화
# --------------------------------------------------------------------------
def swing_pivots(rows: list[dict], window: int = 5) -> tuple[list[dict], list[dict]]:
    """좌우 window일 내 최고/최저인 지점을 스윙 고점/저점으로 잡습니다."""
    highs, lows = [], []
    for i in range(window, len(rows) - window):
        seg = rows[i - window: i + window + 1]
        if rows[i]["h"] >= max(r["h"] for r in seg):
            highs.append({"idx": i, "price": rows[i]["h"], "t": rows[i]["t"]})
        if rows[i]["l"] <= min(r["l"] for r in seg):
            lows.append({"idx": i, "price": rows[i]["l"], "t": rows[i]["t"]})
    return highs, lows


def cluster(pivots: list[dict], tolerance: float, total: int) -> list[dict]:
    """가까운 피벗들을 하나의 '구간'으로 묶습니다.

    지지선은 정확한 한 점이 아니라 밴드입니다. 여러 번 반복해서 반응한 가격대일수록
    (touches가 많을수록) 실제로 의미 있는 레벨이며, 최근에 형성될수록 유효합니다.
    """
    if not pivots:
        return []
    ordered = sorted(pivots, key=lambda p: p["price"])
    groups: list[list[dict]] = [[ordered[0]]]
    for p in ordered[1:]:
        if abs(p["price"] - groups[-1][-1]["price"]) <= tolerance:
            groups[-1].append(p)
        else:
            groups.append([p])

    zones = []
    for g in groups:
        prices = [p["price"] for p in g]
        newest = max(p["idx"] for p in g)
        zones.append(
            {
                "low": round(min(prices), 2),
                "high": round(max(prices), 2),
                "center": round(sum(prices) / len(prices), 2),
                "touches": len(g),
                # 최근에 형성된 레벨일수록 가중치가 높습니다.
                "recency": round(newest / max(total - 1, 1), 2),
                "strength": round(len(g) * (0.5 + 0.5 * newest / max(total - 1, 1)), 2),
            }
        )
    return sorted(zones, key=lambda z: -z["strength"])


# --------------------------------------------------------------------------
# 피보나치 되돌림
# --------------------------------------------------------------------------
def fibonacci(rows: list[dict]) -> dict:
    hi = max(r["h"] for r in rows)
    lo = min(r["l"] for r in rows)
    hi_i = max(range(len(rows)), key=lambda i: rows[i]["h"])
    lo_i = min(range(len(rows)), key=lambda i: rows[i]["l"])
    up = hi_i > lo_i  # 저점이 먼저면 상승 스윙
    span = hi - lo
    levels = {}
    for r in (0.236, 0.382, 0.5, 0.618, 0.786):
        levels[f"{r:.3f}"] = round(hi - span * r if up else lo + span * r, 2)
    return {
        "swing_high": round(hi, 2),
        "swing_low": round(lo, 2),
        "direction": "상승 스윙(저점→고점)" if up else "하락 스윙(고점→저점)",
        "retracements": levels,
    }


# --------------------------------------------------------------------------
# 거래량 밀집 구간 (Volume Profile)
# --------------------------------------------------------------------------
def volume_profile(rows: list[dict], bins: int = 24) -> dict:
    """가격대별 거래량 분포. 거래가 많이 이뤄진 가격대는 매물대이자 지지대로 작동합니다."""
    lo = min(r["l"] for r in rows)
    hi = max(r["h"] for r in rows)
    if hi <= lo:
        return {}
    width = (hi - lo) / bins
    buckets = [0.0] * bins
    for r in rows:
        # 하루 거래량을 그날의 고저 범위에 균등 배분합니다(근사).
        b_lo = min(int((r["l"] - lo) / width), bins - 1)
        b_hi = min(int((r["h"] - lo) / width), bins - 1)
        span = b_hi - b_lo + 1
        for b in range(b_lo, b_hi + 1):
            buckets[b] += r["v"] / span

    total = sum(buckets) or 1
    poc_i = max(range(bins), key=lambda i: buckets[i])
    ranked = sorted(range(bins), key=lambda i: -buckets[i])
    va, acc = [], 0.0
    for i in ranked:  # 거래량 70%가 담기는 구간 = value area
        va.append(i)
        acc += buckets[i]
        if acc / total >= 0.70:
            break
    return {
        "point_of_control": round(lo + width * (poc_i + 0.5), 2),
        "value_area_low": round(lo + width * min(va), 2),
        "value_area_high": round(lo + width * (max(va) + 1), 2),
        "top_zones": [
            {
                "low": round(lo + width * i, 2),
                "high": round(lo + width * (i + 1), 2),
                "volume_share_pct": round(buckets[i] / total * 100, 1),
            }
            for i in ranked[:5]
        ],
    }


# --------------------------------------------------------------------------
# 포지션 사이징
# --------------------------------------------------------------------------
def position_size(account: float, risk_pct: float, entry: float, stop: float) -> dict:
    """1회 매매에서 감수할 손실 금액을 먼저 정하고, 거기서 수량을 역산합니다.

    '얼마어치 살까'가 아니라 '틀렸을 때 얼마를 잃을 것인가'에서 출발하는 것이
    리스크 관리의 기본 순서입니다.
    """
    per_share = entry - stop
    if per_share <= 0:
        return {"error": "손절가가 진입가보다 높거나 같습니다"}
    budget = account * risk_pct / 100
    shares = math.floor(budget / per_share)
    cost = shares * entry
    result = {
        "risk_budget": round(budget),
        "risk_per_share": round(per_share, 2),
        "shares": shares,
        "position_cost": round(cost),
        "position_pct_of_account": round(cost / account * 100, 1) if account else None,
        "max_loss_at_stop": round(shares * per_share),
    }

    # 수량 0은 계산 오류가 아니라 "이 계좌로는 이 손절 폭을 감당할 수 없다"는 결론입니다.
    # 이유를 함께 주지 않으면 계획서에 0주만 적히고 사용자가 원인을 알 수 없습니다.
    if shares == 0:
        result["warning"] = (
            f"1주를 사면 손절 시 {round(per_share):,} 손실이 발생해 리스크 예산 "
            f"{round(budget):,}을 초과합니다. 이 종목·손절 폭에서 1주를 담으려면 "
            f"계좌가 최소 {round(per_share / (risk_pct / 100)):,} 필요합니다."
        )
        result["alternatives"] = [
            f"손절 폭을 좁힌다 (ATR 배수를 낮추거나 지지 구간 바로 아래로)",
            f"리스크 비율을 {math.ceil(per_share / account * 100 * 10) / 10}% 이상으로 올린다"
            f" (권장 상한 2~3% 초과 시 재고)",
            "해당 종목을 건너뛰고 주당 가격이 낮은 종목을 검토한다",
        ]
    # 단일 종목 비중 상한(통상 20~25%) 초과 여부도 함께 알려줍니다.
    elif result["position_pct_of_account"] and result["position_pct_of_account"] > 25:
        result["warning"] = (
            f"리스크 비율은 지켰지만 투입금액이 계좌의 "
            f"{result['position_pct_of_account']}%로 단일 종목 상한(통상 20~25%)을 넘습니다. "
            f"손절 폭이 좁아 수량이 많아진 경우이며, 수량을 줄이는 쪽이 안전합니다."
        )
    return result


def rr(entry: float, stop: float, target: float):
    risk = entry - stop
    if risk <= 0:
        return None
    return round((target - entry) / risk, 2)


def split_plan(tranches: list[tuple[float, float]], stop: float,
               account: float, risk_pct: float) -> dict:
    """분할 진입의 차수별 수량을 정수로 확정합니다.

    수량을 손으로 나누면 순환 참조가 생깁니다. 평균 진입가로 총수량을 구하고 → 차수별로
    나누면 → 정수 반올림 때문에 실제 평균가가 달라지고 → 총수량이 또 바뀝니다.
    여기서는 정수 배분을 먼저 확정한 뒤 실제 평균가를 역산하고, 리스크 예산을 넘으면
    수량을 줄이는 방향으로만 조정해 한 번에 수렴시킵니다.
    """
    total_w = sum(w for _, w in tranches)
    if total_w <= 0:
        return {"error": "비중 합이 0입니다"}
    weights = [w / total_w for _, w in tranches]
    prices = [p for p, _ in tranches]

    if stop >= min(prices):
        return {
            "error": f"손절가({stop:,})가 최저 진입가({min(prices):,})보다 높습니다. "
                     f"마지막 차수를 체결하기 전에 손절이 걸리는 모순된 계획입니다."
        }

    budget = account * risk_pct / 100
    weighted_entry = sum(p * w for p, w in zip(prices, weights))
    total = math.floor(budget / (weighted_entry - stop))

    # 정수 배분: 내림 후 남은 수량을 앞 차수부터 채웁니다(먼저 체결되는 쪽 우선).
    alloc = [math.floor(total * w) for w in weights]
    for i in range(total - sum(alloc)):
        alloc[i % len(alloc)] += 1

    # 실제 평균가로 리스크를 재검증하고, 초과하면 뒤 차수부터 1주씩 줄입니다.
    def actual():
        n = sum(alloc)
        if n == 0:
            return 0, 0.0, 0.0
        avg = sum(p * s for p, s in zip(prices, alloc)) / n
        return n, avg, n * (avg - stop)

    n, avg, risk = actual()
    while n > 0 and risk > budget:
        for i in range(len(alloc) - 1, -1, -1):
            if alloc[i] > 0:
                alloc[i] -= 1
                break
        n, avg, risk = actual()

    return {
        "tranches": [
            {
                "차수": i + 1,
                "entry": round(p, 2),
                "weight_pct": round(w * 100, 1),
                "shares": s,
                "cost": round(p * s),
                "pct_of_account": round(p * s / account * 100, 2) if account else None,
            }
            for i, (p, w, s) in enumerate(zip(prices, weights, alloc))
        ],
        "total_shares": n,
        "average_entry": round(avg, 2),
        "stop": round(stop, 2),
        "total_cost": round(sum(p * s for p, s in zip(prices, alloc))),
        "pct_of_account": round(sum(p * s for p, s in zip(prices, alloc)) / account * 100, 2)
        if account else None,
        "max_loss_at_stop": round(risk),
        "risk_budget": round(budget),
        "risk_pct_of_account": round(risk / account * 100, 2) if account else None,
    }


# --------------------------------------------------------------------------
# 통합
# --------------------------------------------------------------------------
def analyze(symbol: str, rng: str, account: float | None, risk_pct: float,
            entry: float | None = None, stop: float | None = None,
            split: list[tuple[float, float]] | None = None) -> dict:
    data = load_ohlcv(symbol, rng)
    rows, price = data["rows"], data["price"]
    closes = [r["c"] for r in rows]

    a = atr(rows) or 0
    tol = a * 0.75 if a else price * 0.015
    highs, lows = swing_pivots(rows)
    n = len(rows)

    def tag(zones):
        # 현재가가 구간 안에 들어와 있으면 그 사실 자체가 중요한 정보입니다.
        # 돌파 시도 중이거나 매물대에 갇힌 상태라는 뜻이라, 위/아래 어느 쪽으로도
        # 단순한 목표가나 손절가로 쓰기 어렵습니다.
        for z in zones:
            z["contains_price"] = z["low"] <= price <= z["high"]
        return zones

    res = tag([z for z in cluster(highs, tol, n) if z["center"] > price * 1.005])
    sup = tag([z for z in cluster(lows, tol, n) if z["center"] < price * 0.995])
    res.sort(key=lambda z: z["center"])
    sup.sort(key=lambda z: -z["center"])

    mas = {}
    for p in (20, 60, 120, 200):
        v = sma(closes, p)
        if v:
            mas[f"sma{p}"] = {
                "value": round(v, 2),
                "distance_pct": round((price / v - 1) * 100, 2),
                "role": "지지(가격이 위)" if price > v else "저항(가격이 아래)",
            }

    out = {
        "symbol": data["ident"],
        "name": data["name"],
        "currency": data["currency"],
        "price": round(price, 2),
        "range": rng,
        "trading_days": n,
        "volatility": {
            "atr14": round(a, 2),
            "atr_pct_of_price": round(a / price * 100, 2) if price else None,
            "rsi14": rsi(closes),
        },
        "resistance_zones": res[:5],
        "support_zones": sup[:5],
        "moving_averages": mas,
        "fibonacci": fibonacci(rows),
        "volume_profile": volume_profile(rows),
    }

    # ATR 배수별 손절 후보. 배수가 클수록 노이즈에 덜 털리지만 손실 폭은 커집니다.
    out["stop_candidates"] = [
        {
            "method": f"ATR {m}배",
            "stop": round(price - a * m, 2),
            "distance_pct": round(a * m / price * 100, 2),
        }
        for m in (1.5, 2.0, 3.0)
    ]
    if sup:
        z = sup[0]
        out["stop_candidates"].append(
            {
                "method": "1차 지지구간 하단 이탈 (ATR 0.3배 여유)",
                "stop": round(z["low"] - a * 0.3, 2),
                "distance_pct": round((price - z["low"] + a * 0.3) / price * 100, 2),
                "note": f"지지구간 {z['low']:,} ~ {z['high']:,} 이 무너지면 논거가 깨졌다는 뜻",
            }
        )

    # --entry / --stop 이 주어지면 그 값으로, 없으면 현재가 + ATR 2배 손절을 가정합니다.
    # 분할 진입 계획은 진입가가 현재가와 다르므로, 계획한 값으로 계산할 수 있어야 합니다.
    # 분할 진입이면 가중 평균 진입가를 계획 기준으로 삼습니다.
    if split:
        tw = sum(w for _, w in split) or 1
        plan_entry = sum(p * w for p, w in split) / tw
    else:
        plan_entry = entry if entry else price
    plan_stop = stop if stop else round(plan_entry - a * 2, 2)
    out["plan_basis"] = {
        "entry": round(plan_entry, 2),
        "stop": round(plan_stop, 2),
        "entry_source": "사용자 지정" if entry else "현재가",
        "stop_source": "사용자 지정" if stop else "진입가 - ATR 2배",
        "risk_per_share": round(plan_entry - plan_stop, 2),
        "stop_distance_pct": round((plan_entry - plan_stop) / plan_entry * 100, 2) if plan_entry else None,
        "stop_in_atr": round((plan_entry - plan_stop) / a, 2) if a else None,
    }

    # 손익비 참고표. 터치 1회짜리 구간은 신뢰도가 낮은데도 대개 가장 멀어서 R:R이
    # 제일 좋게 나옵니다. R:R만 보고 고르면 근거가 가장 약한 레벨을 목표로 삼게 되므로
    # 신뢰도를 함께 표기하고 정렬은 거리순으로 유지합니다.
    if res:
        out["reference_rr"] = [
            {
                "entry": round(plan_entry, 2),
                "stop": round(plan_stop, 2),
                "target": z["center"],
                "target_source": f"저항구간 (터치 {z['touches']}회, 강도 {z['strength']})",
                "confidence": "높음" if z["touches"] >= 4 else "보통" if z["touches"] >= 2 else "낮음",
                "risk_reward": rr(plan_entry, plan_stop, z["center"]),
                "upside_pct": round((z["center"] / plan_entry - 1) * 100, 2),
                "warning": ("터치 1회 구간 — R:R이 좋아 보여도 근거가 약합니다"
                            if z["touches"] < 2 else None),
                "note": ("현재가가 이 구간 안에 있어 즉시 진입 시에는 목표로 쓰기 어렵습니다"
                         if z.get("contains_price") else None),
            }
            for z in res[:4]
        ]

    # 분할 진입 계획에서 손절가가 마지막 차수보다 높으면, 그 차수를 체결하기도 전에
    # 손절이 걸립니다. 계산 이전에 잡아야 할 논리적 모순입니다.
    if split and plan_stop >= min(p for p, _ in split):
        out["plan_basis"]["error"] = (
            f"손절가({round(plan_stop):,})가 최저 진입가({round(min(p for p, _ in split)):,})보다 "
            f"높습니다. 마지막 차수 체결 전에 손절이 걸리는 모순된 계획입니다."
        )

    if account:
        if split:
            out["position_sizing"] = {
                "account": account,
                "risk_pct": risk_pct,
                "mode": "분할 진입",
                **split_plan(split, plan_stop, account, risk_pct),
            }
        else:
            out["position_sizing"] = {
                "account": account,
                "risk_pct": risk_pct,
                "mode": "일괄 진입",
                "assumed_entry": round(plan_entry, 2),
                "assumed_stop": round(plan_stop, 2),
                **position_size(account, risk_pct, plan_entry, plan_stop),
            }

    return out


def render_text(d: dict) -> str:
    cur = d.get("currency") or ""
    L = [f"=== {d['name']} ({d['symbol']['yahoo_symbol']}) 매매 레벨 ===",
         f"현재가 {d['price']:,} {cur} | 기간 {d['range']} ({d['trading_days']}일)"]
    v = d["volatility"]
    L.append(f"ATR(14) {v['atr14']:,} ({v['atr_pct_of_price']}% of price) | RSI14 {v['rsi14']}")

    L.append("\n[저항 구간] (가까운 순)")
    for z in d["resistance_zones"]:
        mark = "  ⚠ 현재가가 이 구간 안에 있음" if z.get("contains_price") else ""
        L.append(f"  {z['low']:,} ~ {z['high']:,}  중심 {z['center']:,}"
                 f"  터치 {z['touches']}회  강도 {z['strength']}{mark}")
    if not d["resistance_zones"]:
        L.append("  (없음 — 신고가 부근)")

    L.append("\n[지지 구간] (가까운 순)")
    for z in d["support_zones"]:
        mark = "  ⚠ 현재가가 이 구간 안에 있음" if z.get("contains_price") else ""
        L.append(f"  {z['low']:,} ~ {z['high']:,}  중심 {z['center']:,}"
                 f"  터치 {z['touches']}회  강도 {z['strength']}{mark}")
    if not d["support_zones"]:
        L.append("  (없음 — 신저가 부근)")

    L.append("\n[이동평균]")
    for k, m in d["moving_averages"].items():
        L.append(f"  {k.upper():<7} {m['value']:>12,}  이격 {m['distance_pct']:+.2f}%  {m['role']}")

    f = d["fibonacci"]
    L.append(f"\n[피보나치 되돌림] {f['direction']}  고 {f['swing_high']:,} / 저 {f['swing_low']:,}")
    L.append("  " + "  ".join(f"{k}:{val:,}" for k, val in f["retracements"].items()))

    vp = d.get("volume_profile") or {}
    if vp:
        L.append(f"\n[거래량 밀집] POC {vp['point_of_control']:,}"
                 f" | 밸류에어리어 {vp['value_area_low']:,} ~ {vp['value_area_high']:,}")

    L.append("\n[손절 후보]")
    for s in d["stop_candidates"]:
        L.append(f"  {s['method']:<28} {s['stop']:>12,}  (-{s['distance_pct']}%)")

    pb = d.get("plan_basis") or {}
    if pb:
        L.append(f"\n[계획 기준] 진입 {pb['entry']:,} ({pb['entry_source']})"
                 f" / 손절 {pb['stop']:,} ({pb['stop_source']})")
        L.append(f"  주당 리스크 {pb['risk_per_share']:,}"
                 f" | 손절 폭 -{pb['stop_distance_pct']}% (ATR {pb['stop_in_atr']}배)")

    if d.get("reference_rr"):
        L.append("\n[손익비] 위 계획 기준")
        for r in d["reference_rr"]:
            L.append(f"  목표 {r['target']:>12,} (+{r['upside_pct']:>6}%)  R:R {r['risk_reward']:<5}"
                     f" 신뢰도 {r['confidence']}  ← {r['target_source']}")
            for k in ("warning", "note"):
                if r.get(k):
                    L.append(f"       ⚠ {r[k]}")

    if pb.get("error"):
        L.append(f"\n  ⛔ {pb['error']}")

    if d.get("position_sizing"):
        p = d["position_sizing"]
        L.append(f"\n[포지션 사이징] 계좌 {p['account']:,} / 회당 리스크 {p['risk_pct']}%"
                 f" / {p.get('mode', '')}")
        if "error" in p:
            L.append(f"  ⛔ {p['error']}")
        elif p.get("mode") == "분할 진입":
            L.append(f"  {'차수':<5}{'진입가':>13}{'비중':>8}{'수량':>8}{'금액':>14}{'계좌비중':>10}")
            for t in p["tranches"]:
                L.append(f"  {t['차수']:<5}{t['entry']:>13,}{t['weight_pct']:>7}%"
                         f"{t['shares']:>7}주{t['cost']:>14,}{t['pct_of_account']:>9}%")
            L.append(f"  {'합계':<5}{'평균 ' + format(p['average_entry'], ','):>13}{'':>8}"
                     f"{p['total_shares']:>7}주{p['total_cost']:>14,}{p['pct_of_account']:>9}%")
            L.append(f"  손절 {p['stop']:,} 도달 시 손실 {p['max_loss_at_stop']:,}"
                     f" (계좌의 {p['risk_pct_of_account']}%, 예산 {p['risk_budget']:,})")
        else:
            L.append(f"  진입 {p['assumed_entry']:,} / 손절 {p['assumed_stop']:,}"
                     f" → {p['shares']:,}주")
            L.append(f"  투입금액 {p['position_cost']:,} (계좌의 {p['position_pct_of_account']}%)"
                     f" | 손절 시 손실 {p['max_loss_at_stop']:,}")
            if p.get("warning"):
                L.append(f"  ⚠ {p['warning']}")
            for alt in p.get("alternatives", []):
                L.append(f"     · {alt}")

    L.append("\n※ 레벨 계산 결과일 뿐 매매 판단이 아닙니다. 펀더멘털 분석과 함께 해석하세요.")
    return "\n".join(L)


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
        description="매매 계획용 가격 레벨 및 리스크 수치 계산",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("symbol", help="종목 코드 / 티커 / 종목명")
    p.add_argument("--range", default="1y", help="분석 기간 (6mo/1y/2y/5y, 기본 1y)")
    p.add_argument("--account", type=float, help="계좌 총액 (포지션 사이징 계산용)")
    p.add_argument("--risk-pct", type=float, default=2.0, help="1회 매매 최대 리스크 %% (기본 2)")
    p.add_argument("--entry", type=float,
                   help="계획한 진입가 (미지정 시 현재가)")
    p.add_argument("--stop", type=float,
                   help="계획한 손절가 (미지정 시 진입가 - ATR 2배)")
    p.add_argument("--split",
                   help="분할 진입: '가격:비중,가격:비중' 형식 "
                        "(예: '212000:0.5,191500:0.5'). 차수별 수량을 정수로 확정합니다")
    p.add_argument("--format", choices=["json", "text"], default="json")
    a = p.parse_args()

    if a.entry and a.stop and a.stop >= a.entry:
        p.error("--stop 은 --entry 보다 낮아야 합니다")

    split = None
    if a.split:
        try:
            split = []
            for part in a.split.split(","):
                price, weight = part.split(":")
                split.append((float(price), float(weight)))
        except ValueError:
            p.error("--split 형식 오류. '212000:0.5,191500:0.5' 처럼 지정하세요")
        if a.entry:
            p.error("--split 과 --entry 는 함께 쓸 수 없습니다 (평균가는 --split 에서 계산됩니다)")

    try:
        result = analyze(a.symbol, a.range, a.account, a.risk_pct, a.entry, a.stop, split)
    except Exception as e:
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}, ensure_ascii=False))
        sys.exit(1)

    print(render_text(result) if a.format == "text" else json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
