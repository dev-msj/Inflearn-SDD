# 데이터 소스 카탈로그 및 트러블슈팅

`scripts/market_data.py` 가 사용하는 공개 엔드포인트와, 실패 시 대응 방법을 정리합니다.
스크립트를 수정하거나 새 지표를 추가할 때 참고하세요.

## 목차
1. [엔드포인트 목록](#1-엔드포인트-목록)
2. [명령별 사용 소스](#2-명령별-사용-소스)
3. [자주 발생하는 오류와 대응](#3-자주-발생하는-오류와-대응)
4. [스크립트 확장 시 유의사항](#4-스크립트-확장-시-유의사항)
5. [주요 심볼 표기법](#5-주요-심볼-표기법)

---

## 1. 엔드포인트 목록

모두 인증 키가 필요 없는 공개 엔드포인트이며, Python 표준 라이브러리(`urllib`)만으로
호출됩니다. 모든 요청에 브라우저 User-Agent가 필요합니다.

| 소스 | 엔드포인트 | 제공 데이터 | 특이사항 |
|---|---|---|---|
| Yahoo Chart | `query1.finance.yahoo.com/v8/finance/chart/{symbol}` | 시세, OHLCV 시계열, 52주 고저 | 인증 불필요. 가장 안정적 |
| Yahoo QuoteSummary | `query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}` | PER/PBR/ROE/재무비율/애널리스트 목표주가 | **쿠키 + crumb 필수**. 없으면 401 |
| Yahoo Search | `query2.finance.yahoo.com/v1/finance/search` | 티커 검색 | **한글 질의 시 400 반환**. 영문만 사용 |
| 네이버 자동완성 | `ac.stock.naver.com/ac` | 종목 검색 (한/영, 한국/미국) | 한글 검색의 1차 소스. KOSPI/KOSDAQ 구분 제공 |
| 네이버 통합 | `m.stock.naver.com/api/stock/{code}/integration` | 국내 종목 PER/PBR/EPS/BPS/배당, 수급, 동종업계 | 국내 종목 핵심 소스 |
| 네이버 재무 | `m.stock.naver.com/api/stock/{code}/finance/annual` | 국내 연간 재무제표 3~4개년 + 컨센서스 | `annual` 대신 `quarter` 도 가능 |
| 네이버 지수 | `m.stock.naver.com/api/index/{KOSPI\|KOSDAQ}/basic` | 국내 지수 | |
| CNN Fear & Greed | `production.dataviz.cnn.io/index/fearandgreed/graphdata` | 공포탐욕지수 + 1주/1개월/1년 전 값 | **`Referer: https://edition.cnn.com/` 헤더 필수**. 없으면 418 |

### Yahoo crumb 인증 흐름
`quoteSummary`는 2023년 이후 토큰을 요구합니다. 스크립트의 `yahoo_session()` 이 처리합니다.

1. `https://fc.yahoo.com` 요청 → 응답은 404지만 세션 쿠키가 설정됨
2. `https://query1.finance.yahoo.com/v1/test/getcrumb` 로 crumb 문자열 획득
3. 이후 모든 `quoteSummary` 요청에 `&crumb=<값>` 을 붙이고 동일 쿠키 세션 사용

crumb은 프로세스당 한 번만 발급받아 재사용합니다.

---

## 2. 명령별 사용 소스

| 명령 | 한국 종목 | 미국 종목 |
|---|---|---|
| `search` | 네이버 자동완성 (+영문이면 Yahoo Search 병합) | 양쪽 병합 |
| `quote` | Yahoo Chart (`.KS`/`.KQ`) | Yahoo Chart |
| `technicals` | Yahoo Chart 시계열 → 로컬 계산 | 동일 |
| `fundamentals` | 네이버 integration + finance/annual | Yahoo QuoteSummary |
| `peers` | 네이버 industryCompareInfo | sector/industry만 반환(목록 미제공) |
| `sentiment` | 시장 무관 공통 (CNN, VIX, 지수, 환율, 원자재) | 동일 |
| `report` | 위 전부를 합산, 실패한 항목은 `errors` 에 기록 | 동일 |

**국내와 미국의 지표 항목이 다릅니다.** 네이버는 `annual_financials`(연도별 매출액·영업이익·
ROE·부채비율 등)를 주고, Yahoo는 `profitability`/`financial_health` 블록을 줍니다. 보고서
작성 시 어느 쪽 데이터인지에 맞춰 항목을 채워야 합니다.

---

## 3. 자주 발생하는 오류와 대응

| 증상 | 원인 | 대응 |
|---|---|---|
| `HTTP Error 401` (fundamentals, 미국) | crumb 발급 실패 | 재실행. 반복되면 Yahoo 쪽 차단이므로 WebFetch로 대체 수집 |
| `HTTP Error 400` (search, 한글) | Yahoo가 비ASCII 질의 거부 | 스크립트가 네이버로 자동 폴백함. 결과가 비면 다른 키워드 시도 |
| `HTTP Error 404` (quote) | 존재하지 않는 티커 | `search` 로 정확한 심볼 확인 |
| `HTTP Error 418` (sentiment) | CNN이 Referer 없는 요청 차단 | 스크립트에 헤더가 포함되어 있음. 실패 시 VIX로 대체 판단 |
| 종목을 찾지 못했다는 RuntimeError | 회사명 검색 실패 | 정식 종목명 또는 6자리 코드로 재시도 |
| `annual_financials` 가 비어 있음 | 신규 상장·스팩·ETF | 재무 데이터 자체가 없는 종목. 보고서에 "해당 없음" 명시 |
| 컨센서스 연도 값이 `-` | 추정치 미제공 항목 | 해당 항목만 N/A 처리 |

**부분 실패는 정상 동작입니다.** `report` 는 일부 소스가 실패해도 나머지를 반환하고
`errors` 키에 실패 내역을 담습니다. 수집되지 않은 항목은 추정으로 채우지 말고 보고서에
"데이터 미수집"으로 표기하세요.

---

## 4. 스크립트 확장 시 유의사항

- **표준 라이브러리만 사용하세요.** 이 환경에는 `requests`, `pandas`, `yfinance` 가 설치되어
  있지 않습니다. `urllib.request` + `json` 으로 충분합니다.
- **새 지표를 추가할 때는 `get_report()` 의 `add()` 패턴을 따르세요.** 개별 소스 실패가
  전체를 중단시키지 않도록 예외를 `errors` 로 흡수하는 구조입니다.
- **Yahoo의 숫자 필드는 `{"raw": 1.23, "fmt": "1.23"}` 형태입니다.** `raw()` 헬퍼로 꺼내세요.
- **`meta.chartPreviousClose` 를 전일 종가로 쓰면 안 됩니다.** 이 값은 "조회 구간 직전"의
  종가라서 `range=1mo` 면 한 달 전 값이 들어옵니다. 일간 등락률에는 `prev_close()` 헬퍼를
  사용하세요.
- **Windows 콘솔 인코딩**: 스크립트가 `sys.stdout.reconfigure(encoding="utf-8")` 을 호출합니다.
  파이프로 넘길 때 깨지면 `PYTHONIOENCODING=utf-8` 을 설정하세요.

---

## 5. 주요 심볼 표기법

| 대상 | 표기 | 예 |
|---|---|---|
| 한국 KOSPI | `<6자리>.KS` | `005930.KS` (삼성전자) |
| 한국 KOSDAQ | `<6자리>.KQ` | `247540.KQ` (에코프로비엠) |
| 미국 | 티커 그대로 | `AAPL`, `NVDA` |
| 미국 클래스주 | 하이픈 | `BRK-B` |
| 지수 | `^` 접두 | `^GSPC`(S&P500), `^IXIC`(나스닥), `^VIX`, `^TNX`(미10년물), `^KS11`(코스피) |
| 환율 | `<통화쌍>=X` | `KRW=X` (원/달러) |
| 원자재 선물 | `<코드>=F` | `CL=F`(WTI), `GC=F`(금), `SI=F`(은) |
| 달러인덱스 | `DX-Y.NYB` | |

스크립트에 6자리 숫자를 넘기면 네이버 자동완성으로 KOSPI/KOSDAQ를 판별해 접미사를
자동으로 붙입니다. 한글 종목명을 넘기면 검색 후 최상위 매치를 사용하며, 어떤 후보 중에서
골랐는지 `resolved_from` 에 기록합니다 — 동명이인 종목이 있을 수 있으니 이 필드를 확인하세요.
