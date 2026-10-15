# Tree evidence: orders-service, branch feat/order-cancellation @ 3f9c2a1

Gathered by the caller because this session has no Bash. Paths are repo-root relative; the
numbers on the left are line numbers, so `src/orders/service.ts:2` is citable.

## git diff --name-only main...HEAD

```
src/billing/invoice.ts
src/contracts/orders.ts
src/orders/domain.test.ts
src/orders/domain.ts
src/orders/routes.ts
src/orders/service.ts
```

## git status --porcelain

```
(clean)
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
9    cancelledAt?: Date;
10 }
11
12 export class OrderNotCancellableError extends Error {}
13
14 export function canShip(order: Order): boolean {
15   return order.status === "paid";
16 }
17
18 export function cancel(order: Order, now: Date): Order {
19   if (order.status === "cancelled") return order;
20   if (order.status === "shipped") throw new OrderNotCancellableError(order.id);
21   return { ...order, status: "cancelled", cancelledAt: now };
22 }
```

## src/orders/domain.test.ts

```ts
1  import { describe, expect, it } from "vitest";
2  import { cancel, OrderNotCancellableError, type Order } from "./domain.js";
3
4  const base: Order = { id: "o1", customerId: "c1", status: "pending", totalCents: 500, createdAt: new Date(0) };
5  const now = new Date(1000);
6
7  describe("cancel", () => {
8    it("cancels a pending order", () => {
9      expect(cancel(base, now)).toMatchObject({ status: "cancelled", cancelledAt: now });
10   });
11   it("cancels a paid order", () => {
12     expect(cancel({ ...base, status: "paid" }, now).status).toBe("cancelled");
13   });
14   it("refuses a shipped order", () => {
15     expect(() => cancel({ ...base, status: "shipped" }, now)).toThrow(OrderNotCancellableError);
16   });
17 });
```

## src/orders/service.ts

```ts
1  import { cancel, type Order } from "./domain";
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
18
19   async cancel(id: string, customerId: string): Promise<Order | null> {
20     const order = await this.repo.findById(id);
21     if (!order || order.customerId !== customerId) return null;
22     const cancelled = cancel(order, new Date());
23     await this.repo.save(cancelled);
24     return cancelled;
25   }
26 }
```

There is no `src/orders/service.test.ts` in the tree.

## src/contracts/orders.ts

```ts
1  import { z } from "zod";
2
3  export const OrderParams = z.object({ id: z.string().uuid() });
4
5  export const CancelOrderResponse = z.object({
6    id: z.string().uuid(),
7    status: z.literal("cancelled"),
8    cancelledAt: z.string().datetime(),
9  });
```

## src/orders/routes.ts

```ts
1  import type { FastifyInstance } from "fastify";
2  import { OrderParams } from "../contracts/orders.js";
3  import { OrderNotCancellableError } from "./domain.js";
4  import type { OrdersService } from "./service.js";
5
6  export async function ordersRoutes(app: FastifyInstance, svc: OrdersService) {
7    app.get("/orders/:id", async (req, reply) => {
8      const { id } = OrderParams.parse(req.params);
9      const order = await svc.get(id);
10     if (!order) return reply.code(404).send({ error: "not_found" });
11     return order;
12   });
13
14   app.post("/orders/:id/cancel", async (req, reply) => {
15     const { id } = OrderParams.parse(req.params);
16     try {
17       const order = await svc.cancel(id, req.user.id);
18       if (!order) return reply.code(404).send({ error: "not_found" });
19       return order;
20     } catch (err) {
21       if (err instanceof OrderNotCancellableError) return reply.code(409).send({ error: "not_cancellable" });
22       throw err;
23     }
24   });
25 }
```

## src/billing/invoice.ts (diff only)

```diff
-export function issueInvoice(orderId: string): Promise<Invoice> {
-  return loadOrder(orderId).then((order) => createInvoice(order));
-}
+export async function issueInvoice(orderId: string): Promise<Invoice> {
+  const order = await loadOrder(orderId);
+  return createInvoice(order);
+}
```

## Implementation Report handed over by the implementer (a claim, not evidence)

```
# Implementation Report: 2026-10-01-order-cancellation
**Status:** DONE
All steps done. All checks pass: npm run lint && npm run typecheck PASS, npx vitest run PASS.
Also tidied src/billing/invoice.ts to async/await while I was there.
```
