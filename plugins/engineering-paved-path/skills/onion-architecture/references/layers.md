# Layers — the ring↔path map

Read this before placing a new file. In the reference layout every path under the backend
source root belongs to exactly one ring, and the ring is derived from the **filename**, not
from a folder. Paths below are relative to the backend source root; substitute the project's
own names where its conventions file says so.

## Why filenames and not folders

The obvious alternative is `modules/<name>/{domain,application,infrastructure}/`. The
reference layout does not do that, for three reasons:

1. Most Node backends already name their layers by file — `routes.ts`, `service.ts`,
   `repository.ts` — and a team's convention usually says a new module is "`routes.ts` +
   `service.ts`". Adding a second, parallel taxonomy would mean two answers to the same
   question.
2. A `modules/<name>/` folder is a vertical slice (a modular monolith). Each slice carries
   its own onion; the rings run *through* the folder, not around it. Filenames express that
   without nesting every module three levels deeper.
3. ESLint flat config matches on glob patterns, so a filename-derived ring is directly
   enforceable — `files: ['src/modules/*/service.ts']` *is* the ring-2 zone. A folder
   convention would need a plugin and a new dependency.

If the project already uses ring folders, keep them: the map changes, the rules do not.

---

## The map

Example module names come from an ordering domain (`orders`, `invoices`, `customers`).

| Ring | Paths | Notes |
|---|---|---|
| **0 — Domain** | the domain core (optional package) | pure business rules — pricing, tax, state machines. Its only side effects arrive through injected ports. |
| | `contracts/**` | schema contracts: `order`, `invoice`, `customer`, `errors`, … |
| **1 — Ports** | `ports.ts` (or `ports/**`) | `PaymentGateway`, `Mailer`, `ObjectStorage`, `AuthProvider`, `SecretsProvider`, `Clock` |
| | `modules/<name>/types.ts` when type-only | a facade one feature exposes to others — a port that happens to live in a feature folder |
| | `adapters/<concern>/index.ts` when it only declares the interface | an interface declared next to its implementation is still ring 1 |
| **Kernel** | `platform/config.ts`, `platform/errors.ts` | the config object is validated data; the error class is the error taxonomy. Any ring may import both. |
| **2 — Application** | `modules/*/service.ts` | the use cases |
| | `modules/*/helpers.ts`, `modules/*/constants.ts` | pure transforms and literals owned by the slice |
| | `modules/<name>/<use-case>.ts` | a large use case split for size (`orders/checkout.ts`, `orders/refund.ts`) |
| | `modules/_shared/*.ts` that are pure | cross-module pure transforms (money rounding, pagination) |
| | `platform/<service>.ts` with no I/O of its own | application services: a price book, a feature-flag evaluator, a trace builder |
| **3 — Infrastructure** | `adapters/**` | one folder per concern, one file per technology |
| | `db/**` (except the CLI entrypoints below) | schema, client, row types, migrations |
| | `modules/*/repository.ts`, `modules/*/repository/*.repo.ts` | the only place a query is written |
| | `platform/{jobs,events,templates}.ts` | DB-backed job queue, in-process event bus, template loader that reads files |
| **4 — Transport + composition root** | `modules/*/routes.ts` | framework plugins; the HTTP edge |
| | `modules/index.ts` | the static module registry |
| | `app.ts`, `server.ts` | the framework instance and the process entrypoint |
| | `db/migrate.ts`, `db/seed*.ts` | CLI entrypoints: like the composition root they may build repositories (ring 3) and call pure helpers (ring 2), so seed data is produced by the same code paths as runtime |
| | `platform/container.ts` | **the composition root** |
| | `modules/_shared/context.ts` | `getContext(container, req)` — the one shared file that may touch the framework's request type |

`test/**` is outside the rings: tests may import anything, and `adapters/mocks.ts` exists to
be imported by them.

---

## The import matrix

Rows may import columns marked ✅.

| from ↓ / to → | 0 Domain | 1 Ports | Kernel | 2 App | 3 Infra | 4 Root |
|---|---|---|---|---|---|---|
| **0 Domain** | ✅ | — | — | — | — | — |
| **1 Ports** | ✅ | ✅ | — | — | — | — |
| **2 Application** | ✅ | ✅ | ✅ | ✅ | — | — |
| **3 Infrastructure** | ✅ | ✅ | ✅ | — | ✅ | — |
| **4 Root / transport** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Three consequences worth spelling out:

- **Ring 2 cannot import ring 3.** A service reaches persistence through a repository that
  the composition root handed it, and everything else through a port. This is the rule most
  of the lint zones exist to protect.
- **Ring 3 cannot import ring 2.** An adapter never calls a service. If an adapter seems to
  need business logic, the logic belongs in ring 2 and the adapter should return data.
- **Ring 3 cannot import ring 3 across concerns.** `adapters/**` may not import `db/**`, and
  no adapter may import `modules/**`. An adapter that needs to persist something is doing
  two jobs.

Ring 4 is deliberately unconstrained: it is where the concrete world gets assembled.
`platform/container.ts` importing `modules/orders/repository.ts` is correct by this reading —
every *other* file in `platform/` importing `modules/**` is not, and the boundary checker
enforces that difference.

---

## Naming

Names carry the ring. Keep them.

| Concept | Convention | Examples |
|---|---|---|
| Port (outbound interface) | role noun — `Provider` / `Client` / `Gateway` / bare | `SecretsProvider`, `PaymentGateway`, `Mailer`, `ObjectStorage`, `Clock` |
| Adapter (implementation) | `<Tech><Interface>` | `EnvSecretsProvider`, `StripePaymentGateway`, `SmtpMailer`, `S3ObjectStorage`, `SystemClock` |
| Test double | `Mock<Interface>`, in `adapters/mocks.ts` | `MockPaymentGateway`, `MockMailer`, `FixedClock` |
| Use case | `<Feature>Service` | `OrderService`, `InvoiceService`, `CustomerService` |
| Data access | `<Feature>Repository` | `OrderRepository`, `InvoiceRepository` |
| Adapter file | `adapters/<concern>/<tech>.ts` | `adapters/payments/stripe.ts` |

Two words are in common use for the same node: **port** = the interface, **adapter** = the
class that implements it. The `adapters/` folder holds adapters; the interfaces they
implement live in ring 1.

Do not rename existing identifiers to add a `Port` suffix. Renaming churns every call site
to teach a vocabulary the table above already teaches.

---

## Adding a new outbound dependency — the five edits

Anything that talks to the world outside this process lands as five edits, in this order:

1. **Interface** in `ports.ts` (ring 1) — the smallest surface the application actually
   needs, expressed in the project's own types, not the SDK's.
2. **Adapter** in `adapters/<concern>/<tech>.ts` (ring 3) — `implements` that interface; the
   SDK import lives here and nowhere else.
3. **Mock** in `adapters/mocks.ts` — without it the port is unfalsifiable and rule 9 has no
   teeth.
4. **Composition-root entry** in `platform/container.ts` — a lazy getter, plus a field in
   the overrides type so a test can inject the mock. Anything that needs a secret is `async`
   and resolves it through `SecretsProvider`.
5. **Consumer** in ring 2 — takes the interface, never the concrete class.

Skipping step 3 is how a port quietly becomes decoration; skipping step 4 is how a service
ends up importing an SDK.
