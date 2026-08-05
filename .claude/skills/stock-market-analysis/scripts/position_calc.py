#!/usr/bin/env python3
"""
position_calc.py - 리스크 기반 포지션 크기 및 손익비 계산기

매매 계획의 산수를 결정적으로 처리합니다. 포지션 크기 계산은 실수하면 곧바로 손실
규모가 달라지는 부분이라, 암산이나 추정 대신 이 스크립트를 쓰세요.

핵심 원칙: **포지션 크기는 손절폭에서 역산합니다.**
"얼마어치 살까"가 아니라 "틀렸을 때 얼마까지 잃어도 되는가"를 먼저 정하고,
거기서 수량을 도출합니다. 손절폭이 넓으면 수량이 줄고, 좁으면 늘어납니다.

사용 예:
    # 기본: 자본 1000만원, 1회 리스크 2%, 진입 229000, 손절 213400
    python position_calc.py --capital 10000000 --risk-pct 2 \\
        --entry 229000 --stop 213400 --target 265000

    # 변동성 기반 손절폭 제안 (보고서의 연환산 변동성 사용)
    python position_calc.py --capital 10000000 --risk-pct 2 \\
        --entry 229000 --volatility 56.7 --target 265000

    # 분할 매수 계획 포함
    python position_calc.py --capital 10000000 --risk-pct 2 \\
        --entry 229000 --stop 213400 --target 265000 --scale-in 3
"""

from __future__ import annotations

import argparse
import json
import math
import sys

TRADING_DAYS = 252


def daily_vol(annual_vol_pct: float) -> float:
    """연환산 변동성(%)을 일간 변동성(%)으로 환산합니다."""
    return annual_vol_pct / math.sqrt(TRADING_DAYS)


def suggest_stop(entry: float, annual_vol_pct: float, sigma: float = 2.0) -> dict:
    """변동성 기반 손절가를 제안합니다.

    손절선이 일상적인 등락폭 안에 있으면 방향이 맞아도 노이즈에 털립니다.
    일간 변동성의 sigma배를 최소 완충으로 잡는 것이 통상적인 접근입니다.
    """
    d = daily_vol(annual_vol_pct)
    buffer_pct = d * sigma
    return {
        "annual_volatility_pct": round(annual_vol_pct, 2),
        "daily_volatility_pct": round(d, 2),
        "sigma": sigma,
        "min_stop_distance_pct": round(buffer_pct, 2),
        "suggested_stop": round(entry * (1 - buffer_pct / 100), 2),
        "note": f"일간 변동성 {d:.2f}%의 {sigma}배({buffer_pct:.2f}%) 이내 손절선은 "
                f"정상적인 등락에도 체결될 수 있습니다.",
    }


def calc(capital: float, risk_pct: float, entry: float, stop: float,
         target: float | None = None, max_position_pct: float = 20.0,
         shares_override: int | None = None, fit_max_position: bool = False) -> dict:
    if entry <= 0:
        raise ValueError("진입가는 0보다 커야 합니다")
    if stop >= entry:
        raise ValueError(f"손절가({stop:,.0f})가 진입가({entry:,.0f}) 이상입니다. "
                         "매수 포지션의 손절가는 진입가보다 낮아야 합니다.")

    risk_amount = capital * risk_pct / 100
    risk_per_share = entry - stop
    stop_distance_pct = risk_per_share / entry * 100

    risk_based_shares = int(risk_amount // risk_per_share)
    cap_shares = int(capital * max_position_pct / 100 // entry)

    # 수량 결정 우선순위: 명시 지정 > 집중도 한도 맞춤 > 리스크 예산 기준
    # 손실 한도와 집중도 한도 중 어느 쪽이 먼저 걸리는지는 손절폭에 따라 달라집니다.
    # 손절폭이 좁으면 수량이 커져 집중도가 먼저 걸리고, 넓으면 손실 한도가 먼저 걸립니다.
    if shares_override is not None:
        shares, sizing_basis = shares_override, "지정 수량(--shares)"
    elif fit_max_position and cap_shares < risk_based_shares:
        shares, sizing_basis = cap_shares, f"집중도 한도({max_position_pct}%) 맞춤"
    else:
        shares, sizing_basis = risk_based_shares, f"리스크 예산({risk_pct}%) 기준"

    position_value = shares * entry
    actual_risk = shares * risk_per_share

    result = {
        "sizing": {
            "basis": sizing_basis,
            "risk_based_shares": risk_based_shares,
            "max_position_shares": cap_shares,
            "binding_constraint": ("집중도 한도" if cap_shares < risk_based_shares
                                   else "손실 한도"),
        },
        "inputs": {
            "capital": capital,
            "risk_pct": risk_pct,
            "entry": entry,
            "stop": stop,
            "target": target,
            "max_position_pct": max_position_pct,
        },
        "risk_budget": {
            "risk_amount": round(risk_amount, 0),
            "risk_per_share": round(risk_per_share, 2),
            "stop_distance_pct": round(stop_distance_pct, 2),
        },
        "position": {
            "shares": shares,
            "position_value": round(position_value, 0),
            "position_pct_of_capital": round(position_value / capital * 100, 2),
            "actual_risk_amount": round(actual_risk, 0),
            "actual_risk_pct": round(actual_risk / capital * 100, 2),
        },
        "warnings": [],
    }

    if shares == 0:
        result["warnings"].append(
            f"손절폭({risk_per_share:,.0f}원)이 리스크 예산({risk_amount:,.0f}원)보다 커서 "
            "1주도 살 수 없습니다. 손절폭을 좁히거나 리스크 한도를 높여야 합니다."
        )

    concentration = position_value / capital * 100
    if concentration > max_position_pct:
        result["warnings"].append(
            f"포지션이 자본의 {concentration:.1f}%로 집중도 한도({max_position_pct}%)를 "
            f"초과합니다. 손절폭이 좁아 수량이 과도하게 산출된 경우입니다. "
            f"한도 내 최대 수량은 {cap_shares:,}주이며, --fit-max-position 을 붙이면 "
            f"해당 수량으로 재계산합니다."
        )

    if target is not None:
        if target <= entry:
            result["warnings"].append(
                f"목표가({target:,.0f})가 진입가({entry:,.0f}) 이하입니다."
            )
        else:
            reward_per_share = target - entry
            rr = reward_per_share / risk_per_share
            result["reward"] = {
                "target": target,
                "reward_per_share": round(reward_per_share, 2),
                "target_distance_pct": round(reward_per_share / entry * 100, 2),
                "risk_reward_ratio": round(rr, 2),
                "potential_profit": round(shares * reward_per_share, 0),
                # 손익비가 R일 때 기대값이 0이 되는 승률
                "breakeven_win_rate_pct": round(100 / (1 + rr), 1),
            }
            if rr < 2:
                result["warnings"].append(
                    f"손익비가 {rr:.2f}:1로 낮습니다. 2:1 미만이면 승률 "
                    f"{100 / (1 + rr):.0f}% 이상을 꾸준히 내야 본전입니다. "
                    "목표가를 재검토하거나 진입 시점을 미루는 편이 낫습니다."
                )

    return result


def r_multiple_ladder(entry: float, stop: float, shares: int,
                      levels: list[float]) -> list[dict]:
    """R배수 익절 단계를 계산합니다.

    1R = 주당 리스크(진입가 - 손절가). 보고서에 중간 저항선이 없을 때 익절 가격을
    지어내는 대신 손절폭에서 도출하는 방식입니다. 목표가를 '예측'하는 것이 아니라
    감수한 리스크의 배수로 정의하므로 임의 산출과는 성격이 다릅니다.
    """
    r = entry - stop
    n = len(levels)
    per = shares // n
    out = []
    remaining = shares
    for i, mult in enumerate(levels):
        qty = per if i < n - 1 else remaining
        remaining -= qty
        price = round(entry + r * mult, 2)
        out.append({
            "step": i + 1,
            "r_multiple": mult,
            "price": price,
            "gain_pct": round((price / entry - 1) * 100, 2),
            "shares": qty,
            "realized_profit": round(qty * r * mult, 0),
            "cumulative_sold_pct": round((shares - remaining) / shares * 100, 1),
        })
    return out


def scale_in_plan(entry: float, stop: float, shares: int, tranches: int) -> list[dict]:
    """분할 매수 계획. 진입가와 손절가 사이를 균등 분할합니다.

    한 번에 전량 진입하면 진입 시점이 곧 전부입니다. 나누어 담으면 평균 단가가
    낮아지는 대신, 상승 시 확보 수량이 줄어드는 트레이드오프가 있습니다.
    """
    band = entry - stop
    step = band / (tranches + 1)
    per = shares // tranches
    plan = []
    for i in range(tranches):
        price = round(entry - step * i, 2)
        qty = per if i < tranches - 1 else shares - per * (tranches - 1)
        plan.append({
            "tranche": i + 1,
            "price": price,
            "shares": qty,
            "amount": round(price * qty, 0),
            "trigger": "즉시 진입" if i == 0 else f"{price:,.0f}원 도달 시",
        })
    total_qty = sum(p["shares"] for p in plan)
    total_amt = sum(p["amount"] for p in plan)
    for p in plan:
        p["cumulative_avg"] = None
    running_q = running_a = 0
    for p in plan:
        running_q += p["shares"]
        running_a += p["amount"]
        p["cumulative_avg"] = round(running_a / running_q, 2) if running_q else None
    return plan + [{
        "tranche": "합계",
        "shares": total_qty,
        "amount": round(total_amt, 0),
        "avg_price": round(total_amt / total_qty, 2) if total_qty else None,
    }]


def render(r: dict, scale: list | None, ladder: list | None = None) -> str:
    L = []
    i, rb, p = r["inputs"], r["risk_budget"], r["position"]
    L.append("=== 리스크 예산 ===")
    L.append(f"  총 자본           : {i['capital']:>15,.0f}")
    L.append(f"  1회 허용 손실률   : {i['risk_pct']:>15.2f} %")
    L.append(f"  = 리스크 예산     : {rb['risk_amount']:>15,.0f}")
    L.append("")
    L.append("=== 진입/손절 ===")
    L.append(f"  진입가            : {i['entry']:>15,.0f}")
    L.append(f"  손절가            : {i['stop']:>15,.0f}")
    L.append(f"  주당 리스크       : {rb['risk_per_share']:>15,.0f}  ({rb['stop_distance_pct']}%)")
    L.append("")
    L.append("=== 산출 포지션 ===")
    s = r["sizing"]
    L.append(f"  수량 결정 기준    : {s['basis']:>15}")
    L.append(f"  (리스크 기준 {s['risk_based_shares']:,}주 / 집중도 한도 {s['max_position_shares']:,}주 "
             f"→ {s['binding_constraint']}가 먼저 적용)")
    L.append(f"  매수 수량         : {p['shares']:>15,} 주")
    L.append(f"  포지션 금액       : {p['position_value']:>15,.0f}  (자본의 {p['position_pct_of_capital']}%)")
    L.append(f"  실제 리스크 금액  : {p['actual_risk_amount']:>15,.0f}  (자본의 {p['actual_risk_pct']}%)")

    if "reward" in r:
        w = r["reward"]
        L.append("")
        L.append("=== 손익비 ===")
        L.append(f"  목표가            : {w['target']:>15,.0f}  (+{w['target_distance_pct']}%)")
        L.append(f"  주당 기대수익     : {w['reward_per_share']:>15,.0f}")
        L.append(f"  손익비 (R:R)      : {w['risk_reward_ratio']:>15.2f} : 1")
        L.append(f"  예상 수익         : {w['potential_profit']:>15,.0f}")
        L.append(f"  손익분기 승률     : {w['breakeven_win_rate_pct']:>15.1f} %")

    if ladder:
        L.append("")
        L.append("=== R배수 익절 단계 ===")
        L.append(f"  (1R = 주당 리스크 {rb['risk_per_share']:,.0f}원)")
        for s in ladder:
            L.append(f"  {s['r_multiple']}R  @{s['price']:>10,.0f} (+{s['gain_pct']:>5.1f}%)  "
                     f"{s['shares']:>5,}주 매도  실현 {s['realized_profit']:>11,.0f}  "
                     f"누적 {s['cumulative_sold_pct']}%")

    if scale:
        L.append("")
        L.append("=== 분할 매수 계획 ===")
        for s in scale:
            if s["tranche"] == "합계":
                L.append(f"  {'합계':<8} {s['shares']:>8,}주  {s['amount']:>14,.0f}  평단 {s['avg_price']:,.0f}")
            else:
                L.append(f"  {s['tranche']}차     {s['shares']:>8,}주  {s['amount']:>14,.0f}  "
                         f"@{s['price']:,.0f}  ({s['trigger']})")

    if r["warnings"]:
        L.append("")
        L.append("=== 경고 ===")
        for w in r["warnings"]:
            L.append(f"  [!] {w}")

    L.append("")
    L.append("※ 이 계산은 입력한 가정에 대한 산술 결과이며, 매매 권유가 아닙니다.")
    return "\n".join(L)


def main():
    p = argparse.ArgumentParser(
        description="리스크 기반 포지션 크기 및 손익비 계산기",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--capital", type=float, required=True, help="총 투자 자본")
    p.add_argument("--risk-pct", type=float, required=True,
                   help="1회 거래에서 감내할 손실률 %% (통상 1~2)")
    p.add_argument("--entry", type=float, required=True, help="진입 가격")
    p.add_argument("--stop", type=float, help="손절 가격 (--volatility 로 대체 가능)")
    p.add_argument("--target", type=float, help="목표 가격 (손익비 계산용)")
    p.add_argument("--volatility", type=float,
                   help="연환산 변동성 %%. --stop 대신 주면 변동성 기반 손절가를 제안합니다")
    p.add_argument("--sigma", type=float, default=2.0, help="변동성 손절 배수 (기본 2.0)")
    p.add_argument("--max-position-pct", type=float, default=20.0,
                   help="단일 종목 집중도 한도 %% (기본 20)")
    p.add_argument("--shares", type=int,
                   help="수량을 직접 지정 (리스크 역산 대신 이 수량으로 모든 값을 재계산)")
    p.add_argument("--fit-max-position", action="store_true",
                   help="집중도 한도가 먼저 걸리면 한도 내 최대 수량으로 자동 조정")
    p.add_argument("--scale-in", type=int, metavar="N", help="N회 분할 매수 계획 생성")
    p.add_argument("--r-ladder", metavar="R1,R2,...",
                   help="R배수 익절 단계 (예: 1,2,3). 보고서에 중간 저항선이 없을 때 사용")
    p.add_argument("--format", choices=["text", "json"], default="text")
    a = p.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    vol_info = None
    stop = a.stop
    if stop is None:
        if a.volatility is None:
            p.error("--stop 또는 --volatility 중 하나는 반드시 필요합니다")
        vol_info = suggest_stop(a.entry, a.volatility, a.sigma)
        stop = vol_info["suggested_stop"]

    try:
        r = calc(a.capital, a.risk_pct, a.entry, stop, a.target, a.max_position_pct,
                 shares_override=a.shares, fit_max_position=a.fit_max_position)
    except ValueError as e:
        print(f"[오류] {e}", file=sys.stderr)
        sys.exit(1)

    if vol_info:
        r["volatility_stop"] = vol_info
    elif a.volatility is not None:
        # 직접 지정한 손절선이 변동성 대비 충분한지 점검합니다.
        chk = suggest_stop(a.entry, a.volatility, a.sigma)
        r["volatility_stop"] = chk
        if r["risk_budget"]["stop_distance_pct"] < chk["min_stop_distance_pct"]:
            r["warnings"].append(
                f"손절폭 {r['risk_budget']['stop_distance_pct']}%가 변동성 기준 최소 "
                f"{chk['min_stop_distance_pct']}%보다 좁습니다. {chk['note']}"
            )

    shares = r["position"]["shares"]

    ladder = None
    if a.r_ladder and shares > 0:
        try:
            levels = [float(x) for x in a.r_ladder.split(",") if x.strip()]
        except ValueError:
            p.error("--r-ladder 는 쉼표로 구분한 숫자여야 합니다 (예: 1,2,3)")
        if levels:
            ladder = r_multiple_ladder(a.entry, stop, shares, levels)
            r["r_ladder"] = ladder

    scale = None
    if a.scale_in and a.scale_in > 1 and shares > 0:
        scale = scale_in_plan(a.entry, stop, shares, a.scale_in)
        r["scale_in_plan"] = scale
        # 분할 매수는 평단을 낮춰 실제 최대 손실을 줄이지만, 2·3차가 체결되지 않을 수도
        # 있습니다. 계획서에 보고할 최대 손실은 보수적으로 미분할 기준을 씁니다.
        avg = scale[-1].get("avg_price")
        if avg:
            r["scale_in_note"] = (
                f"분할 체결 시 평단 {avg:,.0f}원으로 최대 손실은 "
                f"{shares * (avg - stop):,.0f}원까지 낮아지지만, 2·3차 미체결 가능성이 있으므로 "
                f"계획서에는 미분할 기준 {r['position']['actual_risk_amount']:,.0f}원을 "
                f"최대 손실로 보고하세요."
            )

    if a.format == "json":
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        if vol_info:
            print(f"[변동성 기반 손절가 제안] {vol_info['suggested_stop']:,.0f}원 "
                  f"(일간변동성 {vol_info['daily_volatility_pct']}% × {a.sigma}σ)\n")
        print(render(r, scale, ladder))
        if r.get("scale_in_note"):
            print(f"\n[분할 매수 참고] {r['scale_in_note']}")


if __name__ == "__main__":
    main()
