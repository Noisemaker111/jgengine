/**
 * One selectable response on a conversation node — the text a player clicks and the
 * node it advances to. `kind` is a free style tag the presenter interprets; the model
 * never reads it (no genre baked in).
 */
export interface DialogueGraphChoice {
  text: string;
  to?: string | null;
  /** Free-string style/category tag the game styles on (never interpreted by the model). */
  kind?: string;
}

/**
 * One conversation node: who is speaking, the line they say, and the branches out of it.
 * `speaker`/`speakerKind`/`portrait` are opaque display data — the model never interprets them.
 */
export interface DialogueGraphNode {
  id: string;
  speaker?: string;
  speakerKind?: string;
  portrait?: string;
  text: string;
  choices?: readonly DialogueGraphChoice[];
}

export interface DialogueGraph {
  start: string;
  nodes: readonly DialogueGraphNode[];
}

export interface DialogueGraphIssue {
  code: "duplicate-node" | "missing-start" | "missing-target" | "unreachable-node" | "no-exit";
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  nodeIndex?: number;
  choiceIndex?: number;
  targetId?: string;
}

/**
 * Check authored dialogue references, reachability, and routes to an ending in O(nodes + choices).
 * A node without choices, or a choice with no target, is an ending. Loops with an exit are valid.
 * Duplicate ids and missing references are errors; unreachable nodes and closed loops are warnings
 * because games may jump to nodes or intentionally keep conversations open. Topology uses the first
 * node for each id, matching {@link selectDialogueView}. This does not evaluate story semantics.
 *
 * @capability dialogue-graph-validation diagnose duplicate ids, broken branches, unreachable dialogue, and nodes without a route to an ending before play
 */
export function validateDialogueGraph(graph: DialogueGraph): DialogueGraphIssue[] {
  const issues: DialogueGraphIssue[] = [];
  const nodes = new Map<string, { node: DialogueGraphNode; index: number }>();
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index]!;
    if (nodes.has(node.id)) {
      issues.push({
        code: "duplicate-node", severity: "error", nodeId: node.id, nodeIndex: index,
        message: `Duplicate dialogue node "${node.id}".`,
      });
    } else {
      nodes.set(node.id, { node, index });
    }
  }
  if (!nodes.has(graph.start)) {
    issues.push({
      code: "missing-start", severity: "error", targetId: graph.start,
      message: `Dialogue start "${graph.start}" does not exist.`,
    });
  }
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index]!;
    const choices = node.choices ?? [];
    for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex++) {
      const target = choices[choiceIndex]!.to;
      if (target == null || nodes.has(target)) continue;
      issues.push({
        code: "missing-target", severity: "error", nodeId: node.id, nodeIndex: index,
        choiceIndex, targetId: target,
        message: `Dialogue choice targets unknown node "${target}".`,
      });
    }
  }

  const predecessors = new Map<string, string[]>();
  const canEnd = new Set<string>();
  const endings: string[] = [];
  for (const { node } of nodes.values()) {
    const choices = node.choices ?? [];
    let ending = choices.length === 0;
    for (const choice of choices) {
      if (choice.to == null) {
        ending = true;
      } else if (nodes.has(choice.to)) {
        let incoming = predecessors.get(choice.to);
        if (incoming === undefined) {
          incoming = [];
          predecessors.set(choice.to, incoming);
        }
        incoming.push(node.id);
      }
    }
    if (ending) {
      canEnd.add(node.id);
      endings.push(node.id);
    }
  }
  for (let head = 0; head < endings.length; head++) {
    for (const id of predecessors.get(endings[head]!) ?? []) {
      if (canEnd.has(id)) continue;
      canEnd.add(id);
      endings.push(id);
    }
  }

  const reachable = new Set<string>();
  const pending: string[] = [];
  if (nodes.has(graph.start)) {
    reachable.add(graph.start);
    pending.push(graph.start);
  }
  for (let head = 0; head < pending.length; head++) {
    for (const choice of nodes.get(pending[head]!)!.node.choices ?? []) {
      const target = choice.to;
      if (target == null || !nodes.has(target) || reachable.has(target)) continue;
      reachable.add(target);
      pending.push(target);
    }
  }
  for (const { node, index } of nodes.values()) {
    if (nodes.has(graph.start) && !reachable.has(node.id)) {
      issues.push({
        code: "unreachable-node", severity: "warning", nodeId: node.id, nodeIndex: index,
        message: `Dialogue node "${node.id}" is unreachable from the start.`,
      });
    }
    if (!canEnd.has(node.id)) {
      issues.push({
        code: "no-exit", severity: "warning", nodeId: node.id, nodeIndex: index,
        message: `Dialogue node "${node.id}" has no route to an ending.`,
      });
    }
  }
  return issues;
}

export interface DialogueGraphView {
  nodeId: string;
  speaker?: string | undefined;
  speakerKind?: string | undefined;
  portrait?: string | undefined;
  text: string;
  choices: readonly DialogueGraphChoice[];
  done: boolean;
}

export interface DialogueGraphSnapshot {
  nodeId: string;
  visited: readonly string[];
}

export interface DialogueRunOptions {
  /** Node id to open on. Default: the graph's `start`. */
  startAt?: string;
  visited?: Iterable<string>;
}

export interface DialogueRun {
  readonly graph: DialogueGraph;
  current(): DialogueGraphView | null;
  currentId(): string;
  choose(index: number): DialogueGraphView | null;
  goTo(nodeId: string): DialogueGraphView | null;
  reset(): DialogueGraphView | null;
  isDone(): boolean;
  hasVisited(nodeId: string): boolean;
  subscribe(listener: () => void): () => void;
  snapshot(): DialogueGraphSnapshot;
  restore(snapshot: DialogueGraphSnapshot): void;
}

/** @capability dialogue-graph-view select a conversation node's render-ready view (speaker, line, branching choices) from a serializable dialogue graph */
export function selectDialogueView(graph: DialogueGraph, nodeId: string): DialogueGraphView | null {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) return null;
  const choices = node.choices ?? [];
  return {
    nodeId: node.id,
    speaker: node.speaker,
    speakerKind: node.speakerKind,
    portrait: node.portrait,
    text: node.text,
    choices,
    done: choices.length === 0,
  };
}

/**
 * Walk a branching {@link DialogueGraph}: hold the current node, expose its render-ready
 * view, and advance by choosing one of the current node's responses (each choice names the
 * node it leads to; a choice with no `to` ends the conversation). Purely a serializable
 * model — a UI host renders `current()` and calls `choose(index)` — so no game
 * re-implements node lookup, choice-to-node traversal, or "am I at the end" bookkeeping.
 * `snapshot`/`restore` round-trip the run through a save.
 *
 * @capability dialogue-run walk a serializable branching dialogue graph — current node view, choose-to-advance traversal, visited history, snapshot/restore
 */
export function createDialogueRun(graph: DialogueGraph, options: DialogueRunOptions = {}): DialogueRun {
  const start = options.startAt ?? graph.start;
  const listeners = new Set<() => void>();
  let currentId = start;
  const visited: string[] = [];

  function markVisited(id: string): void {
    if (visited[visited.length - 1] !== id) visited.push(id);
  }

  for (const id of options.visited ?? []) markVisited(id);
  markVisited(currentId);

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function moveTo(nodeId: string): DialogueGraphView | null {
    currentId = nodeId;
    markVisited(nodeId);
    notify();
    return selectDialogueView(graph, currentId);
  }

  return {
    graph,
    current() {
      return selectDialogueView(graph, currentId);
    },
    currentId() {
      return currentId;
    },
    choose(index) {
      const view = selectDialogueView(graph, currentId);
      const choice = view?.choices[index];
      if (choice === undefined) return view;
      const to = choice.to;
      if (to === undefined || to === null) return view; // terminal choice — caller closes
      return moveTo(to);
    },
    goTo(nodeId) {
      return moveTo(nodeId);
    },
    reset() {
      visited.length = 0;
      return moveTo(start);
    },
    isDone() {
      return (selectDialogueView(graph, currentId)?.done ?? true) === true;
    },
    hasVisited(nodeId) {
      return visited.includes(nodeId);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { nodeId: currentId, visited: [...visited] };
    },
    restore(snapshot) {
      currentId = snapshot.nodeId;
      visited.length = 0;
      for (const id of snapshot.visited) markVisited(id);
      if (!visited.includes(currentId)) markVisited(currentId);
      notify();
    },
  };
}
