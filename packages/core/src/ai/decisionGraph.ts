/** Scalar values stored in a decision graph blackboard. */
export type BlackboardValue = number | boolean | string;
/** Named facts available to conditions, utilities, and actions. */
export type Blackboard = Record<string, BlackboardValue>;

/** Comparison operators supported by decision conditions. */
export type DecisionOperator = "=" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

/** Serializable selector, sequence, condition, action, or utility node. */
export type DecisionNode =
  | { kind: "selector"; children: DecisionNode[] }
  | { kind: "sequence"; children: DecisionNode[] }
  | { kind: "condition"; key: string; op: DecisionOperator; value: BlackboardValue }
  | { kind: "action"; action: string; params?: Record<string, BlackboardValue> }
  | { kind: "utility"; options: { score: { key: string; weight: number }[]; node: DecisionNode }[] };

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

/** Serializable state retained by an active decision graph. */
export interface DecisionGraphSnapshot {
  runningPath: number[] | null;
}

/** Stateful evaluator for a serializable decision graph. */
export interface DecisionGraphRuntime<Context = unknown> {
  tick(ctx: Context, blackboard: Blackboard, dt: number): DecisionStatus;
  snapshot(): DecisionGraphSnapshot;
  restore(next: DecisionGraphSnapshot): void;
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

/** Creates a deterministic runtime for a serializable decision graph.
 * @capability ai-decision-graph Evaluate serializable selector, sequence, condition, action, and utility AI decisions.
 */
export function createDecisionGraphRuntime<Context = unknown>(
  graph: DecisionGraph,
  actions: Record<string, DecisionAction<Context>>,
): DecisionGraphRuntime<Context> {
  let runningPath: number[] | null = null;

  function run(node: DecisionNode, ctx: Context, blackboard: Blackboard, dt: number, path: number[]): DecisionStatus {
    switch (node.kind) {
      case "condition":
        return compare(blackboard[node.key], node.op, node.value) ? "done" : "failed";
      case "action": {
        const action = actions[node.action];
        if (action === undefined) throw new Error(`Decision action '${node.action}' is not registered`);
        const status = action(ctx, node.params, blackboard);
        if (status === "running") runningPath = path;
        return status;
      }
      case "selector":
        for (let index = 0; index < node.children.length; index += 1) {
          const status = run(node.children[index]!, ctx, blackboard, dt, [...path, index]);
          if (status !== "failed") return status;
        }
        return "failed";
      case "sequence":
        for (let index = 0; index < node.children.length; index += 1) {
          const status = run(node.children[index]!, ctx, blackboard, dt, [...path, index]);
          if (status !== "done") return status;
        }
        return "done";
      case "utility": {
        let best = -Infinity;
        let bestIndex = -1;
        for (let index = 0; index < node.options.length; index += 1) {
          const score = node.options[index]!.score.reduce(
            (total, term) => total + (typeof blackboard[term.key] === "number" ? blackboard[term.key] as number : 0) * term.weight,
            0,
          );
          if (score > best) {
            best = score;
            bestIndex = index;
          }
        }
        return bestIndex < 0 ? "failed" : run(node.options[bestIndex]!.node, ctx, blackboard, dt, [...path, bestIndex]);
      }
    }
  }

  return {
    tick(ctx, blackboard, dt) {
      runningPath = null;
      return run(graph, ctx, blackboard, dt, []);
    },
    snapshot() {
      return { runningPath: runningPath === null ? null : [...runningPath] };
    },
    restore(next) {
      runningPath = next.runningPath === null ? null : [...next.runningPath];
    },
  };
}
