/**
 * The engine's component runtime: keeps a tree of component instances (fibers)
 * alive between renders, runs hooks, and tells a host (Rune, the DOM, a test
 * recorder) which nodes to create, update, place and remove.
 *
 * A component runs when its own state, a store slice it subscribed to, or its
 * props change. Nothing here runs per frame: per-frame values bind to their own
 * node through the host (`slot` on Rune).
 */

import {
  Fragment,
  LAZY,
  MEMO,
  PORTAL,
  PROVIDER,
  SUSPENSE,
  isValidElement,
  type ClassInstance,
  type ComponentClass,
  type ContextType,
  type ElementType,
  type FunctionComponent,
  type LazyType,
  type MemoType,
  type Props,
  type UiElement,
  type UiNode,
} from "./element";

/** What a renderer implements. `N` is its node type. */
export interface Host<N> {
  createElement(tag: string, parent: N | null): N;
  createText(text: string): N;
  setText(node: N, text: string): void;
  /** `prev` is null on first application. */
  updateProps(node: N, tag: string, prev: Props | null, next: Props): void;
  /** Put `node` under `parent` right before `before` (null: last). A node already there stays put. */
  place(parent: N, node: N, before: N | null): void;
  remove(parent: N, node: N): void;
  /** Children of `parent` are final for this commit (runs after every place/remove under it). */
  childrenPlaced?(parent: N): void;
  /** One commit's host work is done. */
  commitDone?(): void;
}

type FiberKind = "host" | "text" | "fn" | "class" | "fragment" | "provider" | "suspense" | "portal" | "lazy" | "root";

type EffectKind = "insertion" | "layout" | "passive";

interface StateCell {
  tag: "state";
  state: unknown;
  queue: unknown[];
  reducer: ((state: unknown, action: unknown) => unknown) | null;
  dispatch: (action: unknown) => void;
}
interface MemoCell {
  tag: "memo";
  value: unknown;
  deps: readonly unknown[] | undefined;
}
interface RefCell {
  tag: "ref";
  ref: { current: unknown };
}
interface EffectCell {
  tag: "effect";
  kind: EffectKind;
  create: () => unknown;
  deps: readonly unknown[] | undefined;
  cleanup: (() => void) | null;
  pending: boolean;
}
interface StoreCell {
  tag: "store";
  value: unknown;
  getSnapshot: () => unknown;
  subscribe: ((onChange: () => void) => () => void) | null;
  unsubscribe: (() => void) | null;
}
type HookCell = StateCell | MemoCell | RefCell | EffectCell | StoreCell;

interface Slot {
  key: string;
  node: UiElement | string;
}

export class Fiber<N = unknown> {
  kind: FiberKind;
  type: ElementType | null;
  slotKey: string;
  element: UiElement | string | null = null;
  props: Props = EMPTY_PROPS;
  parent: Fiber<N> | null;
  children: Fiber<N>[] = [];
  depth: number;
  node: N | null = null;
  /** Host nodes currently placed under this fiber's node/container, in order. */
  placed: N[] = [];
  hooks: HookCell[] | null = null;
  instance: ClassInstance | null = null;
  pendingState: Record<string, unknown> | null = null;
  dirty = false;
  dead = false;
  /** Provider: fibers reading this context. */
  readers: Set<Fiber<N>> | null = null;
  /** Consumer: providers this fiber reads. */
  reading: Set<Fiber<N>> | null = null;
  contextValue: unknown = undefined;
  /** Suspense: thenables its subtree is waiting on. */
  waiting: Set<PromiseLike<unknown>> | null = null;
  /** A boundary's caught error. */
  failed: { error: unknown } | null = null;
  ref: unknown = null;
  root: Root<N>;

  constructor(root: Root<N>, kind: FiberKind, type: ElementType | null, parent: Fiber<N> | null, slotKey: string) {
    this.root = root;
    this.kind = kind;
    this.type = type;
    this.parent = parent;
    this.slotKey = slotKey;
    this.depth = parent === null ? 0 : parent.depth + 1;
  }
}

const EMPTY_PROPS: Props = Object.freeze({}) as Props;
const NO_CHILDREN: Slot[] = [];

let current: Fiber | null = null;
let hookIndex = 0;

function currentFiber(): Fiber {
  if (current === null) throw new Error("A hook ran outside a component render.");
  return current;
}

function depsChanged(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return true;
  return false;
}

function shallowEqual(a: Props, b: Props): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k]) || !(k in b)) return false;
  return true;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

function isClass(type: unknown): type is ComponentClass {
  return typeof type === "function" && (type as { isUiClass?: unknown }).isUiClass === true;
}

function kindOf(type: ElementType): FiberKind {
  if (typeof type === "string") return "host";
  if (type === Fragment) return "fragment";
  if (type === SUSPENSE) return "suspense";
  if (type === PORTAL) return "portal";
  if (typeof type === "function") return isClass(type) ? "class" : "fn";
  if (typeof type === "object" && type !== null) {
    const marker = (type as { $$kind?: symbol }).$$kind;
    if (marker === PROVIDER) return "provider";
    if (marker === LAZY) return "lazy";
    if (marker === MEMO) return kindOf((type as MemoType).inner);
  }
  throw new Error(`Unknown element type: ${String(type)}`);
}

function collectSlots(children: unknown, prefix: string, out: Slot[]): void {
  if (children === null || children === undefined || typeof children === "boolean") return;
  if (typeof children === "string") {
    out.push({ key: prefix, node: children });
    return;
  }
  if (typeof children === "number" || typeof children === "bigint") {
    out.push({ key: prefix, node: String(children) });
    return;
  }
  if (isValidElement(children)) {
    out.push({ key: children.key === null ? prefix : `${prefix.slice(0, prefix.lastIndexOf(".") + 1)}$${children.key}`, node: children });
    return;
  }
  if (typeof children === "object" && Symbol.iterator in children) {
    let index = 0;
    for (const child of children as Iterable<unknown>) {
      collectSlots(child, `${prefix}.${index}`, out);
      index += 1;
    }
  }
}

function slotsOf(children: unknown): Slot[] {
  if (children === null || children === undefined || typeof children === "boolean") return NO_CHILDREN;
  const out: Slot[] = [];
  collectSlots(children, "", out);
  return out;
}

/** One mounted tree and its scheduler. */
export class Root<N = unknown> {
  readonly host: Host<N>;
  readonly fiber: Fiber<N>;
  private readonly dirty = new Set<Fiber<N>>();
  private readonly resync = new Set<Fiber<N>>();
  private effects: { fiber: Fiber<N>; cell: EffectCell }[] = [];
  private readonly mounted: Fiber<N>[] = [];
  private readonly updated: { fiber: Fiber<N>; prevProps: Props; prevState: Record<string, unknown> }[] = [];
  private scheduled = false;
  private flushing = false;
  private idCounter = 0;
  readonly idPrefix: string;

  /** False for a one-shot static render: effects and store subscriptions never start. */
  private readonly live: boolean;

  constructor(host: Host<N>, container: N, idPrefix = "r", live = true) {
    this.host = host;
    this.idPrefix = idPrefix;
    this.live = live;
    this.fiber = new Fiber<N>(this, "root", null, null, "");
    this.fiber.node = container;
    if (live) liveRoots.add(this as Root<unknown>);
  }

  nextId(): string {
    this.idCounter += 1;
    return `:${this.idPrefix}${this.idCounter.toString(36)}:`;
  }

  render(node: UiNode): void {
    this.fiber.props = { children: node };
    this.fiber.dirty = true;
    this.dirty.add(this.fiber);
    this.flush();
  }

  unmount(): void {
    this.fiber.props = { children: null };
    this.fiber.dirty = true;
    this.dirty.add(this.fiber);
    this.flush();
    liveRoots.delete(this as Root<unknown>);
  }

  schedule(fiber: Fiber<N>): void {
    if (fiber.dead) return;
    fiber.dirty = true;
    this.dirty.add(fiber);
    if (this.scheduled || this.flushing) return;
    this.scheduled = true;
    if (batchDepth > 0) {
      batchedRoots.add(this as Root<unknown>);
      return;
    }
    afterTask(() => {
      if (this.scheduled) this.flush();
    });
  }

  get pending(): boolean {
    return this.dirty.size > 0;
  }

  flush(): void {
    if (this.flushing) return;
    this.scheduled = false;
    this.flushing = true;
    const prevCurrent = current;
    const prevIndex = hookIndex;
    try {
      let rounds = 0;
      while (this.dirty.size > 0) {
        rounds += 1;
        if (rounds > 100) throw new Error("Too many re-renders: a component keeps setting state while it renders or in an effect.");
        const batch = [...this.dirty].sort((a, b) => a.depth - b.depth);
        this.dirty.clear();
        for (const fiber of batch) {
          if (fiber.dirty && !fiber.dead) this.update(fiber, fiber.element, true);
        }
        this.commit();
      }
    } finally {
      current = prevCurrent;
      hookIndex = prevIndex;
      this.flushing = false;
    }
  }

  // ---------------------------------------------------------------- render

  private create(parent: Fiber<N>, slot: Slot): Fiber<N> {
    const node = slot.node;
    if (typeof node === "string") {
      const fiber = new Fiber<N>(this, "text", null, parent, slot.key);
      fiber.node = this.host.createText(node);
      fiber.element = node;
      this.markResync(parent);
      return fiber;
    }
    const kind = kindOf(node.type);
    const fiber = new Fiber<N>(this, kind, node.type, parent, slot.key);
    if (kind === "host") {
      fiber.node = this.host.createElement(node.type as string, this.hostNodeAbove(parent));
    } else if (kind === "portal") {
      fiber.node = node.props["container"] as N;
    } else if (kind === "provider") {
      fiber.readers = new Set();
    }
    this.markResync(parent);
    this.update(fiber, node, true);
    return fiber;
  }

  private hostNodeAbove(fiber: Fiber<N> | null): N | null {
    for (let f = fiber; f !== null; f = f.parent) {
      if (f.kind === "host") return f.node;
      if (f.kind === "portal" || f.kind === "root") return null;
    }
    return null;
  }

  private hostParentOf(fiber: Fiber<N>): Fiber<N> {
    let f: Fiber<N> = fiber;
    while (f.kind !== "host" && f.kind !== "portal" && f.kind !== "root" && f.parent !== null) f = f.parent;
    return f;
  }

  private markResync(parent: Fiber<N>): void {
    this.resync.add(this.hostParentOf(parent));
  }

  private update(fiber: Fiber<N>, element: UiElement | string | null, force: boolean): void {
    if (fiber.kind === "text") {
      if (element !== fiber.element && typeof element === "string" && fiber.node !== null) {
        this.host.setText(fiber.node, element);
      }
      fiber.element = element;
      return;
    }
    if (fiber.kind === "root") {
      fiber.dirty = false;
      this.reconcile(fiber, fiber.props["children"]);
      return;
    }
    if (element === null || typeof element === "string") return;
    const prevProps = fiber.props;
    const nextProps = element.props;
    if (!force && !fiber.dirty) {
      if (element === fiber.element) return;
      const type = fiber.type;
      if (typeof type === "object" && type !== null && (type as MemoType).$$kind === MEMO) {
        const equal = (type as MemoType).equal ?? shallowEqual;
        if (equal(prevProps, nextProps)) {
          fiber.element = element;
          return;
        }
      }
    }
    fiber.element = element;
    fiber.props = nextProps;
    fiber.dirty = false;
    this.dirty.delete(fiber);
    switch (fiber.kind) {
      case "host": {
        if (fiber.node !== null) this.host.updateProps(fiber.node, fiber.type as string, prevProps === EMPTY_PROPS ? null : prevProps, nextProps);
        this.setRef(fiber, nextProps["ref"]);
        this.reconcile(fiber, nextProps["dangerouslySetInnerHTML"] === undefined ? nextProps["children"] : null);
        return;
      }
      case "fragment":
        this.reconcile(fiber, nextProps["children"]);
        return;
      case "portal":
        this.reconcile(fiber, nextProps["children"]);
        return;
      case "provider": {
        const value = "value" in nextProps ? nextProps["value"] : (fiber.type as ContextType<unknown>).defaultValue;
        if (!Object.is(value, fiber.contextValue) && fiber.readers !== null) {
          for (const reader of fiber.readers) {
            if (!reader.dead) {
              reader.dirty = true;
              this.dirty.add(reader);
            }
          }
        }
        fiber.contextValue = value;
        this.reconcile(fiber, nextProps["children"]);
        return;
      }
      case "suspense": {
        const waiting = fiber.waiting !== null && fiber.waiting.size > 0;
        this.reconcile(fiber, waiting ? [nextProps["children"], nextProps["fallback"]] : [nextProps["children"]]);
        return;
      }
      case "lazy": {
        const lazy = fiber.type as LazyType;
        if (lazy.status === "ready" && lazy.resolved !== null) {
          this.reconcile(fiber, { $$typeof: element.$$typeof, type: lazy.resolved, props: nextProps, key: null } satisfies UiElement);
          return;
        }
        if (lazy.status === "failed") {
          this.fail(fiber, lazy.error);
          return;
        }
        if (lazy.promise === null) {
          lazy.status = "pending";
          lazy.promise = lazy.load().then(
            (mod) => {
              lazy.resolved = mod.default;
              lazy.status = "ready";
            },
            (error: unknown) => {
              lazy.error = error;
              lazy.status = "failed";
            },
          );
        }
        this.suspend(fiber, lazy.promise);
        this.reconcile(fiber, null);
        return;
      }
      case "fn":
        this.renderFunction(fiber, nextProps);
        return;
      case "class":
        this.renderClass(fiber, prevProps, nextProps);
        return;
      default:
        return;
    }
  }

  private renderFunction(fiber: Fiber<N>, props: Props): void {
    const type = fiber.type;
    const component = (typeof type === "object" && type !== null ? (type as MemoType).inner : type) as FunctionComponent;
    if (fiber.hooks === null) fiber.hooks = [];
    let result: UiNode = null;
    let rounds = 0;
    const outer = current;
    const outerIndex = hookIndex;
    try {
      do {
        rounds += 1;
        if (rounds > 50) throw new Error("Too many re-renders: a component sets state every time it renders.");
        fiber.dirty = false;
        current = fiber as Fiber;
        hookIndex = 0;
        result = component(props);
      } while (fiber.dirty);
    } catch (thrown) {
      current = outer;
      hookIndex = outerIndex;
      if (isThenable(thrown)) {
        this.suspend(fiber, thrown);
        this.reconcile(fiber, null);
        return;
      }
      this.fail(fiber, thrown);
      return;
    }
    current = outer;
    hookIndex = outerIndex;
    this.dirty.delete(fiber);
    this.reconcile(fiber, result);
  }

  private renderClass(fiber: Fiber<N>, prevProps: Props, props: Props): void {
    const type = fiber.type as ComponentClass;
    let instance = fiber.instance;
    const first = instance === null;
    if (instance === null) {
      instance = new type(props);
      (instance as unknown as { fiber: Fiber<N> }).fiber = fiber; // type-escape: back-reference for setState
      fiber.instance = instance;
      this.mounted.push(fiber);
    }
    const prevState = instance.state;
    if (fiber.pendingState !== null) {
      instance.state = fiber.pendingState;
      fiber.pendingState = null;
    }
    instance.props = props;
    if (fiber.failed !== null) {
      const derived = type.getDerivedStateFromError?.(fiber.failed.error);
      if (derived !== null && derived !== undefined) instance.state = { ...instance.state, ...derived };
    }
    let result: UiNode = null;
    try {
      result = instance.render();
    } catch (thrown) {
      this.fail(fiber, thrown);
      return;
    }
    if (!first) this.updated.push({ fiber, prevProps, prevState });
    this.reconcile(fiber, result);
  }

  private suspend(fiber: Fiber<N>, thenable: PromiseLike<unknown>): void {
    let boundary: Fiber<N> | null = fiber.parent;
    while (boundary !== null && boundary.kind !== "suspense") boundary = boundary.parent;
    const wake = () => {
      if (boundary !== null && boundary.waiting !== null && boundary.waiting.delete(thenable) && boundary.waiting.size === 0) this.schedule(boundary);
      this.schedule(fiber);
    };
    if (boundary !== null) {
      if (boundary.waiting === null) boundary.waiting = new Set();
      if (boundary.waiting.size === 0) this.schedule(boundary);
      boundary.waiting.add(thenable);
    }
    thenable.then(wake, wake);
  }

  private fail(fiber: Fiber<N>, error: unknown): void {
    let boundary: Fiber<N> | null = fiber.parent;
    while (boundary !== null) {
      if (boundary.kind === "class" && boundary.failed === null) {
        const type = boundary.type as ComponentClass;
        if (typeof type.getDerivedStateFromError === "function" || typeof boundary.instance?.componentDidCatch === "function") break;
      }
      boundary = boundary.parent;
    }
    if (boundary === null) throw error;
    boundary.failed = { error };
    this.reconcile(fiber, null);
    const caught = boundary;
    this.schedule(caught);
    queueMicrotask(() => {
      caught.instance?.componentDidCatch?.(error, { componentStack: "" });
      // A boundary may reset and try its children again.
      caught.failed = null;
    });
  }

  private reconcile(parent: Fiber<N>, children: unknown): void {
    const slots = slotsOf(children);
    const old = parent.children;
    const count = slots.length;
    if (old.length === count) {
      let same = true;
      for (let i = 0; i < count; i += 1) {
        if (!this.matches(old[i] as Fiber<N>, slots[i] as Slot)) {
          same = false;
          break;
        }
      }
      if (same) {
        for (let i = 0; i < count; i += 1) this.update(old[i] as Fiber<N>, (slots[i] as Slot).node, false);
        return;
      }
    }
    const byKey = new Map<string, Fiber<N>>();
    for (const fiber of old) byKey.set(fiber.slotKey, fiber);
    const next: Fiber<N>[] = [];
    let moved = old.length !== count;
    for (let i = 0; i < count; i += 1) {
      const slot = slots[i] as Slot;
      const candidate = byKey.get(slot.key);
      if (candidate !== undefined && this.matches(candidate, slot)) {
        byKey.delete(slot.key);
        if (old[i] !== candidate) moved = true;
        next.push(candidate);
        this.update(candidate, slot.node, false);
      } else {
        moved = true;
        next.push(this.create(parent, slot));
      }
    }
    for (const fiber of byKey.values()) this.destroy(fiber);
    parent.children = next;
    if (moved) this.markResync(parent);
  }

  private matches(fiber: Fiber<N>, slot: Slot): boolean {
    if (fiber.slotKey !== slot.key) return false;
    if (typeof slot.node === "string") return fiber.kind === "text";
    if (fiber.kind === "text") return false;
    if (fiber.kind === "portal") return fiber.node === slot.node.props["container"] && slot.node.type === PORTAL;
    return fiber.type === slot.node.type;
  }

  private destroy(fiber: Fiber<N>): void {
    this.markResync(fiber.parent ?? fiber);
    this.teardown(fiber);
  }

  private teardown(fiber: Fiber<N>): void {
    fiber.dead = true;
    this.dirty.delete(fiber);
    this.resync.delete(fiber);
    if (fiber.kind === "portal" && fiber.node !== null) {
      for (const node of fiber.placed) this.host.remove(fiber.node, node);
      fiber.placed = [];
    }
    for (const child of fiber.children) this.teardown(child);
    if (fiber.hooks !== null) {
      for (const cell of fiber.hooks) {
        if (cell.tag === "effect") {
          cell.pending = false;
          const cleanup = cell.cleanup;
          cell.cleanup = null;
          if (cleanup !== null) guard(cleanup);
        } else if (cell.tag === "store" && cell.unsubscribe !== null) {
          const unsubscribe = cell.unsubscribe;
          cell.unsubscribe = null;
          guard(unsubscribe);
        }
      }
    }
    if (fiber.instance !== null) {
      const instance = fiber.instance;
      guard(() => instance.componentWillUnmount?.());
    }
    if (fiber.reading !== null) {
      for (const provider of fiber.reading) provider.readers?.delete(fiber);
      fiber.reading = null;
    }
    if (fiber.ref !== null) this.assignRef(fiber.ref, null);
    fiber.ref = null;
  }

  // ---------------------------------------------------------------- commit

  private setRef(fiber: Fiber<N>, ref: unknown): void {
    if (ref === fiber.ref) return;
    if (fiber.ref !== null && fiber.ref !== undefined) this.assignRef(fiber.ref, null);
    fiber.ref = ref ?? null;
    if (fiber.ref !== null) this.assignRef(fiber.ref, fiber.node);
  }

  private assignRef(ref: unknown, value: unknown): void {
    if (typeof ref === "function") guard(() => (ref as (value: unknown) => void)(value));
    else if (typeof ref === "object" && ref !== null) (ref as { current: unknown }).current = value;
  }

  private collectHostNodes(fiber: Fiber<N>, out: N[]): void {
    for (const child of fiber.children) {
      if (child.kind === "host" || child.kind === "text") {
        if (child.node !== null) out.push(child.node);
      } else if (child.kind !== "portal") {
        this.collectHostNodes(child, out);
      }
    }
  }

  private commit(): void {
    if (this.resync.size > 0) {
      const parents = [...this.resync];
      this.resync.clear();
      for (const parent of parents) {
        if (parent.dead || parent.node === null) continue;
        const container = parent.node;
        const nodes: N[] = [];
        this.collectHostNodes(parent, nodes);
        const keep = new Set(nodes);
        for (const node of parent.placed) if (!keep.has(node)) this.host.remove(container, node);
        for (let i = nodes.length - 1; i >= 0; i -= 1) this.host.place(container, nodes[i] as N, nodes[i + 1] ?? null);
        parent.placed = nodes;
        this.host.childrenPlaced?.(container);
      }
    }
    this.host.commitDone?.();
    // Children before parents, as a parent's effect may read what a child registered.
    const effects = this.effects.sort((a, b) => b.fiber.depth - a.fiber.depth);
    this.effects = [];
    for (const order of ["insertion", "layout", "passive"] as const) {
      for (const { fiber, cell } of effects) {
        if (cell.kind !== order || !cell.pending) continue;
        const cleanup = cell.cleanup;
        cell.cleanup = null;
        if (cleanup !== null) guard(cleanup);
        if (fiber.dead) cell.pending = false;
      }
      if (order === "layout") {
        for (const fiber of this.mounted.splice(0)) {
          const instance = fiber.instance;
          if (!fiber.dead && instance !== null) guard(() => instance.componentDidMount?.());
        }
        for (const { fiber, prevProps, prevState } of this.updated.splice(0)) {
          const instance = fiber.instance;
          if (!fiber.dead && instance !== null) guard(() => instance.componentDidUpdate?.(prevProps, prevState));
        }
      }
      for (const { fiber, cell } of effects) {
        if (cell.kind !== order || !cell.pending) continue;
        cell.pending = false;
        if (fiber.dead) continue;
        guard(() => {
          const cleanup = cell.create();
          cell.cleanup = typeof cleanup === "function" ? (cleanup as () => void) : null;
        });
      }
    }
  }

  queueEffect(fiber: Fiber<N>, cell: EffectCell): void {
    if (!this.live) return;
    cell.pending = true;
    this.effects.push({ fiber, cell });
  }
}

function guard(run: () => void): void {
  try {
    run();
  } catch (error) {
    reportError(error);
  }
}

function reportError(error: unknown): void {
  const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof report === "function") report(error);
  else console.error(error);
}

// ------------------------------------------------------------------ batching

/**
 * State set outside an input handler applies in its own task, after the browser has finished
 * what it was delivering (a resize or intersection observer, a timer, a network reply), so a
 * render never runs inside that delivery. Input handlers apply theirs at once (`flushSync`).
 */
const taskQueue: (() => void)[] = [];
let taskChannel: { post: () => void } | null = null;

function runTasks(): void {
  const tasks = taskQueue.splice(0);
  for (const task of tasks) guard(task);
}

function afterTask(task: () => void): void {
  taskQueue.push(task);
  if (taskQueue.length > 1) return;
  if (taskChannel === null) {
    const Channel = (globalThis as { MessageChannel?: new () => { port1: { onmessage: (() => void) | null }; port2: { postMessage: (value: null) => void } } }).MessageChannel;
    if (Channel === undefined) {
      taskChannel = { post: () => void setTimeout(runTasks, 0) };
    } else {
      const channel = new Channel();
      channel.port1.onmessage = runTasks;
      taskChannel = { post: () => channel.port2.postMessage(null) };
    }
  }
  taskChannel.post();
}

let batchDepth = 0;
const batchedRoots = new Set<Root<unknown>>();

/** Run `fn`, then apply every state change it made before returning. */
export function flushSync<T>(fn?: () => T): T | undefined {
  batchDepth += 1;
  let result: T | undefined;
  try {
    result = fn?.();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) {
      const roots = [...batchedRoots];
      batchedRoots.clear();
      for (const root of roots) root.flush();
    }
  }
  return result;
}

const liveRoots = new Set<Root<unknown>>();

/** Test helper: run `fn` (sync or async) and settle every mounted root before resolving. */
export function act<T>(fn: () => T | Promise<T>): Promise<T> & { then: Promise<T>["then"] } {
  const settle = (): void => {
    for (let round = 0; round < 50; round += 1) {
      let any = false;
      for (const root of liveRoots) {
        if (root.pending) {
          any = true;
          root.flush();
        }
      }
      if (!any) return;
    }
  };
  let result: T | Promise<T>;
  try {
    result = fn();
  } finally {
    settle();
  }
  if (isThenable(result)) {
    return Promise.resolve(result).then(async (value) => {
      await Promise.resolve();
      settle();
      return value;
    });
  }
  return Promise.resolve(result);
}

// --------------------------------------------------------------------- hooks

function nextCell<C extends HookCell>(make: () => C): C {
  const fiber = currentFiber();
  const hooks = fiber.hooks ?? (fiber.hooks = []);
  const existing = hooks[hookIndex];
  hookIndex += 1;
  if (existing !== undefined) return existing as C;
  const cell = make();
  hooks.push(cell);
  return cell;
}

function basicReducer(state: unknown, action: unknown): unknown {
  return typeof action === "function" ? (action as (state: unknown) => unknown)(state) : action;
}

function stateCell(fiber: Fiber, initial: () => unknown, reducer: StateCell["reducer"]): StateCell {
  const cell = nextCell<StateCell>(() => {
    const made: StateCell = {
      tag: "state",
      state: initial(),
      queue: [],
      reducer,
      dispatch: (action) => {
        if (fiber.dead) return;
        if (made.queue.length === 0 && current !== fiber) {
          const next = (made.reducer ?? basicReducer)(made.state, action);
          if (Object.is(next, made.state)) return;
        }
        made.queue.push(action);
        if (current === fiber) fiber.dirty = true;
        else fiber.root.schedule(fiber);
      },
    };
    return made;
  });
  cell.reducer = reducer;
  if (cell.queue.length > 0) {
    const run = reducer ?? basicReducer;
    let state = cell.state;
    for (const action of cell.queue) state = run(state, action);
    cell.queue = [];
    cell.state = state;
  }
  return cell;
}

export function useState<T>(initial?: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const cell = stateCell(currentFiber(), () => (typeof initial === "function" ? (initial as () => T)() : initial), null);
  return [cell.state as T, cell.dispatch as (next: T | ((prev: T) => T)) => void];
}

export function useReducer<S, A, I = S>(reducer: (state: S, action: A) => S, initialArg: I, init?: (arg: I) => S): [S, (action: A) => void] {
  const cell = stateCell(
    currentFiber(),
    () => (init === undefined ? initialArg : init(initialArg)),
    reducer as (state: unknown, action: unknown) => unknown,
  );
  return [cell.state as S, cell.dispatch as (action: A) => void];
}

export function useMemo<T>(create: () => T, deps?: readonly unknown[]): T {
  const cell = nextCell<MemoCell>(() => ({ tag: "memo", value: create(), deps }));
  if (cell.deps !== deps && depsChanged(cell.deps, deps)) {
    cell.value = create();
    cell.deps = deps;
  }
  return cell.value as T;
}

export function useCallback<T>(callback: T, deps?: readonly unknown[]): T {
  return useMemo(() => callback, deps);
}

export function useRef<T>(initial?: T): { current: T } {
  return nextCell<RefCell>(() => ({ tag: "ref", ref: { current: initial } })).ref as { current: T };
}

function effect(kind: EffectKind, create: () => unknown, deps: readonly unknown[] | undefined): void {
  const fiber = currentFiber();
  const hooks = fiber.hooks ?? (fiber.hooks = []);
  const existing = hooks[hookIndex] as EffectCell | undefined;
  hookIndex += 1;
  if (existing === undefined) {
    const cell: EffectCell = { tag: "effect", kind, create, deps, cleanup: null, pending: false };
    hooks.push(cell);
    fiber.root.queueEffect(fiber, cell);
    return;
  }
  if (depsChanged(existing.deps, deps)) {
    existing.create = create;
    existing.deps = deps;
    if (!existing.pending) fiber.root.queueEffect(fiber, existing);
  }
}

export function useEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
  effect("passive", create, deps);
}

export function useLayoutEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
  effect("layout", create, deps);
}

export function useInsertionEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
  effect("insertion", create, deps);
}

export function useImperativeHandle<T>(ref: unknown, create: () => T, deps?: readonly unknown[]): void {
  effect(
    "layout",
    () => {
      const value = create();
      if (typeof ref === "function") {
        (ref as (value: T | null) => void)(value);
        return () => (ref as (value: T | null) => void)(null);
      }
      if (typeof ref === "object" && ref !== null) {
        (ref as { current: T | null }).current = value;
        return () => {
          (ref as { current: T | null }).current = null;
        };
      }
      return undefined;
    },
    deps === undefined ? undefined : [...deps, ref],
  );
}

export function useContext<T>(context: ContextType<T>): T {
  const fiber = currentFiber();
  for (let f = fiber.parent; f !== null; f = f.parent) {
    if (f.kind === "provider" && f.type === context) {
      if (f.readers !== null && !f.readers.has(fiber)) {
        f.readers.add(fiber);
        (fiber.reading ?? (fiber.reading = new Set())).add(f);
      }
      return f.contextValue as T;
    }
  }
  return context.defaultValue;
}

export function useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T, _getServerSnapshot?: () => T): T {
  const fiber = currentFiber();
  const cell = nextCell<StoreCell>(() => ({ tag: "store", value: undefined, getSnapshot, subscribe: null, unsubscribe: null }));
  const value = getSnapshot();
  cell.value = value;
  cell.getSnapshot = getSnapshot;
  effect(
    "layout",
    () => {
      const check = () => {
        if (!fiber.dead && !Object.is(cell.value, cell.getSnapshot())) fiber.root.schedule(fiber);
      };
      cell.subscribe = subscribe;
      cell.unsubscribe = subscribe(check);
      check();
      return () => {
        const unsubscribe = cell.unsubscribe;
        cell.unsubscribe = null;
        unsubscribe?.();
      };
    },
    [subscribe],
  );
  return value;
}

export function useId(): string {
  const fiber = currentFiber();
  return useMemo(() => fiber.root.nextId(), []);
}

export function useDeferredValue<T>(value: T): T {
  return value;
}

export function useTransition(): [boolean, (run: () => void) => void] {
  return [false, startTransition];
}

export function startTransition(run: () => void): void {
  run();
}

export function useDebugValue(): void {}

/** Reads a context, or waits on a promise under the nearest `Suspense`. */
export function use<T>(source: ContextType<T> | PromiseLike<T>): T {
  if (isThenable(source)) {
    const tracked = source as PromiseLike<T> & { status?: string; value?: T; reason?: unknown };
    if (tracked.status === "fulfilled") return tracked.value as T;
    if (tracked.status === "rejected") throw tracked.reason;
    if (tracked.status === undefined) {
      tracked.status = "pending";
      tracked.then(
        (value) => {
          tracked.status = "fulfilled";
          tracked.value = value;
        },
        (reason: unknown) => {
          tracked.status = "rejected";
          tracked.reason = reason;
        },
      );
    }
    throw tracked;
  }
  return useContext(source);
}

/** Base class for the few class components (error boundaries). */
export class Component<P = Props, S = Record<string, unknown>> {
  static readonly isUiClass = true as const;
  props: P;
  state: S = {} as S;
  declare context: unknown;

  constructor(props: P) {
    this.props = props;
  }

  setState(update: Partial<S> | ((state: S, props: P) => Partial<S> | null) | null, done?: () => void): void {
    const fiber = (this as unknown as { fiber?: Fiber }).fiber; // type-escape: set by the reconciler at mount
    if (fiber === undefined || fiber.dead) return;
    const base = (fiber.pendingState ?? this.state) as S;
    const partial = typeof update === "function" ? update(base, this.props) : update;
    if (partial === null || partial === undefined) return;
    fiber.pendingState = { ...base, ...partial } as Record<string, unknown>;
    fiber.root.schedule(fiber);
    if (done !== undefined) queueMicrotask(done);
  }

  forceUpdate(): void {
    const fiber = (this as unknown as { fiber?: Fiber }).fiber; // type-escape: set by the reconciler at mount
    if (fiber !== undefined) fiber.root.schedule(fiber);
  }

  render(): UiNode {
    return null;
  }
}

export const PureComponent = Component;
