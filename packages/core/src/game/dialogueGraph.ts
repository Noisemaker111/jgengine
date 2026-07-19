/**
 * One selectable response on a conversation node — the text a player clicks and the
 * node it advances to. `kind` is a free style tag the presenter interprets; the model
 * never reads it (no genre baked in).
 */
export interface DialogueGraphChoice {
  /** Player-facing choice text. */
  text: string;
  /** Id of the node this choice advances to. Omitted / `null` ends the conversation. */
  to?: string | null;
  /** Free-string style/category tag the game styles on (never interpreted by the model). */
  kind?: string;
}

/**
 * One conversation node: who is speaking, the line they say, and the branches out of it.
 * `speaker`/`speakerKind`/`portrait` are opaque display data — the model never interprets them.
 */
export interface DialogueGraphNode {
  /** Stable node id — choices point at it via {@link DialogueGraphChoice.to}. */
  id: string;
  /** Free-string speaker name shown in the view. Omitted → an unattributed line. */
  speaker?: string;
  /** Free-string speaker style tag (the game maps it to a portrait frame / name color). */
  speakerKind?: string;
  /** Opaque portrait key or URL the view renders in its portrait slot. */
  portrait?: string;
  /** The line this node speaks. */
  text: string;
  /** Branching responses. Empty / omitted → a terminal node the player can close. */
  choices?: readonly DialogueGraphChoice[];
}

/** A serializable branching conversation: a start node id and the nodes it can reach. */
export interface DialogueGraph {
  /** Id of the node the conversation opens on. */
  start: string;
  /** Every node in the conversation. */
  nodes: readonly DialogueGraphNode[];
}

/**
 * The render-ready snapshot of a conversation at one node — everything a view needs to
 * draw speaker, line, and choice buttons, with no traversal logic in the component.
 */
export interface DialogueGraphView {
  /** Current node id. */
  nodeId: string;
  /** Speaker name to display, or `undefined` for an unattributed line. */
  speaker?: string;
  /** Speaker style tag the game skins on. */
  speakerKind?: string;
  /** Portrait key/URL for the portrait slot, or `undefined` when none. */
  portrait?: string;
  /** The current line text. */
  text: string;
  /** Branching responses at this node (empty at a terminal node). */
  choices: readonly DialogueGraphChoice[];
  /** True when this node has no onward choices — the conversation can be closed. */
  done: boolean;
}

/** Serializable run state — the current node id and the ids already visited. */
export interface DialogueGraphSnapshot {
  /** Node the run is currently sitting on. */
  nodeId: string;
  /** Node ids visited so far, in order (a start node is the first). */
  visited: readonly string[];
}

/** Options for {@link createDialogueRun}. */
export interface DialogueRunOptions {
  /** Node id to open on. Default: the graph's `start`. */
  startAt?: string;
  /** Visited node ids to seed (e.g. restored from a save). */
  visited?: Iterable<string>;
}

/** An observable walk through a {@link DialogueGraph}: current view, choose to advance, serialize. */
export interface DialogueRun {
  /** The graph being walked. */
  readonly graph: DialogueGraph;
  /** Render-ready view at the current node, or `null` if the current id is unknown. */
  current(): DialogueGraphView | null;
  /** The current node's id. */
  currentId(): string;
  /** Advance via the choice at `index` on the current node; returns the new view (or `null`). */
  choose(index: number): DialogueGraphView | null;
  /** Jump straight to a node id (bypassing choices); returns its view (or `null`). */
  goTo(nodeId: string): DialogueGraphView | null;
  /** Re-open on the start node, clearing visited history. */
  reset(): DialogueGraphView | null;
  /** Whether the current node is terminal (no onward choices). */
  isDone(): boolean;
  /** Whether a node id has been visited this run. */
  hasVisited(nodeId: string): boolean;
  /** Observe advance / jump / reset. Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable run state for a save. */
  snapshot(): DialogueGraphSnapshot;
  /** Restore from a {@link DialogueGraphSnapshot}. */
  restore(snapshot: DialogueGraphSnapshot): void;
}

/**
 * Project a {@link DialogueGraph} node id to its render-ready {@link DialogueGraphView} —
 * the pure "current view" selector a stateless renderer reads (speaker, line, choices,
 * done). Returns `null` when the id is not in the graph. No traversal or mutation.
 *
 * @capability dialogue-graph-view select a conversation node's render-ready view (speaker, line, branching choices) from a serializable dialogue graph
 */
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
 * model — a React host renders `current()` and calls `choose(index)` — so no game
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
