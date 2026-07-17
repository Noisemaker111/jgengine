/**
 * Composable entity orders: a serializable command queue with lifecycle,
 * preemption, and pluggable order kinds (#912). Player- or AI-issued intent
 * ("move here", "attack that", "patrol this route") becomes reusable data
 * instead of a hard-coded RTS verb kit. The queue owns issue -> activate ->
 * tick -> complete/cancel lifecycle and deterministic preemption policy; each
 * order KIND owns what "running" means, composed over narrow world adapters.
 * Engine code never branches on `move`, `attack`, or any game verb -- kinds are
 * looked up by string in a registry, so a game adds a verb by registering data.
 */

/** XZ+Y position triple, matching the engine heading convention used across `movement`/`scene`. */
export type OrderVec3 = readonly [number, number, number];

/** Lifecycle phase of a single order. `queued` waits behind the active order; `active` is ticking; `completed`/`canceled` are terminal. */
export type OrderPhase = "queued" | "active" | "completed" | "canceled";

/**
 * Why an order left the queue without completing. `replaced`/`preempted` come
 * from a newer order taking over; `requested` from explicit `cancelActive`;
 * `invalid` when the kind's `start` rejects; `failed` when `update` reports
 * failure; `cleared` from a full `clear`/`cancelAll`.
 */
export type OrderCancelReason = "replaced" | "preempted" | "requested" | "invalid" | "failed" | "cleared";

/**
 * One issued order. Fully serializable: `kind` is a registry key (not a
 * closure), `payload` is the caller's plain data, and `state` is the kind's own
 * plain progress scratch (e.g. a patrol waypoint index) written during
 * `start`/`update`. Never holds functions, so the whole queue round-trips
 * through `JSON`/`structuredClone`.
 */
export interface Order<TPayload = unknown> {
  /** Stable id, caller-supplied or generated deterministically by the queue. */
  readonly id: string;
  /** Registry key selecting the order kind. */
  readonly kind: string;
  /** Caller data the kind interprets (destination, target id, waypoints, ...). */
  readonly payload: TPayload;
  /** Current lifecycle phase; the queue owns transitions. */
  phase: OrderPhase;
  /** When `true`, preemption policies may not cancel this order mid-flight; a replacing order waits until it finishes. */
  uninterruptible: boolean;
  /** Optional authority tag (which player/AI issued it) carried for replication/audit; the queue does not interpret it. */
  issuer?: string;
  /** Kind-owned serializable progress; `undefined` until the kind activates. */
  state?: unknown;
  /** Set once `phase === "canceled"`. */
  cancelReason?: OrderCancelReason;
}

/** A kind's refusal of a payload (from `validate`) — surfaced to the issuer as a rejection reason. */
export interface OrderRejection {
  reason: string;
}

/** Result of a kind's `start`: `ok:false` skips the order and cancels it with reason `invalid`. The kind seeds `order.state` directly when `ok:true`. */
export type OrderStartResult = { ok: true } | { ok: false; reason: string };

/**
 * Result of a kind's `update` tick. `running` keeps the order active; the
 * completion predicate lives in the kind (returns `completed`); `failed` cancels
 * the order (reason `failed`) so the queue advances to the next one.
 */
export type OrderProgress = { status: "running" } | { status: "completed" } | { status: "failed"; reason: string };

/** Terminal outcome handed to a kind's `finish` cleanup hook. */
export interface OrderOutcome {
  phase: "completed" | "canceled";
  reason?: OrderCancelReason;
}

/**
 * The composition seam for one order verb. `TCtx` is the game's world adapter
 * (movement, targeting, effects) shared by every kind in a registry; `TPayload`
 * is this verb's caller data. `start` seeds `order.state`, `update` advances it
 * and reports lifecycle, and `finish` releases anything the kind held. Kinds are
 * pure over their injected `ctx` -- no globals, no direct scene reach.
 */
export interface OrderKind<TCtx, TPayload = unknown> {
  /** The registry key; also the default `Order.kind` for issues of this verb. */
  readonly kind: string;
  /** Reject a malformed payload before it ever queues. */
  validate?(payload: TPayload): OrderRejection | null;
  /** Called once when the order becomes active. Seed `order.state` here; return `ok:false` to skip it. */
  start(order: Order<TPayload>, ctx: TCtx): OrderStartResult;
  /** Advance one tick. Read/write `order.state`; drive the world through `ctx`; report lifecycle. */
  update(order: Order<TPayload>, ctx: TCtx, dt: number): OrderProgress;
  /** Cleanup hook on completion or cancellation (stop movement, drop reservations). */
  finish?(order: Order<TPayload>, ctx: TCtx, outcome: OrderOutcome): void;
}

/** Registry of order kinds keyed by verb string; the queue dispatches through it so engine code never switches on a verb. */
export interface OrderRegistry<TCtx> {
  /** Register a kind under `kind.kind`; throws on a duplicate key. */
  define<TPayload>(kind: OrderKind<TCtx, TPayload>): void;
  has(kind: string): boolean;
  /** Look up a kind, or `null` if unregistered. */
  get(kind: string): OrderKind<TCtx, unknown> | null;
  /** All registered verb keys, in insertion order. */
  kinds(): string[];
}

/**
 * How a newly issued order interacts with what's already queued.
 * `replace` preempts the active order and clears pending; `append` queues it
 * behind everything (shift-queue); `front` makes it the next to run without
 * touching the active order; `reject` refuses it while anything is queued.
 */
export type OrderQueuePolicy = "replace" | "append" | "front" | "reject";

/** A request to issue an order; `policy` defaults to `replace`, `id` is generated when omitted. */
export interface OrderRequest<TPayload = unknown> {
  kind: string;
  payload: TPayload;
  id?: string;
  policy?: OrderQueuePolicy;
  uninterruptible?: boolean;
  issuer?: string;
}

/** Outcome of `issue`: `accepted` entered the queue, `queued` entered behind an uninterruptible/active order, `rejected` was refused (validation or `reject` policy). */
export type OrderIssueResult<TPayload = unknown> =
  | { status: "accepted"; order: Order<TPayload> }
  | { status: "queued"; order: Order<TPayload> }
  | { status: "rejected"; reason: string };

/** Serializable snapshot of a queue: the active order plus the pending list, in order. */
export interface OrderQueueState<TPayload = unknown> {
  active: Order<TPayload> | null;
  pending: Order<TPayload>[];
}

/** A lifecycle event emitted synchronously as orders move through the queue. */
export interface OrderEvent {
  type: "issued" | "activated" | "completed" | "canceled";
  orderId: string;
  kind: string;
  reason?: OrderCancelReason;
}

/** What one `tick` did this frame, for tests and game reactions (play a bark on activation, flash on completion). Bounded per tick. */
export interface OrderTickReport<TPayload = unknown> {
  active: Order<TPayload> | null;
  activated: string[];
  completed: string[];
  canceled: { id: string; reason: OrderCancelReason }[];
}

/** Construction options for a queue. */
export interface OrderQueueOptions<TPayload = unknown> {
  /** Deterministic id source for orders issued without an `id`; defaults to a monotonic `order-<n>` counter. */
  genId?: () => string;
  /** Synchronous lifecycle observer (analytics, HUD, replication). */
  onEvent?: (event: OrderEvent) => void;
  /** Initial state (e.g. a deserialized snapshot) to load on construction. */
  initial?: OrderQueueState<TPayload>;
}

/**
 * A per-entity order queue: one commandable unit's lifecycle of intent. The
 * game ticks it with its world adapter; it activates, advances, completes, and
 * cancels orders and enforces preemption policy. State is serializable for save
 * and host-authoritative replication.
 */
export interface OrderQueue<TCtx, TPayload = unknown> {
  /** Queue or preempt an order per its policy; validates the payload through the kind. */
  issue<T extends TPayload = TPayload>(request: OrderRequest<T>): OrderIssueResult<T>;
  /** Advance the active order one step (activating the next pending order as needed) and report transitions. */
  tick(ctx: TCtx, dt: number): OrderTickReport<TPayload>;
  /** The active order, or `null` when idle. */
  active(): Order<TPayload> | null;
  /** The pending orders, in run order (a copy). */
  pending(): Order<TPayload>[];
  /** No active order and nothing pending. */
  isIdle(): boolean;
  /** Force-cancel the active order (explicit cleanup ignores `uninterruptible`); needs `ctx` to run the kind's `finish`. */
  cancelActive(ctx: TCtx, reason?: OrderCancelReason): void;
  /** Cancel the active order and drop every pending order. */
  cancelAll(ctx: TCtx, reason?: OrderCancelReason): void;
  /** Hard reset: cancel everything with reason `cleared`. */
  clear(ctx: TCtx): void;
  /** Plain-data snapshot for save/replication (deep-cloned; safe to serialize). */
  serialize(): OrderQueueState<TPayload>;
  /** Replace queue contents from a (possibly deserialized) snapshot; the active order keeps its `state`. */
  load(state: OrderQueueState<TPayload>): void;
}

/**
 * Build an empty order-kind registry. Register the built-in compositions from
 * `orders/orderKinds` or your own verbs, then hand it to `createOrderQueue`.
 * One registry is shared by many per-entity queues.
 *
 * @capability order-registry register order verbs (move/attack/custom) as data so engine code never branches on a verb
 */
export function createOrderRegistry<TCtx>(): OrderRegistry<TCtx> {
  const kinds = new Map<string, OrderKind<TCtx, never>>();
  return {
    define(kind) {
      if (kinds.has(kind.kind)) throw new Error(`Order kind "${kind.kind}" is already defined.`);
      kinds.set(kind.kind, kind as OrderKind<TCtx, never>);
    },
    has(kind) {
      return kinds.has(kind);
    },
    get(kind) {
      return (kinds.get(kind) as OrderKind<TCtx, unknown> | undefined) ?? null;
    },
    kinds() {
      return [...kinds.keys()];
    },
  };
}

function cloneOrder<TPayload>(order: Order<TPayload>): Order<TPayload> {
  return structuredClone(order);
}

/**
 * Create a per-entity order queue over a shared kind registry. The queue owns
 * the deterministic lifecycle and preemption policy; the kinds own behavior.
 * Nothing here is random or unbounded: id generation is injected, activation is
 * bounded by the pending count, and a single `tick` advances at most the active
 * order plus one activation.
 *
 * @capability order-queue serializable per-entity command queue with lifecycle, preemption, and pluggable order kinds
 */
export function createOrderQueue<TCtx, TPayload = unknown>(
  registry: OrderRegistry<TCtx>,
  options: OrderQueueOptions<TPayload> = {},
): OrderQueue<TCtx, TPayload> {
  const onEvent = options.onEvent;
  let counter = 0;
  const genId = options.genId ?? (() => `order-${++counter}`);

  let active: Order<TPayload> | null = options.initial ? options.initial.active : null;
  let pending: Order<TPayload>[] = options.initial ? [...options.initial.pending] : [];

  function emit(type: OrderEvent["type"], order: Order<TPayload>, reason?: OrderCancelReason): void {
    onEvent?.({ type, orderId: order.id, kind: order.kind, reason });
  }

  function markCanceled(order: Order<TPayload>, reason: OrderCancelReason): void {
    order.phase = "canceled";
    order.cancelReason = reason;
    emit("canceled", order, reason);
  }

  function finishActive(ctx: TCtx, outcome: OrderOutcome): void {
    if (active === null) return;
    const kind = registry.get(active.kind);
    kind?.finish?.(active, ctx, outcome);
  }

  /** Pull pending orders forward until one activates or the queue drains. Bounded by the pending length at entry. */
  function activateNext(ctx: TCtx, report: OrderTickReport<TPayload>): void {
    let budget = pending.length;
    while (active === null && budget > 0) {
      budget -= 1;
      const next = pending.shift();
      if (next === undefined) return;
      const kind = registry.get(next.kind);
      if (kind === null) {
        markCanceled(next, "invalid");
        report.canceled.push({ id: next.id, reason: "invalid" });
        continue;
      }
      const started = kind.start(next, ctx);
      if (!started.ok) {
        markCanceled(next, "invalid");
        report.canceled.push({ id: next.id, reason: "invalid" });
        continue;
      }
      next.phase = "active";
      active = next;
      emit("activated", next);
      report.activated.push(next.id);
    }
  }

  return {
    issue(request) {
      const kind = registry.get(request.kind);
      if (kind === null) return { status: "rejected", reason: `Unknown order kind "${request.kind}".` };
      const rejection = kind.validate?.(request.payload as never) ?? null;
      if (rejection) return { status: "rejected", reason: rejection.reason };

      const policy = request.policy ?? "replace";
      if (policy === "reject" && (active !== null || pending.length > 0)) {
        return { status: "rejected", reason: "Queue is busy and policy is reject." };
      }

      const order: Order<TPayload> = {
        id: request.id ?? genId(),
        kind: request.kind,
        payload: request.payload as unknown as TPayload,
        phase: "queued",
        uninterruptible: request.uninterruptible ?? false,
        ...(request.issuer !== undefined ? { issuer: request.issuer } : {}),
      };
      emit("issued", order);

      if (policy === "replace") {
        // Preempt the active order unless it is protected; a protected order
        // finishes first and the newcomer waits at the front of the queue.
        for (const queued of pending) markCanceled(queued, "replaced");
        pending = [];
        if (active !== null && !active.uninterruptible) {
          markCanceled(active, "replaced");
          active = null;
        }
        pending.push(order);
        return { status: active !== null ? "queued" : "accepted", order: order as never };
      }

      if (policy === "front") {
        pending.unshift(order);
        return { status: active !== null ? "queued" : "accepted", order: order as never };
      }

      // append (and the empty-queue reject case)
      pending.push(order);
      return { status: active !== null || pending.length > 1 ? "queued" : "accepted", order: order as never };
    },

    tick(ctx, dt) {
      const report: OrderTickReport<TPayload> = { active: null, activated: [], completed: [], canceled: [] };
      if (active === null) activateNext(ctx, report);

      if (active !== null) {
        const kind = registry.get(active.kind);
        if (kind === null) {
          markCanceled(active, "invalid");
          report.canceled.push({ id: active.id, reason: "invalid" });
          active = null;
          activateNext(ctx, report);
        } else {
          const progress = kind.update(active, ctx, dt);
          if (progress.status === "completed") {
            finishActive(ctx, { phase: "completed" });
            active.phase = "completed";
            emit("completed", active);
            report.completed.push(active.id);
            active = null;
            activateNext(ctx, report);
          } else if (progress.status === "failed") {
            finishActive(ctx, { phase: "canceled", reason: "failed" });
            markCanceled(active, "failed");
            report.canceled.push({ id: active.id, reason: "failed" });
            active = null;
            activateNext(ctx, report);
          }
        }
      }

      report.active = active;
      return report;
    },

    active() {
      return active;
    },
    pending() {
      return [...pending];
    },
    isIdle() {
      return active === null && pending.length === 0;
    },
    cancelActive(ctx, reason = "requested") {
      if (active === null) return;
      finishActive(ctx, { phase: "canceled", reason });
      markCanceled(active, reason);
      active = null;
    },
    cancelAll(ctx, reason = "requested") {
      for (const queued of pending) markCanceled(queued, reason);
      pending = [];
      if (active !== null) {
        finishActive(ctx, { phase: "canceled", reason });
        markCanceled(active, reason);
        active = null;
      }
    },
    clear(ctx) {
      this.cancelAll(ctx, "cleared");
    },
    serialize() {
      return {
        active: active ? cloneOrder(active) : null,
        pending: pending.map(cloneOrder),
      };
    },
    load(state) {
      active = state.active ? cloneOrder(state.active) : null;
      pending = state.pending.map(cloneOrder);
    },
  };
}
