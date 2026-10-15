# Project snapshot: orders-service

A sample backend that is NOT present in the working tree. Paths are repo-root relative; the
numbers on the left are line numbers, so `src/orders/service.ts:14` is citable.

## AGENTS.md (the conventions file)

```
1  # orders-service
2  Node 22 + TypeScript + Fastify 5 + PostgreSQL. ESM: relative imports carry `.js`.
3
4  ## Layout (onion)
5  - src/orders/domain.ts       entities and invariants, no I/O, no framework imports
6  - src/orders/ports.ts        repository and gateway interfaces
7  - src/orders/service.ts      use cases; receives ports through its constructor
8  - src/orders/repository.ts   PostgreSQL adapter implementing OrdersRepository
9  - src/orders/routes.ts       Fastify routes; validation with the zod schemas in src/contracts/
10 - src/contracts/             request/response schemas shared with the web client
11 - src/billing/               invoices; owned by the billing team
12
13 ## Do not touch
14 - migrations/ that are already applied (create a new migration instead)
15 - src/billing/ without a billing-team reviewer
16
17 ## Tests
18 - unit tests next to the code: src/**/*.test.ts (vitest)
19 - integration tests: test/integration/*.test.ts (need a running PostgreSQL)
```

## src/orders/domain.ts

```ts
1  export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";
2
3  export interface Order {
4    id: string;
5    customerId: string;
6    status: OrderStatus;
7    totalCents: number;
8    createdAt: Date;
9  }
10
11 export function canShip(order: Order): boolean {
12   return order.status === "paid";
13 }
```

## src/orders/ports.ts

```ts
1  import type { Order } from "./domain.js";
2
3  export interface OrdersRepository {
4    findById(id: string): Promise<Order | null>;
5    save(order: Order): Promise<void>;
6  }
```

## src/orders/service.ts

```ts
1  import type { Order } from "./domain.js";
2  import type { OrdersRepository } from "./ports.js";
3
4  export class OrdersService {
5    constructor(private readonly repo: OrdersRepository) {}
6
7    async get(id: string): Promise<Order | null> {
8      return this.repo.findById(id);
9    }
10
11   async markPaid(id: string): Promise<Order> {
12     const order = await this.repo.findById(id);
13     if (!order) throw new Error("order not found");
14     const paid = { ...order, status: "paid" as const };
15     await this.repo.save(paid);
16     return paid;
17   }
18 }
```

## src/orders/routes.ts

```ts
1  import type { FastifyInstance } from "fastify";
2  import { OrderParams } from "../contracts/orders.js";
3  import type { OrdersService } from "./service.js";
4
5  export async function ordersRoutes(app: FastifyInstance, svc: OrdersService) {
6    app.get("/orders/:id", async (req, reply) => {
7      const { id } = OrderParams.parse(req.params);
8      const order = await svc.get(id);
9      if (!order) return reply.code(404).send({ error: "not_found" });
10     return order;
11   });
12 }
```

## src/contracts/orders.ts

```ts
1  import { z } from "zod";
2
3  export const OrderParams = z.object({ id: z.string().uuid() });
```

## package.json (scripts)

```
1  "scripts": {
2    "lint": "eslint .",
3    "typecheck": "tsc --noEmit",
4    "test": "vitest run",
5    "test:integration": "vitest run test/integration"
6  }
```

## Today, outside the code

Support agents cancel orders by running an UPDATE in the production database by hand when a
customer emails them; there is no cancel endpoint and no `cancelledAt` column.
