# Rules

Eleven rules. Each: the statement, why it exists, a ✅ and a ❌, and what checks it. Rings
are defined in [layers.md](layers.md). Examples use the reference layout and an ordering
domain, with Fastify, Drizzle and Zod as the sample stack; the rules hold for any HTTP
framework, ORM and schema library.

"Checked by **lint**" means an import zone in the project's linter; "**boundary checker**"
means a graph tool such as dependency-cruiser or eslint-plugin-boundaries; "**review**" means
no machine check can see it. Sample configs are in [enforcement.md](enforcement.md).

---

## 1 — HTTP framework types only in ring 4

**Why.** HTTP is a delivery mechanism. A use case that names `FastifyRequest` can only ever
be driven by HTTP — not by the job runner, not by a CLI, not by a test that calls it
directly. Cockburn's original framing: the application must be drivable by users, programs
and test scripts alike.

✅ The route owns the framework and hands the service plain arguments:

```ts
// modules/orders/routes.ts (ring 4)
const app = appBase.withTypeProvider<ZodTypeProvider>();
const service = new OrderService(new OrderRepository(app.container.db), app.container.payments);
app.post('/orders', { schema: { body: CreateOrderInput } }, async (req, reply) => {
  const { tenantId, userId } = await getContext(app.container, req);
  const order = await service.place(tenantId, userId, req.body);
  return reply.code(201).send(order);
});
```

❌ Passing `req.log` into a service so it can log. If a use case genuinely needs a logger,
declare a structural `Logger` type in ring 2 (`{ info(msg: string, data?: object): void }`)
rather than importing the framework's or the logging library's type. **Name the capability
you need, in your own ring.**

**Exception.** The shared request-context helper (`modules/_shared/context.ts`) imports the
framework's request type — it is the adapter from "a request" to "a tenancy context", and it
is ring 4. The port it calls stays request-agnostic: `AuthProvider.currentUser(req: unknown)`.

**Checked by** lint.

---

## 2 — The ORM, the DB schema and the DB client only in ring 3

**Why.** "The database is not the center. It is external." A query in a route handler fuses
transport, business rules and persistence into one file that cannot be tested without a
database and cannot be reused by the job runner.

✅ The only Drizzle in the slice lives in its repository:

```ts
// modules/orders/repository.ts (ring 3)
import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

const [row] = await this.db.select().from(t.orders)
  .where(and(eq(t.orders.tenantId, tenantId), eq(t.orders.id, orderId)));
```

❌ A `routes.ts` that imports `drizzle-orm`, queries `t.orders`, upserts `t.invoices` and
computes per-order aggregates inline. Fat route files like this are the most common erosion;
grandfather them if they exist (see [enforcement.md](enforcement.md)), never copy them.

**Reference shape for a module that outgrows one file:** `repository.ts` as a thin facade
over `repository/{order,line-item,refund}.repo.ts` — split by entity, one ORM import each.

**Checked by** lint.

---

## 3 — A vendor SDK only in `adapters/**`

**Why.** The SDK is the thing most likely to change and the thing hardest to fake. Behind an
interface it is one file to rewrite; in a service it is a rewrite of the service. Most teams
already say it in prose: *"a service that imports an SDK directly is a bug."*

List every SDK the project uses in the lint zone — typically payment (`stripe`), cloud
(`@aws-sdk/*`), mail (`nodemailer`), LLM (`openai`, `@anthropic-ai/sdk`), source hosting
(`octokit`), cache (`ioredis`), the raw DB driver (`pg`, `postgres`), and native helpers.

✅ `adapters/payments/stripe.ts` implements `PaymentGateway`; `adapters/mail/smtp.ts`
implements `Mailer`; the service only ever sees the interface.

❌ A feature facade (`modules/search/service.ts`) that imports `adapters/search/indexer.ts`
and `node:fs/promises` directly. It is a ring-2 file doing ring-3 work. A facade whose own
documentation says "features call this, never the libraries" should hold itself to that too.

**Checked by** lint.

---

## 4 — `node:fs`, `node:child_process` only in ring 3

**Why.** The filesystem is infrastructure for the same reason the database is. A use case
that reads a file needs a disk to be tested.

`node:path`, `node:url` and `node:crypto` are **not** restricted — they are pure functions
over strings and bytes, not I/O.

❌ A service that calls `readFile` to load an invoice template. The template loader belongs
in ring 3 (`platform/templates.ts` or an adapter); the service receives the rendered text or
a `TemplateRenderer` port.

**Checked by** lint.

---

## 5 — No ORM row type in a ring-2 public signature

**Why.** An ORM row (Drizzle `$inferSelect`, a Prisma model type, a TypeORM entity) is the
shape of a table, and a table's shape is a persistence decision. When it becomes a service's
parameter type, the column list becomes part of the business contract and every rename
ripples outward. Keep schema types inside the repository boundary.

✅ The service returns the contract type, not the row:

```ts
// modules/orders/service.ts (ring 2)
async place(tenantId: string, userId: string, input: CreateOrderInput): Promise<Order>
```

with `toOrderDto` in `helpers.ts` doing row → DTO.

❌ `async refund(order: typeof t.orders.$inferSelect)`. A shared `db/rows.ts` that exports
row types for every module makes this convenient across the codebase — convenient, and the
widest crack an onion usually has.

**Fix pattern.** Map at the repository edge, in `helpers.ts`, and give the use case the
narrow shape it actually reads. Often that is three fields, not a table.

**Checked by** review — a type in a signature is not an import, so no linter sees it. Look
for it whenever you touch a service.

---

## 6 — Validate once, at the boundary

**Why.** "Parse, don't validate": the value that leaves the boundary should already be the
exact shape the inner rings want, so nothing inward re-checks. Fastify does this
declaratively — an invalid body is rejected *before* the handler runs, and the same schema
drives response serialization.

✅ `{ schema: { body: CreateOrderInput } }` on the route; the handler receives a typed
`req.body`.

❌ `const body = RefundRequest.parse(req.body ?? {})` inside the handler. Even when it is
deliberate (every field optional, empty body allowed), it is the shape that spreads: once one
handler parses by hand, the next one does too. Express the tolerance in the schema instead.

**Checked by** review.

---

## 7 — A contract is a wire DTO, not a domain model

**Why.** Many TypeScript backends make the schema contract the single definition across
validation, serialization and the client's type — a deliberate, load-bearing choice this
skill does not fight. What it protects is the *direction*: the contract is data flowing
inward, not a base class the domain inherits. Ring 2 may hold a `z.infer` type; ring 2
importing the schema library to re-parse means validation leaked out of ring 4.

✅ `import { type Order } from '../../contracts/order.js'` in a service. A type, no runtime
schema.

✅ **Sanctioned exception:** a port whose contract genuinely *is* a schema. A
structured-output LLM call (`StructuredRequest.schema: z.ZodType<T>`) or a form-builder port
needs the schema as a value to do its job. A schema-as-value there is the domain concept,
not a validation leak. Name such exceptions explicitly in the port's doc comment.

❌ A service calling `Order.parse(...)` on data that already crossed a validated route. That
is a second source of truth about the same bytes.

**Checked by** lint for the import (allow type-only imports); review for intent.

---

## 8 — Everything external goes through a port resolved from the composition root

**Why.** This is the dependency-inversion half of the onion: the inner ring declares the
interface, the outer ring supplies the implementation at runtime. It is also what makes a
hermetic unit-test suite possible — every outbound call can be a mock, so the fast suite runs
without Docker, a network or a database.

✅ Lazy getters, an `async` resolve for anything needing a secret, and an overrides object as
the single test seam:

```ts
// platform/container.ts (ring 4)
get payments(): PaymentGateway {
  if (this.overrides.payments) return this.overrides.payments;
  this._payments ??= new StripePaymentGateway(this.config.payments);
  return this._payments;
}
```

✅ **`SecretsProvider` is the exemplar boundary.** One port, one implementation that is the
single place reading `process.env` for secrets, and a config object that deliberately does
not contain secrets. Even `process.env` is constructor-injected. If the port has an optional
write method (`set?`), callers branch on its presence rather than assuming a writable backend.

❌ An auth adapter importing `db/client.ts` and `db/schema.ts` to look up users. Ring 3
reaching sideways into another ring-3 concern — either accept a lookup function, or give the
lookup its own small port.

**Checked by** lint (rule 3) and the boundary checker (rule 10).

---

## 9 — A service takes the ports it needs, not the whole container

**Why.** `constructor(private container: Container)` is service location: the dependencies
are invisible in the signature, discovered only by reading the body, and a test must build a
container to exercise one method. Constructor injection makes the dependency list the type.
The container stays what it should be — the composition root that wires, not a registry the
code queries.

❌ `export class OrderService { constructor(private container: Container) {} }` — and inside,
`this.container.payments.charge(...)`, `this.container.db.select(...)`.

✅ The shape for new code:

```ts
export class InvoiceService {
  constructor(private readonly repo: InvoiceRepository, private readonly mailer: Mailer) {}
}
// routes.ts (ring 4):
const service = new InvoiceService(new InvoiceRepository(container.db), container.mailer);
```

**Migrating an existing service is not required** to land a feature. If you are already
rewriting its constructor, take the ports; otherwise leave it and do not widen it.

**Checked by** review.

---

## 10 — No sideways or outward imports between folders

Four edges, all invisible to per-file lint zones:

| Forbidden edge | Why |
|---|---|
| `adapters/**` → `db/**` | an adapter that persists is doing two jobs |
| `adapters/**` → `modules/**` | infrastructure must not know features |
| `platform/**` (except the composition root) → `modules/**` | keeps the kernel independent of features |
| `modules/a/**` → `modules/b/**` | slices stay independent; shared entities are resolved from the composition root (`container.customerRepo`) instead of reaching into another module's folder |

The composition root is exempt from the third row by definition — it is the one place
allowed to know every concrete class. A `modules/_shared/` folder for genuinely cross-cutting
pure code is usually exempt from the fourth.

**Checked by** the boundary checker.

---

## 11 — A new module is `routes.ts` + `service.ts` (+ `repository.ts`)

**Why.** Modules that skip the service put their queries and rules in the route, and the
erosion is visible in their line counts. The minimum slice is the cheapest place to stop it.

A new module:

```
modules/<name>/
├── routes.ts        default framework plugin      (ring 4)
├── service.ts       the use cases                 (ring 2)
├── repository.ts    every query, if it has any    (ring 3)
├── helpers.ts       pure transforms, optional     (ring 2)
└── constants.ts     literals, optional            (ring 2)
```

plus one import and one entry in the module registry (`modules/index.ts`). Prefer static
registration: filesystem autoload often does not survive `tsx`, bundlers or test runners.

A module with no persistence and no logic — a pure passthrough — may be routes-only, but say
so in a comment. The default is the full slice.

**Checked by** review.

---

## Sources

The rules above are an application of a small number of well-documented ideas. The
`medium.com` links answer 403 to a bare fetch (bot wall, not a dead link) and need a browser.

**Onion Architecture**
- Jeffrey Palermo — [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) ·
  [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) ·
  [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) ·
  [part 4, after four years](http://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/)
  — the dependency rule, "the database is not the center", and why outer layers may call any
  inner layer directly.
- Herberto Graça —
  [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)
  ([Medium mirror](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85))
  — how Onion relates to Ports & Adapters and DDD.

**Ports, adapters, dependency injection**
- Alistair Cockburn — [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) (2005 original) ·
  [Wikipedia summary](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))
- Mark Seemann — [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) — why
  the container is ring 4 and why nothing else should reference it (rules 9, 10).
- [Ports and Adapters explained with two real codebases](https://saadh393.github.io/blog/adapter-port-architecture-two-cases)
  — "business logic may import ports, never adapters".
- [TSH — Hexagonal architecture: overview and best practices](https://tsh.io/blog/hexagonal-architecture)

**Per tool**
- Fastify — [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) ·
  [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) ·
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) — the plugin scope is
  the DI seam, which is why plugins register before modules (rule 1).
- [Fastify plugins as building blocks for a backend Node.js API (Snyk)](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/)
- [Repository pattern with Drizzle](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
  — don't expose schema types past the repository (rules 2, 5).
- [Drizzle ORM best practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Microsoft — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
- Khalil Stemmler — [DTOs, mappers and the repository pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/)
  — the row → DTO mapper boundary (rule 5).
- [Validate at the boundary, map to a DTO (Zod)](https://joshkaramuth.com/blog/tanstack-zod-dto/) (rules 6, 7).
- [Hexagonal architecture in AI agent development](https://medium.com/@martia_es/applying-hexagonal-architecture-in-ai-agent-development-44199f6136d3)
  — the LLM as an adapter: why a model provider is a port and the domain core stays pure.

**The counterweight — read before adding an abstraction**
- [You might not need the repository pattern](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b)
  — over a typed query builder a repository can be pure ceremony. The answer here is in
  SKILL.md ("When *not* to add a layer"): keep it because it is the seam rule 2 depends on,
  not because you expect to swap databases.
- [The modular monolith, a field guide](https://medium.com/viascom/the-modular-monolith-a-field-guide-36dcf21a477b)
  — each module carries its own onion; feature slices and rings are not in conflict.
