import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";
import type { CellBounds } from "./cellContent";
import {
  createWorldStreamer,
  gridCellId,
  gridShards,
  shardDistance,
  type StreamFocus,
  type WorldStreamerState,
  type WorldStreamerTuning,
} from "./streamer";

/** One kind of content that follows its cells; every {@link CellContent} is one. */
export interface CellFollower {
  unload(cell: string, bounds: CellBounds): number;
  load(cell: string): void;
  step(): number;
  settled(cell: string): boolean;
}

/**
 * Where one streamed cell stands. `loading`: its content is being fetched and placed back. `ready`:
 * full content. `leaving`: past the keep radius, content still placed while the renderer builds its
 * far proxy. `warming`: never seen and out of range, placed once only so its proxy can be built.
 * `unloaded`: its content is parked by each kind's rule.
 */
export type StreamedCellState = "unloaded" | "loading" | "ready" | "leaving" | "warming";

/** Play-time tuning of a {@link CellStreaming}. */
export interface CellStreamingTuning extends WorldStreamerTuning {
  /** Cells this close to a focus whose far proxy was never built are placed one at a time, hidden, so the renderer can build it. 0 turns warming off. Default 0. */
  warmRadius?: number;
}

/** Options for {@link createCellStreaming}. */
export interface CellStreamingOptions extends CellStreamingTuning {
  /** The world area cells cover. */
  area: CellBounds;
  /** Cell edge in metres. With far proxies on, a multiple of the proxy cell (128 m). */
  cellSize: number;
  /** The content kinds that follow their cells (bodies, entities). */
  content: readonly CellFollower[];
}

/** What a renderer attaching to {@link CellStreaming} supplies. */
export interface CellStreamingRenderer {
  /** Fetch what a cell's content needs to draw (model files) before it is placed back. */
  prepare?(cell: string): Promise<void>;
}

/** Plain JSON state of a {@link CellStreaming}; each content kind snapshots its own parked records. */
export interface CellStreamingState {
  streamer: WorldStreamerState;
  cells: [cell: string, state: StreamedCellState][];
  proxied: string[];
}

/** Gauges for the perf overlay and probes. */
export interface CellStreamingStats {
  cells: number;
  ready: number;
  loading: number;
  leaving: number;
  warming: number;
  unloaded: number;
  /** Loads and unloads the per-update budget held back. */
  pending: number;
  /** Content items placed back by the last tick. */
  restored: number;
  /** Main-thread ms of the last tick, content placement included. */
  lastTickMs: number;
}

/** Cells of a world streaming in and out around focus points, with their content following by rule. */
export interface CellStreaming {
  readonly cellSize: number;
  /** Park every cell out of reach of the first focus points at once, before the first frame draws them. */
  start(focus: StreamFocus | readonly StreamFocus[]): void;
  /** Bring every parked cell's content back at once and forget residency, for a world about to be rebuilt or restored; `start` streams it again. */
  stop(): void;
  /** Advance residency for this tick's focus points (every player's), within the load and unload budgets. */
  tick(focus: StreamFocus | readonly StreamFocus[]): void;
  state(cell: string): StreamedCellState;
  cellAt(x: number, z: number): string;
  boundsOf(cell: string): CellBounds;
  /** Whether a renderer should draw the cell at a world point as its far proxy rather than its props. */
  holdsProxy(x: number, z: number): boolean;
  /** Cells waiting for the renderer's far proxy before their content is parked. */
  leaving(): readonly string[];
  /** The renderer finished a leaving cell's proxy: park its content now. */
  proxyReady(cell: string): void;
  /** A renderer draws this world: leaving cells now wait for its proxies. Returns the detach. */
  attachRenderer(renderer: CellStreamingRenderer): () => void;
  retune(patch: Partial<CellStreamingTuning>): void;
  stats(): CellStreamingStats;
  snapshot(): CellStreamingState;
  restore(state: CellStreamingState): void;
}

function focusList(focus: StreamFocus | readonly StreamFocus[]): readonly StreamFocus[] {
  return "x" in focus ? [focus] : focus;
}

/**
 * Stream a world's cells around focus points: each cell loads (fetch, then its content placed back a
 * few items per tick) within `loadRadius` of any focus, unloads past `keepRadius` of all of them, and
 * at most `loadsPerUpdate` / `unloadsPerUpdate` cells change per tick. With a renderer attached a
 * cell keeps a far proxy: a leaving cell parks only once its proxy is built, a loading one shows the
 * proxy until its content is back, and cells never seen are warmed one at a time to build theirs.
 * Bodies and entities follow by the rule each content kind was made with.
 * @capability world-streaming-cells stream a world's cells around every player with budgets, async loads and far proxies
 */
export function createCellStreaming(options: CellStreamingOptions): CellStreaming {
  const size = options.cellSize;
  const cells = gridShards({ min: options.area.min, max: options.area.max, cellSize: size });
  const bounds = new Map(cells.map((cell) => [cell.id, cell.bounds]));
  const streamer = createWorldStreamer({ ...options, shards: cells, awaitReady: true });
  const content = options.content;
  let warmRadius = Math.max(0, options.warmRadius ?? 0);
  const states = new Map<string, StreamedCellState>();
  /** Cells loading or warming: the only ones a tick checks for settled content. */
  const active = new Set<string>();
  const leavingSet = new Set<string>();
  const setState = (cell: string, state: StreamedCellState) => {
    states.set(cell, state);
    if (state === "loading" || state === "warming") active.add(cell);
    else active.delete(cell);
    if (state === "leaving") leavingSet.add(cell);
    else leavingSet.delete(cell);
  };
  const prepared = new Set<string>();
  const proxied = new Set<string>();
  const generation = new Map<string, number>();
  let renderer: CellStreamingRenderer | null = null;
  let warming: string | null = null;
  let pending = 0;
  let restored = 0;
  let lastTickMs = 0;

  const stateOf = (cell: string): StreamedCellState => states.get(cell) ?? (bounds.has(cell) ? "unloaded" : "ready");
  const settled = (cell: string) => content.every((kind) => kind.settled(cell));

  const park = (cell: string) => {
    const box = bounds.get(cell);
    if (box === undefined) return;
    for (const kind of content) kind.unload(cell, box);
    setState(cell, "unloaded");
    prepared.delete(cell);
  };

  const bringBack = (cell: string, as: "loading" | "warming") => {
    setState(cell, as);
    const run = (generation.get(cell) ?? 0) + 1;
    generation.set(cell, run);
    const arrive = () => {
      if (generation.get(cell) !== run || stateOf(cell) !== as) return;
      prepared.add(cell);
      for (const kind of content) kind.load(cell);
    };
    const fetch = renderer?.prepare?.(cell);
    if (fetch === undefined) arrive();
    else void fetch.then(arrive, arrive);
  };

  const leave = (cell: string) => {
    if (renderer === null) park(cell);
    else setState(cell, "leaving");
  };

  const pickWarm = (focus: readonly StreamFocus[]) => {
    if (renderer === null || warmRadius <= 0 || warming !== null) return;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const point of focus) {
      for (let row = Math.floor((point.z - warmRadius) / size); row <= Math.floor((point.z + warmRadius) / size); row += 1) {
        for (let col = Math.floor((point.x - warmRadius) / size); col <= Math.floor((point.x + warmRadius) / size); col += 1) {
          const id = `${col},${row}`;
          const box = bounds.get(id);
          if (box === undefined || proxied.has(id) || stateOf(id) !== "unloaded") continue;
          const distance = shardDistance({ id, bounds: box }, point);
          if (distance <= warmRadius && distance < bestDistance) {
            best = id;
            bestDistance = distance;
          }
        }
      }
    }
    if (best === null) return;
    warming = best;
    bringBack(best, "warming");
  };

  return {
    cellSize: size,
    start(input) {
      const focus = focusList(input);
      streamer.reset();
      const reach = streamer.tuning().loadRadius;
      for (const cell of cells) {
        const near = focus.some((point) => shardDistance(cell, point) <= reach);
        if (near) continue;
        park(cell.id);
      }
      streamer.retune({ loadsPerUpdate: Number.MAX_SAFE_INTEGER });
      const tuning = streamer.tuning();
      streamer.update(focus);
      streamer.retune({ loadsPerUpdate: options.loadsPerUpdate ?? tuning.loadsPerUpdate });
      for (const id of streamer.resident()) {
        streamer.markReady(id);
        setState(id, "ready");
      }
    },
    stop() {
      for (const [cell, state] of states) if (state !== "ready") for (const kind of content) kind.load(cell);
      let guard = 1e6;
      while (content.some((kind) => kind.step() > 0) && guard-- > 0);
      states.clear();
      active.clear();
      leavingSet.clear();
      prepared.clear();
      generation.clear();
      warming = null;
      streamer.reset();
    },
    tick(input) {
      const started = performance.now();
      const focus = focusList(input);
      const update = streamer.update(focus);
      pending = update.pending;
      for (const cell of update.unload) {
        const state = stateOf(cell);
        if (state === "ready" || state === "loading") leave(cell);
      }
      for (const cell of update.load) {
        const state = stateOf(cell);
        if (state === "leaving" || state === "ready") {
          setState(cell, "ready");
          streamer.markReady(cell);
        } else if (state === "warming") {
          if (warming === cell) warming = null;
          setState(cell, "loading");
        } else bringBack(cell, "loading");
      }
      restored = 0;
      for (const kind of content) restored += kind.step();
      for (const cell of [...active]) {
        if (!prepared.has(cell) || !settled(cell)) continue;
        const state = stateOf(cell);
        if (state === "loading") {
          setState(cell, "ready");
          streamer.markReady(cell);
        } else if (state === "warming") {
          warming = null;
          leave(cell);
        }
      }
      pickWarm(focus);
      lastTickMs = performance.now() - started;
    },
    state: stateOf,
    cellAt: (x, z) => gridCellId(x, z, size),
    boundsOf: (cell) => bounds.get(cell) ?? { min: [0, 0], max: [0, 0] },
    holdsProxy(x, z) {
      const cell = gridCellId(x, z, size);
      return bounds.has(cell) && stateOf(cell) !== "ready";
    },
    leaving: () => [...leavingSet],
    proxyReady(cell) {
      if (stateOf(cell) !== "leaving") return;
      proxied.add(cell);
      park(cell);
    },
    attachRenderer(next) {
      renderer = next;
      return () => {
        if (renderer !== next) return;
        renderer = null;
        for (const cell of [...leavingSet]) park(cell);
      };
    },
    retune(patch) {
      streamer.retune(patch);
      if (patch.warmRadius !== undefined) warmRadius = Math.max(0, patch.warmRadius);
    },
    stats() {
      let ready = 0, loading = 0, leaving = 0, warmingCount = 0, unloaded = 0;
      for (const cell of cells) {
        const state = stateOf(cell.id);
        if (state === "ready") ready += 1;
        else if (state === "loading") loading += 1;
        else if (state === "leaving") leaving += 1;
        else if (state === "warming") warmingCount += 1;
        else unloaded += 1;
      }
      return { cells: cells.length, ready, loading, leaving, warming: warmingCount, unloaded, pending, restored, lastTickMs };
    },
    snapshot: () => ({
      streamer: streamer.snapshot(),
      cells: [...states.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      proxied: [...proxied].sort(),
    }),
    restore(state) {
      streamer.restore(state.streamer);
      states.clear();
      active.clear();
      leavingSet.clear();
      prepared.clear();
      proxied.clear();
      warming = null;
      for (const [cell, value] of state.cells) {
        // A cell caught mid-change comes back as it would settle: placed content stays placed, a cell
        // that was being fetched is fetched again.
        if (value === "leaving" || value === "ready") setState(cell, value);
        else if (value === "loading") bringBack(cell, "loading");
        else setState(cell, "unloaded");
      }
      for (const cell of state.proxied) proxied.add(cell);
    },
  };
}

const bound = perContext((): { streaming: CellStreaming | null } => ({ streaming: null }));

/** Hand a game's streaming to the renderer, which draws far proxies for the cells it holds. Pass null to detach. */
export function bindCellStreaming(ctx: GameContext, streaming: CellStreaming | null): void {
  bound(ctx).streaming = streaming;
}

/** The streaming a game bound to this context, if any. @internal */
export function boundCellStreaming(ctx: GameContext): CellStreaming | null {
  return bound(ctx).streaming;
}
