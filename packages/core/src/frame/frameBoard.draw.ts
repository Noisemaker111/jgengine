/**
 * The frame-task board every per-frame callback joins (`joinFrameTask`, and
 * the `useFrameTask`/`useSharedFrame`/`useFrameWhile` hooks over it).
 * `createEngineLoop` binds each loop as a frame source, and a test binds its
 * own. Callers join a priority and leave.
 *
 * One canvas is the primary: the first loop bound while none is. Its tasks,
 * and tasks joined with no owner, share one board and run on it. Every other
 * canvas on the page (a model preview, a variant grid, a second viewport) is
 * an owner with its own board, so its draws run on its own loop with its own
 * camera and scene, and unmounting it stops nothing else.
 *
 * Tasks at one priority on one board share a single attachment: N callers pay
 * one frame slot, not N, and run in join order.
 */
import type { EngineFrameState } from "./engineLoop.draw";

export type FrameTask = (state: EngineFrameState, delta: number) => void;

/** A frame callback held by reference; the board stores these so observers see a stable task object. */
export interface FrameTaskRef {
  current(state: EngineFrameState, delta: number): void;
}

/**
 * Attaches one priority level to the driving frame source and returns the
 * detach. `run` is the group's shared callback; the source decides how it is
 * scheduled (an r3f subscriber today, an ordered engine draw after cutover).
 */
export type FrameSource = (
  priority: number,
  run: (state: EngineFrameState, delta: number) => void,
) => () => void;

/** Identifies one frame loop: `EngineFrameState.frameOwner`. */
export type FrameOwner = object;

interface PriorityGroup {
  readonly tasks: Set<FrameTaskRef>;
  detach: (() => void) | null;
}

type Board = Map<number, PriorityGroup>;

/** The primary loop's tasks and every ownerless task. */
const shared: Board = new Map();
/** One board per bound loop that is not the primary. */
const owned = new Map<FrameOwner, Board>();
const sources = new Map<FrameOwner, FrameSource>();
let primary: FrameOwner | null = null;
/** The owner that draws mounting right now belong to; see {@link withFrameOwner}. */
let ambient: FrameOwner | null = null;
/** The owner `bindFrameSource` binds: a test or harness driving the board by hand. */
const HAND_BOUND: FrameOwner = {};

/** Optional per-task timing observer (the frame-breakdown devtools hook). */
let observer: { enter(task: FrameTaskRef): void; leave(): void } | null = null;

/** Set the observer called around every board task; `null` clears it. @internal */
export function observeFrameTasks(next: { enter(task: FrameTaskRef): void; leave(): void } | null): void {
  observer = next;
}

function attach(group: PriorityGroup, priority: number, source: FrameSource | undefined): void {
  if (source === undefined) return;
  group.detach = source(priority, (state, delta) => {
    const timing = observer;
    for (const task of group.tasks) {
      if (timing === null) {
        task.current(state, delta);
      } else {
        timing.enter(task);
        try {
          task.current(state, delta);
        } finally {
          timing.leave();
        }
      }
    }
  });
}

function detachBoard(board: Board): void {
  for (const group of board.values()) {
    group.detach?.();
    group.detach = null;
  }
}

function attachBoard(board: Board, source: FrameSource | undefined): void {
  for (const [priority, group] of board) attach(group, priority, source);
}

function unbind(owner: FrameOwner): void {
  if (!sources.has(owner)) return;
  const board = owned.get(owner);
  if (board !== undefined) {
    detachBoard(board);
    owned.delete(owner);
  }
  sources.delete(owner);
  if (primary !== owner) return;
  detachBoard(shared);
  primary = null;
}

/**
 * Bind the loop `owner` names as a frame source; returns the unbind. The first loop bound while
 * there is no primary becomes the primary and takes the shared board, so tasks that joined before
 * it existed attach without re-joining. Later loops run only the tasks joined under them.
 * @internal
 */
export function bindFrameOwner(owner: FrameOwner, source: FrameSource): () => void {
  unbind(owner);
  sources.set(owner, source);
  if (primary === null) {
    primary = owner;
    attachBoard(shared, source);
  }
  return () => unbind(owner);
}

/**
 * Drive the shared board from `next` by hand (a test, a headless harness): it becomes the primary
 * whatever was bound before. `null` unbinds it.
 */
export function bindFrameSource(next: FrameSource | null): void {
  unbind(HAND_BOUND);
  if (next === null) return;
  if (primary !== null) {
    detachBoard(shared);
    primary = null;
  }
  bindFrameOwner(HAND_BOUND, next);
}

/** Whether `owner` names the primary loop: the one that runs the before/after-render tasks. @internal */
export function isPrimaryFrameOwner(owner: FrameOwner): boolean {
  return primary === owner;
}

/**
 * Run `run` with `owner` as the loop that tasks joined inside it belong to. Draw mounts and frames
 * run inside it, so a draw that joins the board from its own code lands on the loop of its own canvas.
 * @internal
 */
export function withFrameOwner<T>(owner: FrameOwner | null | undefined, run: () => T): T {
  const outer = ambient;
  ambient = owner ?? outer;
  try {
    return run();
  } finally {
    ambient = outer;
  }
}

/**
 * Run `task(state, delta)` on every rendered frame at `priority`: subscribers
 * ascending by priority, one render after all. `owner` is the loop it runs on
 * (default: the one mounting right now, else the primary). Returns the leave;
 * the group's subscription ends when its last task leaves.
 */
export function joinFrameTask(priority: number, task: FrameTask, owner?: FrameOwner | null): () => void {
  const to = owner ?? ambient;
  let board = shared;
  let source = primary === null ? undefined : sources.get(primary);
  if (to !== null && to !== primary && sources.has(to)) {
    let own = owned.get(to);
    if (own === undefined) {
      own = new Map();
      owned.set(to, own);
    }
    board = own;
    source = sources.get(to);
  }
  let group = board.get(priority);
  if (group === undefined) {
    group = { tasks: new Set(), detach: null };
    board.set(priority, group);
  }
  const joined = group;
  const ref: FrameTaskRef = { current: task };
  joined.tasks.add(ref);
  if (joined.detach === null) attach(joined, priority, source);
  return () => {
    joined.tasks.delete(ref);
    if (joined.tasks.size > 0 || board.get(priority) !== joined) return;
    joined.detach?.();
    joined.detach = null;
    board.delete(priority);
  };
}
