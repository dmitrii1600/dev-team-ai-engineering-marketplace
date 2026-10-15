# AGENTS.md (sample orders project)

Layout:

- `src/orders/domain/` — ring 0, domain types and pure rules. Imports nothing outside `domain/`.
- `src/orders/ports/` — ring 1, interfaces for everything external.
- `src/orders/application/` — ring 2, services. Receive ports through the constructor.
- `src/orders/adapters/` — ring 3, Postgres, HTTP clients, file system.
- `src/orders/http/` — ring 4, Fastify routes and the composition root.
- `packages/pricing-core/` — the pricing engine, a pure library shared by the API and the
  `web/` Next.js frontend.
- `web/` — Next.js App Router frontend.

## Rules

- `core-purity` — `packages/pricing-core` is pure: no `node:fs`, no network, no `process.env`.
  Data it needs is passed in through `QuoteInput`.
- `discount-cap-gate` — every quote passes through `applyDiscountCaps()` before it is
  returned. Listed under "Do not touch": never remove or bypass it.
- `web-fetch-through-hooks` — components in `web/` fetch through hooks in `web/lib/hooks/`.
