# Implementation Plan: Self-service order cancellation

**Plan ID:** 2026-10-01-order-cancellation  ·  **Spec:** [specs/2026-10-01-order-cancellation.md](specs/2026-10-01-order-cancellation.md)  ·
**Execution mode:** single-agent  ·  **Packages:** single app  ·  **Assumptions:** none

## Summary
Add a domain rule for cancelling an order, a `cancel` use case on `OrdersService`, and a
`POST /orders/:id/cancel` route.

## Requirements review
Ledger kept from Step 0: AC-1, AC-2, EC-1, EC-2, EC-3, NFR-1 — all clear. Execution mode:
stated by caller. Verify commands: configured.

## Constraints
- Relative imports carry `.js` (AGENTS.md:2).
- The cancellation rule lives in src/orders/domain.ts with no framework import (NFR-1).
- Do not touch src/billing/ (AGENTS.md:15) or applied migrations (AGENTS.md:14).

## Skill contract
| Files | Skills (write-time) | Why |
|---|---|---|
| `src/orders/domain.ts`, `src/orders/service.ts` | `engineering-paved-path:onion-architecture` | domain rule + use case, ring placement |
| `src/orders/routes.ts`, `src/contracts/orders.ts` | `engineering-paved-path:onion-architecture`, `engineering-paved-path:fastify-best-practices` | HTTP surface (`engineering-paved-path:security` is review-time) |

## Steps
### 1. Domain rule for cancellation
- **Files:** `src/orders/domain.ts` (edit), `src/orders/domain.test.ts` (new)
- **Do:** add `cancelledAt?: Date` to `Order`; add `cancel(order, now)` that returns the
  cancelled order for `pending`/`paid`, returns it unchanged when already `cancelled`, and
  throws `OrderNotCancellableError` for `shipped`.
- **Done when:** unit tests cover pending, paid, shipped, cancelled.
- **Verify:** `npx vitest run src/orders/domain.test.ts`

### 2. Use case
- **Files:** `src/orders/service.ts` (edit), `src/orders/service.test.ts` (new)
- **Do:** add `OrdersService.cancel(id, customerId)`; an order of another customer is
  reported as not found.
- **Done when:** unit tests cover ownership and the shipped conflict.
- **Verify:** `npx vitest run src/orders/service.test.ts`

### 3. Route and contract
- **Files:** `src/contracts/orders.ts` (edit), `src/orders/routes.ts` (edit)
- **Do:** add `CancelOrderResponse`; add `POST /orders/:id/cancel` mapping not found → 404,
  `OrderNotCancellableError` → 409.
- **Done when:** the route compiles and lints.
- **Verify:** `npm run lint && npm run typecheck`

### 4. Final check
- **Verify:** `npm run lint && npm run typecheck` then `npx vitest run` — the one full run

## Test plan
| When | Command | Proves |
|---|---|---|
| per step | `npm run lint && npm run typecheck` | lint · typecheck |
| per test file | `npx vitest run {file}` | the test a step adds |
| final | `npx vitest run` | the whole suite, once |

## Out of scope
- Refunds (billing, separate spec).
- Web client cancel button.
- Any change under src/billing/.

## Open questions
- none
