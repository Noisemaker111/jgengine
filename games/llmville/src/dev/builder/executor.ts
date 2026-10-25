/**
 * Tool-call execution layer for "chat with the scene": owns method
 * enumeration and invocation for every callable API namespace. There is no
 * separate maintained tool API — each namespace's callable surface is
 * whatever it enumerates off a live object at runtime.
 *
 * Only the BuilderStore namespace is registered today. A future namespace
 * (e.g. a Convex gameplay API) can be added to `NAMESPACES` without touching
 * `builderChat.ts` — method names stay bare (no namespace prefix) so the
 * server-side prompt/validation code doesn't need to change either.
 */
import { BuilderStore } from "@/dev/builder/builderStore";

const RESULT_PREVIEW_LIMIT = 300;
const ARGS_PREVIEW_LIMIT = 120;
const CALL_TIMEOUT_MS = 60_000;

export interface ToolCallRequest {
  method: string;
  args: unknown[];
}

export interface ExecutedCall {
  method: string;
  argsPreview: string;
  result: string;
  ok: boolean;
}

/** One callable API surface: enumerates its own method names and invokes them by name. */
interface ApiNamespace {
  enumerate(): string[];
  invoke(method: string, args: unknown[]): unknown;
}

/**
 * Runtime plumbing to hide from the agent: React-store machinery, not scene
 * operations. TS `private` methods are erased at runtime and still show up
 * here — the server intersects this enumeration against source-derived
 * public signatures (see `builderChatAgent.server.ts`) and reports back the
 * confirmed-public subset, which callers should pass as `allowedMethods` to
 * `executeToolCalls`.
 */
const METHOD_DENYLIST = new Set(["constructor", "subscribe", "getState", "getSnapshot", "setState", "emit"]);

function isPlumbingName(name: string): boolean {
  return METHOD_DENYLIST.has(name) || name.startsWith("_") || name.startsWith("#");
}

/** Walk an instance's prototype chain, keeping own methods that are functions. */
function enumeratePrototypeMethods(instance: object): string[] {
  const names = new Set<string>();
  let proto: object | null = Object.getPrototypeOf(instance) as object | null;
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (isPlumbingName(name)) continue;
      const value = (proto as Record<string, unknown>)[name];
      if (typeof value === "function") names.add(name);
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return [...names].sort();
}

type MethodTable = Record<string, ((...args: unknown[]) => unknown) | undefined>;

const builderStoreNamespace: ApiNamespace = {
  enumerate: () => enumeratePrototypeMethods(BuilderStore),
  invoke(method, args) {
    const table = BuilderStore as unknown as MethodTable;
    const fn = table[method];
    if (typeof fn !== "function") throw new Error(`Unknown method "${method}".`);
    return fn.apply(BuilderStore, args);
  },
};

/** Namespace registry. Register additional API surfaces here as they come online. */
const NAMESPACES: Record<string, ApiNamespace> = {
  builder: builderStoreNamespace,
};

/** Union of every registered namespace's callable method names, sent to the server each turn. */
export function enumerateCallableMethods(): string[] {
  const names = new Set<string>();
  for (const namespace of Object.values(NAMESPACES)) {
    for (const name of namespace.enumerate()) names.add(name);
  }
  return [...names].sort();
}

function findNamespaceForMethod(method: string): ApiNamespace | null {
  for (const namespace of Object.values(NAMESPACES)) {
    if (namespace.enumerate().includes(method)) return namespace;
  }
  return null;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function previewArgs(args: unknown[]): string {
  try {
    return truncate(JSON.stringify(args) ?? "[]", ARGS_PREVIEW_LIMIT);
  } catch {
    return "[unserializable]";
  }
}

function previewResult(value: unknown): string {
  if (value === undefined) return "ok";
  try {
    const json = JSON.stringify(value);
    return json === undefined ? "ok" : truncate(json, RESULT_PREVIEW_LIMIT);
  } catch {
    return "ok";
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

type AwaitOutcome = { kind: "resolved"; value: unknown } | { kind: "timeout" };

/** Race a call's return value against a timeout so one slow async call can't hang the whole batch. */
function awaitWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<AwaitOutcome> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<AwaitOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  const resolvedPromise = promise.then((value): AwaitOutcome => ({ kind: "resolved", value }));
  // A rejection arriving after we've already reported a timeout would
  // otherwise surface as an unhandled rejection once the race has moved on.
  resolvedPromise.catch(() => {});
  return Promise.race([resolvedPromise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function executeOne(call: ToolCallRequest, allowed: Set<string> | null): Promise<ExecutedCall> {
  const argsPreview = previewArgs(call.args);
  if (allowed && !allowed.has(call.method)) {
    return { method: call.method, argsPreview, ok: false, result: `Method "${call.method}" is not in the public API surface.` };
  }
  const namespace = findNamespaceForMethod(call.method);
  if (!namespace) {
    return { method: call.method, argsPreview, ok: false, result: `Unknown method "${call.method}".` };
  }

  try {
    const raw = namespace.invoke(call.method, call.args);
    if (!isThenable(raw)) {
      return { method: call.method, argsPreview, ok: true, result: previewResult(raw) };
    }

    const settled = await awaitWithTimeout(Promise.resolve(raw), CALL_TIMEOUT_MS);
    if (settled.kind === "timeout") {
      return { method: call.method, argsPreview, ok: true, result: `still running in background (no result after ${CALL_TIMEOUT_MS / 1000}s)` };
    }
    return { method: call.method, argsPreview, ok: true, result: previewResult(settled.value) };
  } catch (error) {
    return { method: call.method, argsPreview, ok: false, result: error instanceof Error ? error.message : String(error) };
  }
}

export interface ExecuteBatchOptions {
  /** Server-confirmed public method names for this turn; calls outside this set are rejected. */
  allowedMethods?: readonly string[];
}

/** Execute a batch of tool calls sequentially. A failed call records its error and does not stop the batch. */
export async function executeToolCalls(
  calls: readonly ToolCallRequest[],
  options: ExecuteBatchOptions = {},
): Promise<ExecutedCall[]> {
  const allowed = options.allowedMethods ? new Set(options.allowedMethods) : null;
  const results: ExecutedCall[] = [];
  for (const call of calls) {
    results.push(await executeOne(call, allowed));
  }
  return results;
}
