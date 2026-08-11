# 스펙 검증 리포트

> 대상: docs/PRD.md, docs/TECH_SPEC.md, src/ · prisma/ · tests/
> 검증일: 2026-08-11
> 방식: 3단계 독립 검증 (각 검증자는 서로의 결론을 참조하지 않음). 모든 판정은 문서 주장이 아니라 실제 코드 근거(`파일:줄번호`)에 기반.

## 종합 결과

| 단계 | 결과 | 점수 |
|------|------|------|
| Stage 1. PRD ↔ 코드 | ⚠️ 조건부 | 28/30 PASS (PARTIAL 2, FAIL 0) |
| Stage 2. TECH_SPEC ↔ 코드 | ✅ PASS | 245/249 (98.4%) |
| Stage 3. 코드 품질 | ❌ 조치 필요 | 2/5 항목 양호 |
| **종합** | **⚠️ 조건부 통과** | **결제 실패 경로 보강 후 배포 권장** |

기능 요구사항과 설계 일치도는 높습니다. 감점은 거의 전부 **"실패했을 때 아무도 모른다"**는 한 가지 패턴에 몰려 있습니다 — 예외는 성실히 잡히지만, 잡은 뒤 INCIDENT 승격·운영자 통지·재시도로 이어지지 않는 경로가 결제·환불의 마지막 구간에 집중돼 있습니다.

---

## Stage 1: PRD ↔ 코드 (28/30)

| 기능 | 결과 |
|---|---|
| 기능 1 — 템플릿 탐색·미리보기 | 9/9 PASS |
| 기능 2 — 통화 선택 결제·주문 생성 | 10/12 PASS (F2-AC9, F2-AC11 PARTIAL) |
| 기능 3 — 라이브러리 열람·다운로드 | 9/9 PASS |

### 코드로 강제됨이 확인된 핵심 방어선

| AC | 강제 수단 |
|---|---|
| F1-AC6 미구매 원문 미노출 | 타입에 `body` 부재(`types/domain.ts:37-53`) → repository select에 부재 → `server-only` 번들 격리 → `assertTemplateAccess` 게이트. 전역에서 `body: true` select는 `library.service.ts:97` 단 1곳이며 그 앞줄에서 게이트 통과 |
| F2-AC2 통화 선택으로만 결제사 결정 | `provider.registry.ts:17-38`의 정적 매핑만 사용. IP·국가·Accept-Language 참조 0건 |
| F2-AC5 리디렉션 확정 금지 | `order.state-machine.ts:46-56`이 `PAID` 전이 소스에서 `REDIRECT`를 구조적으로 배제. `confirmOrderPaid` 호출처는 webhook/reconcile/expire 3곳뿐 |
| F2-AC6 웹훅 멱등 | 삽입-우선 3중 방어(`uq_webhook_event` → `FOR UPDATE` + 상태 가드 → `uq_library_owner`/`uq_library_order`) |
| F3-AC5 / F3-AC9 접근 제어 | `access.ts:39` 단일 게이트. 환불 건은 `status !== 'ACTIVE'`로 차단 |

### PARTIAL 2건

**F2-AC9 (30분 만료)** — 만료 판정이 배치에만 존재하는데 **배치를 주기 실행할 설정이 저장소에 없습니다.** `vercel.json` 없음, `.github/` 없음, `package.json`에 cron 없음. `docker-compose.yml`의 cron 컨테이너는 로컬 개발용입니다. 또한 `getOrderStatusForUser`가 `expiresAt`을 보지 않아, 30분이 지난 주문도 화면에서 계속 "결제 확인 중"으로 표시됩니다.

**F2-AC11 (확정 실패 구제)** — 세 가지 결함:
1. "최대 24시간 내 처리" 안내가 **24시간이 지난 뒤에야** 표시됩니다. `delayed`는 `reconcileState==='INCIDENT'`일 때만 true인데(`order.service.ts:433`), INCIDENT는 배치가 24시간 경과를 확인한 뒤 설정됩니다(`reconcile-payments.job.ts:114-122`). 요구된 안내 시점과 정반대입니다.
2. "운영자가 조회할 수 있고"에 해당하는 조회 수단이 없습니다. `findIncidentOrders()`의 유일한 호출처가 배치 내부이고, 그마저 해당 주기에 **신규** INCIDENT가 생겼을 때만 메일을 보냅니다.
3. 구제 배치 자체가 스케줄되지 않습니다(F2-AC9와 동일 원인).

### PASS이나 잔여 리스크

- **환불 요청 폼에 도달할 경로가 없음** — `/{locale}/orders/{orderNo}` 페이지는 구현됐지만 링크가 앱 어디에도 없습니다. 라이브러리 카드는 `/library/{templateId}`만, 구매 확인 메일도 라이브러리 URL만 담습니다. 사용자가 주문번호를 직접 알아내 URL을 입력해야만 환불 요청이 가능합니다.
- **F2-AC8** — 결제 화면 렌더 시점과 폼 제출 시점 사이에 가격이 바뀌면 표시 금액과 결제 금액이 달라질 수 있습니다. 주문 생성 이후는 완전히 고정되므로 AC 문언은 충족합니다.

---

## Stage 2: TECH_SPEC ↔ 코드 (245/249, 98.4%)

| 영역 | 일치 | 비율 |
|---|---|---|
| 파일 구조 (4장 트리) | 127/127 | 100% |
| 타입·함수 시그니처 (5·6장) | 53/56 | 94.6% |
| API 엔드포인트 (7장) | 32/33 | 97.0% |
| 데이터 모델 (3장) | 33/33 | 100% |

### 문서 자체의 개수 모순 — 소재 특정됨

TECH_SPEC 4장 본문은 "126개", 카테고리 합은 128, 트리 실측은 127입니다. 원인은 **"페이지 15"** 항목으로, 트리의 `[locale]/` 하위 페이지는 실제 14개입니다. 나머지 11개 카테고리는 트리와 정확히 일치합니다. **문서 결함이며 코드 결함이 아닙니다.**

### 스펙 이탈 8건 — 전부 정당

| 이탈 | 판정 근거 |
|---|---|
| Auth.js 세션 database → jwt | Credentials Provider는 DB 세션과 구조적으로 양립 불가. 스펙이 요구한 조합 자체가 성립 불가능 |
| Paddle SDK → REST 직접 호출 | PRD 제약은 "Paddle Billing 사용"이지 특정 npm 패키지가 아님. `Paddle-Version: 1` 헤더로 스키마 고정 |
| `uq_orders_paid_owner`를 raw SQL로만 | Prisma는 부분 유니크를 표현 불가. `@@unique`로 쓰면 전역 유니크가 되어 재구매가 막힘 — **raw SQL이 유일한 정답** |
| `ClientCheckoutPayload` 위치 이동 | `provider.types.ts`가 server-only라 클라이언트 import 시 빌드 실패. re-export로 스펙 경로도 유효 |
| `CheckoutButton`이 3개 컴포넌트 포함 | 통화·동의·금액 상태가 상호 의존. RSC 페이지에 둘 수 없어 클라이언트 경계 하나로 묶는 것이 유일한 방법 |
| `user.service.ts` 추가 | 스펙이 회원가입 진입점을 REST + 서버 액션 **둘 다** 요구. 공유 계층은 논리적 귀결 |
| `/api/templates`에 `locale` 파라미터 | 해당 라우트는 `[locale]` 밖이고 미들웨어 matcher가 `/api` 제외. 결제 경로로 새지 않음을 확인 |
| 미들웨어가 쿠키 존재만 확인 | Edge에서 Prisma·argon2 실행 불가. 실제 인가는 `requireUser()`/`assertTemplateAccess()`가 Node 런타임에서 재검증 — 위조 쿠키로 얻는 것은 401/403뿐 |

8건 모두 코드 주석에 이탈 사유가 명시돼 있어, 은닉된 이탈이 아니라 문서화된 설계 결정으로 다뤄졌습니다.

### 불일치 4건 (경미)

- `CreateCheckoutInput`에 `templateSlug` 추가 (Paddle price 매핑 키가 slug)
- `StartCheckoutInput`에 `userEmail` 추가, `policyAgreed: true` → `boolean` (런타임 방어는 유지)
- `getTemplateDetail(slug)` → `(slug, locale)` (카테고리명 i18n)
- 다운로드 403의 error code가 스펙 `NOT_OWNED`/`REFUNDED`가 아니라 `FORBIDDEN` + `details.reason`

---

## Stage 3: 코드 품질 (2/5)

| 항목 | 판정 |
|---|---|
| TypeScript 타입 안전성 | ⚠️ 주의 |
| 에러 처리 | ❌ 문제 |
| 동시성·정합성 | ❌ 문제 |
| 접근성 | ✅ 양호 |
| 코드 스타일·일관성 | ✅ 양호 |

### Critical

**C-1. 30분 만료 이후 결제가 성사되면 "돈은 받고 미지급"이 되며 아무도 알지 못한다**

코드로 확인된 사실 3가지:
1. `orders.expiresAt`이 **결제사에 전달되지 않습니다.** Toss `clientPayload`·Paddle `createTransaction` 본문 어디에도 만료 필드가 없어, 결제사 쪽 결제는 30분이 지나도 성공할 수 있습니다.
2. `expireOrders()`의 조회→만료 사이에 원자성이 없습니다. `fetchPayment` 왕복 중 결제가 완료돼도 웹훅 미도착이면 상태는 PENDING이라 만료가 성립합니다.
3. 뒤늦은 성공 웹훅은 **조용히 버려집니다.** `confirmOrderPaid`의 catch(`order.service.ts:260-278`)는 `AmountMismatchError`와 유니크 위반만 INCIDENT로 승격하고, `assertTransition('EXPIRED','PAID')`가 던지는 `InvalidOrderTransitionError`는 그대로 재던집니다. 웹훅 핸들러는 FAILED 기록 + 로그만 남기고 200을 반환합니다. 그리고 구제 대상이 아닙니다 — `order.repository.ts:411`과 `:516`이 모두 `status: { in: ['PENDING','CONFIRMING'] }`로 필터하여 **EXPIRED를 제외**합니다.

결과: 카드 대금은 승인됐는데 라이브러리 미지급, `reconcile_state`는 `RESOLVED`, 운영자 리포트에도 미포함. F2-AC11 "미지급 0건"이 정면으로 깨집니다.

### High

**H-1. 결제사 환불 호출 실패가 삼켜지고 사용자에게는 "접수 완료"로 표시됨** (`refund.service.ts:138-140`)
환불 API가 5xx·타임아웃을 내면 catch가 로그만 남기고 `{status:'REQUESTED'}`를 반환합니다. 화면은 "접수되었습니다"를 표시합니다. 그런데 재시도 주체가 없습니다 — 배치는 `PENDING|CONFIRMING`만 스캔하므로 이 주문은 어떤 리포트에도 잡히지 않습니다. 코드 주석은 "완료는 웹훅 또는 운영자 재시도가 담당"이라고 하지만 그 운영자 재시도 수단이 존재하지 않습니다. `providerPaymentId`가 null이면 결제사 호출 자체를 건너뛰고도 동일하게 성공을 반환합니다.

**H-2. Toss 승인에 주문 스냅샷이 아니라 결제사가 알려준 금액을 되돌려 보냄** (`toss.provider.ts:180-187`)
`confirmPayment({ amount: payment.totalAmount })` — Toss confirm의 `amount`는 가맹점 의도 금액과 실제 결제 금액의 불일치를 **결제사가 거부하도록** 만든 방어 장치인데, 결제사 보관값을 그대로 넣으면 항상 일치해 무력화됩니다. 이후 `assertAmountMatches`가 지급은 막지만, 사용자 카드에서는 변조 금액이 이미 승인·매입된 상태가 됩니다.

**H-3. 결제사 조회 API 응답만 Zod 검증 없이 타입 단언** (`toss.client.ts:124`, `paddle.client.ts:113,126`)
이 프로젝트는 환경변수·요청 본문·쿼리·폼·웹훅 본문을 전부 검증합니다. 유일하게 결제사 조회 응답만 무검증입니다. 응답 스키마가 바뀌면 확정이 영구히 멈추면서도 시스템은 정상으로 보입니다. Paddle의 `readTotal`은 `details.totals`가 없으면 `'0.00'`을 반환해 전 주문 INCIDENT가 됩니다.

### Medium (요약)

| # | 내용 |
|---|---|
| M-1 | `checkout/toss/fail` 라우트에 인증·소유자 검증 없음. `message` 길이 제한도 없음. 주문번호는 CSPRNG 31^8이라 추측은 비현실적이나, 번호가 유출되면 타인의 결제를 종료 상태로 만들 수 있음 |
| M-2 | 서명 실패 웹훅 원문이 매 요청마다 새 행으로 무제한 적재 (스토리지 DoS) |
| M-3 | `webhook.handler.ts:60-62`의 두 분기가 동일한 값 반환. 주석이 말한 200 경로가 없어 본문 파싱 실패 시 401 → 결제사 영구 재시도 |
| M-4 | 환불 자격 판정(열람 여부)이 잠금 밖에서 수행 (TOCTOU). 중복 환불은 유니크 제약이 막음 |
| M-5 | 구매 확인 메일이 단발성. `FAILED` 상태를 재시도하는 배치가 없어 Resend 일시 장애 시 영구 유실 |
| M-6 | Paddle 스냅샷이 응답 통화를 무시하고 `'USD'` 하드코딩. 다른 통화 거래가 숫자만 같으면 금액 대조 통과 |
| M-7 | `globals.css`의 `overflow-x: hidden`은 360px 오버플로를 방지하는 게 아니라 **은폐**함. 회귀 탐지를 방해 |

### 문제 없음이 확인된 부분

- `any`/`as any`/`@ts-ignore`/`@ts-expect-error` **0건**. `noUncheckedIndexedAccess`가 실제로 지켜짐
- **프롬프트 전문이 로그·예외 메시지로 새는 경로 없음.** 비밀번호·시크릿·카드정보도 마찬가지
- 확정 트랜잭션 안에 외부 HTTP 호출 **없음** (전 경로)
- 웹훅 멱등이 검사-후-삽입이 아닌 **삽입-우선 패턴**으로 경합에 안전
- 보안·결제 로직 중복 구현 없음 (확정·회원생성·접근제어·통화매핑 모두 단일 진입점)
- 접근성: skip link, `:focus-visible` 전역 링, `htmlFor` 연결, `fieldset/legend`, `aria-live`, 모든 이미지 alt. `--muted-foreground`는 흰 배경 대비 약 7.4:1

---

## 조치 권고 (우선순위 순)

### 1순위 — 배포 전 필수

1. **종료 상태 전이 실패를 INCIDENT로 승격** (C-1)
   `order.service.ts:260`의 catch에 `InvalidOrderTransitionError` 분기 추가 + `order.repository.ts:516`의 status 필터 제거(또는 EXPIRED·FAILED 포함). 약 10줄로 "돈은 받고 미지급"이 최소한 **탐지 가능**해집니다. 이어서 결제사에 만료 시각을 전달해 근본 원인 제거.

2. **환불 실패 경로에 알림·재시도 부여** (H-1)
   catch에서 `markReconcileState(order.id,'INCIDENT')` 호출, 리포트 대상에 `REFUND_REQUESTED` 포함. 현재 사용자에게 잘못된 성공을 보여주는 유일한 지점입니다.

3. **배치 스케줄러 설정 추가** (F2-AC9, F2-AC11)
   `vercel.json`의 `crons` 또는 배포 환경의 스케줄러. 현재 구제 안전망이 로컬 개발 환경에서만 돌아갑니다.

4. **Toss confirm에 주문 스냅샷 금액 전달** (H-2)

### 2순위 — 출시 전 권장

5. 결제사 조회 응답에 Zod 스키마 도입, `readTotal`의 `'0.00'` 폴백 제거 (H-3)
6. `delayed` 판정을 "CONFIRMING 일정 시간 경과"로 완화해 24시간 안내를 지연 초기에 노출 (F2-AC11)
7. 환불 요청 폼으로 가는 링크 추가 (라이브러리 카드 또는 구매 확인 메일)
8. 리디렉션 라우트에 소유자 검증 + `code`/`message` 길이 제한 (M-1)
9. 웹훅 본문 파싱 실패를 200으로 분기 (M-3)
10. raw SQL 제약 9개의 존재를 단언하는 회귀 테스트 — `prisma migrate dev`가 조용히 드롭하는 것이 중복 지급 방지 체계의 유일한 잠재 붕괴 경로

### 3순위 — 정리

11. TECH_SPEC 4장 개수 정정(126 → 127, "페이지 15" → 14), 1·8장 세션 전략을 jwt로 갱신, 5·6장 시그니처 3건 반영
12. 죽은 코드 제거 — `requireOwner()`, `isOrderNo()`, `rejectRefund()`
13. `globals.css`의 `overflow-x: hidden` 제거 후 E2E에서 `scrollWidth <= innerWidth` 검증 (M-7)
14. `CheckoutButton` → `CheckoutForm` 리네이밍

---

## 검증 범위 밖 (미확인)

- **E2E 4종 미실행** — DB 기동·시드·결제사 샌드박스 키 필요
- **실제 결제 흐름 미검증** — 토스·Paddle 샌드박스 연동은 코드 수준으로만 확인
- **`tests/integration/` 부재** — TECH_SPEC 8장이 F2-AC3/4/6/8/10/11에 Integration 테스트를 요구하지만 4장 트리에 없어 보류됨. 현재 이 6개 AC는 단위 + E2E로만 간접 검증
