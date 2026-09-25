/** Scalar values stored in a decision graph blackboard. */
export type BlackboardValue = number | boolean | string;
/** Named facts available to conditions, utilities, and actions. */
export type Blackboard = Record<string, BlackboardValue>;

/** Comparison operators supported by decision conditions. */
export type DecisionOperator = "=" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

/**
 * Serializable decision node.
 * - `selector` runs children in order until one does not fail; `sequence` until one does not finish.
 *   With `memory`, a composite whose child was running last tick resumes at that child instead of re-checking earlier ones.
 * - `condition` compares a blackboard key; `action` calls a registered action.
 * - `utility` runs the option with the highest weighted blackboard score.
 * - `invert` swaps `done` and `failed`; `cooldown` fails for `seconds` after its child finishes;
 *   `wait` stays running for `seconds`; `random` picks a child by `weights` from the runtime's `rng` and keeps it while it runs.
 */
export type DecisionNode =
  | { kind: "selector"; children: DecisionNode[]; memory?: boolean }
  | { kind: "sequence"; children: DecisionNode[]; memory?: boolean }
  | { kind: "condition"; key: string; op: DecisionOperator; value: BlackboardValue }
  | { kind: "action"; action: string; params?: Record<string, BlackboardValue> }
  | { kind: "utility"; options: { score: { key: string; weight: number }[]; node: DecisionNode }[] }
  | { kind: "invert"; child: DecisionNode }
  | { kind: "cooldown"; seconds: number; child: DecisionNode }
  | { kind: "wait"; seconds: number }
  | { kind: "random"; children: DecisionNode[]; weights?: number[] };

/** Root node for a serializable AI decision graph. */
export type DecisionGraph = DecisionNode;
/** Outcome reported when a decision graph evaluates. */
export type DecisionStatus = "running" | "done" | "failed";

/** Callback implementation for an action node. */
export type DecisionAction<Context = unknown> = (
  ctx: Context,
  params: Record<string, BlackboardValue> | undefined,
  blackboard: Blackboard,
) => DecisionStatus;

/** Called when an action that was running last tick is not reached this tick, so it can release what it holds. */
export type DecisionAbort<Context = unknown> = (
  action: string,
  ctx: Context,
  params: Record<string, BlackboardValue> | undefined,
  blackboard: Blackboard,
) => void;

/** Optional hooks and injected randomness for {@link createDecisionGraphRuntime}. */
export interface DecisionGraphOptions<Context = unknown> {
  onAbort?: DecisionAbort<Context>;
  /** `[0, 1)` source for `random` nodes; pass `ctx.rng`. Required only when the graph has one. */
  rng?: () => number;
}

/** Progress of a memory composite, `random` choice, or `wait` timer, keyed by node id (depth-first order). */
export interface DecisionNodeMemory {
  index: number;
  elapsed: number;
  tick: number;
}

/** Serializable state retained by an active decision graph. Fields besides `runningPath` are absent in older saves. */
export interface DecisionGraphSnapshot {
  runningPath: number[] | null;
  tick?: number;
  clock?: number;
  nodes?: Record<string, DecisionNodeMemory>;
  cooldowns?: Record<string, number>;
}

/** Stateful evaluator for a serializable decision graph. */
export interface DecisionGraphRuntime<Context = unknown> {
  tick(ctx: Context, blackboard: Blackboard, dt: number): DecisionStatus;
  /** Name of the action left running by the last tick, or null. */
  running(): string | null;
  snapshot(): DecisionGraphSnapshot;
  restore(next: DecisionGraphSnapshot): void;
}

interface Compiled {
  node: DecisionNode;
  id: number;
  path: number[];
  children: Compiled[];
}

function compare(left: BlackboardValue | undefined, op: DecisionOperator, right: BlackboardValue): boolean {
  switch (op) {
    case "=":
    case "==":
    case "eq":
      return left === right;
    case "!=":
    case "ne":
      return left !== right;
    case "<":
    case "lt":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "<=":
    case "lte":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case ">":
    case "gt":
      return typeof left === "number" && typeof right === "number" && left > right;
    case ">=":
    case "gte":
      return typeof left === "number" && typeof right === "number" && left >= right;
  }
}

function childrenOf(node: DecisionNode): DecisionNode[] {
  switch (node.kind) {
    case "selector":
    case "sequence":
    case "random":
      return node.children;
    case "utility":
      return node.options.map((option) => option.node);
    case "invert":
    case "cooldown":
      return [node.child];
    default:
      return [];
  }
}

function compile(root: DecisionNode): Compiled[] {
  const byId: Compiled[] = [];
  const visit = (node: DecisionNode, path: number[]): Compiled => {
    const entry: Compiled = { node, id: byId.length, path, children: [] };
    byId.push(entry);
    childrenOf(node).forEach((child, index) => entry.children.push(visit(child, [...path, index])));
    return entry;
  };
  visit(root, []);
  return byId;
}

/** Creates a deterministic runtime for a serializable decision graph.
 * @capability ai-decision-graph Evaluate serializable selector, sequence, condition, action, utility, timer, and random AI decisions with interrupt hooks.
 */
export function createDecisionGraphRuntime<Context = unknown>(
  graph: DecisionGraph,
  actions: Record<string, DecisionAction<Context>>,
  options: DecisionGraphOptions<Context> = {},
): DecisionGraphRuntime<Context> {
  const nodes = compile(graph);
  const root = nodes[0]!;
  let runningId = -1;
  let tickCount = 0;
  let clock = 0;
  const memory = new Map<number, DecisionNodeMemory>();
  const cooldowns = new Map<number, number>();
  const lastReached = new Float64Array(nodes.length).fill(-1);

  function carried(id: number): DecisionNodeMemory | undefined {
    const entry = memory.get(id);
    return entry !== undefined && entry.tick === tickCount - 1 ? entry : undefined;
  }

  function hold(id: number, index: number, elapsed: number): void {
    memory.set(id, { index, elapsed, tick: tickCount });
  }

  function run(entry: Compiled, ctx: Context, blackboard: Blackboard, dt: number): DecisionStatus {
    const node = entry.node;
    switch (node.kind) {
      case "condition":
        return compare(blackboard[node.key], node.op, node.value) ? "done" : "failed";
      case "action": {
        const action = actions[node.action];
        if (action === undefined) throw new Error(`Decision action '${node.action}' is not registered`);
        lastReached[entry.id] = tickCount;
        const status = action(ctx, node.params, blackboard);
        if (status === "running") runningId = entry.id;
        return status;
      }
      case "selector":
      case "sequence": {
        const stopOn: DecisionStatus = node.kind === "selector" ? "failed" : "done";
        const start = node.memory === true ? (carried(entry.id)?.index ?? 0) : 0;
        memory.delete(entry.id);
        for (let index = start; index < entry.children.length; index += 1) {
          const status = run(entry.children[index]!, ctx, blackboard, dt);
          if (status === stopOn) continue;
          if (status === "running" && node.memory === true) hold(entry.id, index, 0);
          return status;
        }
        return node.kind === "selector" ? "failed" : "done";
      }
      case "utility": {
        let best = -Infinity;
        let bestIndex = -1;
        for (let index = 0; index < node.options.length; index += 1) {
          let score = 0;
          for (const term of node.options[index]!.score) {
            const value = blackboard[term.key];
            if (typeof value === "number") score += value * term.weight;
          }
          if (score > best) {
            best = score;
            bestIndex = index;
          }
        }
        return bestIndex < 0 ? "failed" : run(entry.children[bestIndex]!, ctx, blackboard, dt);
      }
      case "invert": {
        const status = run(entry.children[0]!, ctx, blackboard, dt);
        return status === "running" ? status : status === "done" ? "failed" : "done";
      }
      case "cooldown": {
        if (clock < (cooldowns.get(entry.id) ?? -Infinity)) return "failed";
        const status = run(entry.children[0]!, ctx, blackboard, dt);
        if (status === "done") cooldowns.set(entry.id, clock + Math.max(0, node.seconds));
        return status;
      }
      case "wait": {
        const elapsed = (carried(entry.id)?.elapsed ?? 0) + dt;
        if (elapsed >= node.seconds) {
          memory.delete(entry.id);
          return "done";
        }
        hold(entry.id, 0, elapsed);
        runningId = entry.id;
        return "running";
      }
      case "random": {
        if (entry.children.length === 0) return "failed";
        let index = carried(entry.id)?.index ?? -1;
        if (index < 0) {
          if (options.rng === undefined) throw new Error("A random decision node needs options.rng (pass ctx.rng)");
          const weights = entry.children.map((_, i) => Math.max(0, node.weights?.[i] ?? 1));
          const total = weights.reduce((sum, weight) => sum + weight, 0);
          if (total <= 0) return "failed";
          let roll = options.rng() * total;
          index = 0;
          while (index < weights.length - 1 && roll >= weights[index]!) roll -= weights[index++]!;
        }
        memory.delete(entry.id);
        const status = run(entry.children[index]!, ctx, blackboard, dt);
        if (status === "running") hold(entry.id, index, 0);
        return status;
      }
    }
  }

  function idFromPath(path: readonly number[]): number {
    let entry: Compiled | undefined = root;
    for (const index of path) entry = entry?.children[index];
    return entry?.id ?? -1;
  }

  return {
    tick(ctx, blackboard, dt) {
      const previous = runningId;
      tickCount += 1;
      clock += Math.max(0, dt);
      runningId = -1;
      const status = run(root, ctx, blackboard, Math.max(0, dt));
      const abandoned = previous >= 0 ? nodes[previous]!.node : null;
      if (abandoned?.kind === "action" && lastReached[previous] !== tickCount) {
        options.onAbort?.(abandoned.action, ctx, abandoned.params, blackboard);
      }
      return status;
    },
    running() {
      const node = runningId >= 0 ? nodes[runningId]!.node : null;
      return node?.kind === "action" ? node.action : null;
    },
    snapshot() {
      const nodeState: Record<string, DecisionNodeMemory> = {};
      for (const [id, entry] of memory) nodeState[id] = { ...entry };
      const cooldownState: Record<string, number> = {};
      for (const [id, readyAt] of cooldowns) cooldownState[id] = readyAt;
      return {
        runningPath: runningId >= 0 ? [...nodes[runningId]!.path] : null,
        tick: tickCount,
        clock,
        nodes: nodeState,
        cooldowns: cooldownState,
      };
    },
    restore(next) {
      runningId = next.runningPath === null ? -1 : idFromPath(next.runningPath);
      tickCount = next.tick ?? 0;
      clock = next.clock ?? 0;
      memory.clear();
      cooldowns.clear();
      for (const [id, entry] of Object.entries(next.nodes ?? {})) memory.set(Number(id), { ...entry });
      for (const [id, readyAt] of Object.entries(next.cooldowns ?? {})) cooldowns.set(Number(id), readyAt);
    },
  };
}
