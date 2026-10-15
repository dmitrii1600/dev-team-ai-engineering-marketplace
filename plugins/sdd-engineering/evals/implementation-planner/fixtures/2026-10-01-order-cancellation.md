# Spec: Self-service order cancellation
Spec ID: SPEC-2026-10-01-order-cancellation
Status: approved
Supersedes: none
Packages: single app

## Problem and user
Customers of the orders API cannot cancel an order themselves. They email support, and a
support agent cancels the order with a manual UPDATE in the production database, which
takes up to a day and has cancelled the wrong order twice this quarter.
**Request vs tree:** matches — there is no cancel route (src/orders/routes.ts:5-12) and no
cancellation timestamp on `Order` (src/orders/domain.ts:3-9).

## Goals / Non-goals
**Goals**
- A customer cancels their own unshipped order through the API, without support.
**Non-goals**
- Refunds for paid orders (billing, separate spec).
- A cancel button in the web client (follow-up spec).

## User stories
- **US-1** As a customer, I want to cancel my order before it ships so that I am not charged for something I no longer want.

## Acceptance criteria (EARS)
- **AC-1** WHEN a customer requests cancellation of their own order in status `pending` or `paid`, the system shall set the status to `cancelled` and record the cancellation time. · traces: US-1 · verify: unit
- **AC-2** WHEN an order is cancelled, the system shall return the updated order with status `cancelled`. · traces: US-1 · verify: integration

## Edge cases
- **EC-1** IF the order is in status `shipped`, THEN the system shall reject the cancellation with a conflict error and leave the order unchanged. · traces: DR-1 · verify: unit
- **EC-2** IF the order belongs to another customer, THEN the system shall respond as if the order does not exist. · traces: DR-2 · verify: integration
- **EC-3** IF the order is already `cancelled`, THEN the system shall return it unchanged. · traces: DR-1 · verify: unit

## Design review
**Source:** none — checklist run against the tree
### Gaps
- **DR-1** no transition rule for cancellation exists in the domain (src/orders/domain.ts:11-13 covers shipping only)
### Uncovered cases
- **DR-2** ownership is not checked by any existing route → EC-2
### Module interactions
| From | To | Through | Contract |
|---|---|---|---|
| API client | `orders` module | `POST /orders/:id/cancel` | `CancelOrderResponse` in src/contracts/ · new |
### UX improvements
- none

## Non-functional requirements
- **NFR-1** Layering: the cancellation rule lives in the domain and has no framework import. · verify: static

## Traceability
| Requirement | Traces to | Verify how |
|---|---|---|
| AC-1 | US-1 | unit |
| AC-2 | US-1 | integration |
| EC-1 | DR-1 | unit |
| EC-2 | DR-2 | integration |
| EC-3 | DR-1 | unit |
| NFR-1 | US-1 | static |

## Inputs and provenance
| Kind | Source | Notes |
|---|---|---|
| request | support ticket summary | pasted by the product owner |

## Untrusted inputs
| Input | Source | Validation | On invalid |
|---|---|---|---|
| order id | path parameter | uuid | 400 |

## Open questions
- none

## Resolved decisions
- none
