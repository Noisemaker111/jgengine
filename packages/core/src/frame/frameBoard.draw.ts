/**
 * The frame-task board every per-frame callback joins (`joinFrameTask`, and
 * the `useFrameTask`/`useSharedFrame`/`useFrameWhile` hooks over it). One
 * board, one frame source: `createEngineLoop` binds it to the engine loop's
 * ordered draws, and a test binds its own. Callers join a priority and leave.
 *
 * Tasks at one priority share a single attachment: N callers pay one frame
 * slot, not N, and run in join order.
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

interface PriorityGroup {
  readonly tasks: Set<FrameTaskRef>;
  detach: (() => void) | null;
}

const groups = new Map<number, PriorityGroup>();
let source: FrameSource | null = null;

/** Optional per-task timing observer (the frame-breakdown devtools hook). */
let observer: { enter(task: FrameTaskRef): void; leave(): void } | null = null;

/** Set the observer called around every board task; `null` clears it. @internal */
export function observeFrameTasks(next: { enter(task: FrameTaskRef): void; leave(): void } | null): void {
  observer = next;
}

function attach(group: PriorityGroup, priority: number): void {
  if (source === null) return;
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

/**
 * Bind the board to a frame source. Groups already joined re-attach under the
 * new source, so a remounted canvas's loop takes over without callers
 * re-joining. `null` detaches everything
 * (used while no canvas drives frames, e.g. between shells).
 */
export function bindFrameSource(next: FrameSource | null): void {
  for (const group of groups.values()) {
    group.detach?.();
    group.detach = null;
  }
  source = next;
  if (next === null) return;
  for (const [priority, group] of groups) attach(group, priority);
}

/**
 * Run `task(state, delta)` on every rendered frame at `priority` — r3f's
 * `useFrame` order: subscribers ascending by priority, one render after all.
 * Returns the leave; the group's subscription ends when its last task leaves.
 */
export function joinFrameTask(priority: number, task: FrameTask): () => void {
  let group = groups.get(priority);
  if (group === undefined) {
    group = { tasks: new Set(), detach: null };
    groups.set(priority, group);
  }
  const joined = group;
  const ref: FrameTaskRef = { current: task };
  joined.tasks.add(ref);
  if (joined.detach === null) attach(joined, priority);
  return () => {
    joined.tasks.delete(ref);
    if (joined.tasks.size > 0 || groups.get(priority) !== joined) return;
    joined.detach?.();
    groups.delete(priority);
  };
}
