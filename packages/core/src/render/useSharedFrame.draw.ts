import { useStore, type RenderCallback } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";

/** A frame callback held by reference, so a re-render can swap it in place. A method, so r3f's callback (which wants its own state) fits. */
interface Task {
  current(state: unknown, delta: number, frame?: unknown): void;
}

/** Subscribe one callback to a frame loop at a priority; returns the unsubscribe. */
type Subscribe = (task: Task, priority: number) => () => void;

interface FrameGroup {
  readonly tasks: Set<Task>;
  readonly unsubscribe: () => void;
}

const groups = new WeakMap<object, Map<number, FrameGroup>>();

/** Optional deep frame diagnostics; absent during normal execution. @internal */
export let sharedFrameObserver: { enter(task: Task): void; leave(): void } | null = null;

/** Set the observer for shared frame members. @internal */
export function observeSharedFrames(observer: typeof sharedFrameObserver): void {
  sharedFrameObserver = observer;
}

/** Add `task` to the shared callback for `priority` of the loop `loop` names, subscribing that callback on first use; returns the leave. @internal */
export function joinFrameGroup(loop: object, subscribe: Subscribe, priority: number, task: Task): () => void {
  let byPriority = groups.get(loop);
  if (byPriority === undefined) {
    byPriority = new Map();
    groups.set(loop, byPriority);
  }
  let group = byPriority.get(priority);
  if (group === undefined) {
    const tasks = new Set<Task>();
    const sharedFrameTasks = (state: unknown, delta: number, frame?: unknown): void => {
      for (const each of tasks) {
        const observer = sharedFrameObserver;
        if (observer === null) each.current(state, delta, frame);
        else {
          observer.enter(each);
          try { each.current(state, delta, frame); } finally { observer.leave(); }
        }
      }
    };
    group = { tasks, unsubscribe: subscribe({ current: sharedFrameTasks }, priority) };
    byPriority.set(priority, group);
  }
  const joined = group;
  const owner = byPriority;
  joined.tasks.add(task);
  return () => {
    joined.tasks.delete(task);
    if (joined.tasks.size > 0 || owner.get(priority) !== joined) return;
    joined.unsubscribe();
    owner.delete(priority);
  };
}

/**
 * `useFrame` for per-instance work that many mounted copies share, such as one per prop batch: every
 * copy at one priority runs inside a single r3f subscriber, in the order they joined, and leaves it
 * while `active` is false. r3f calls and re-sorts each subscriber of its own, so a world of a thousand
 * batches with a callback each paid for the count every frame, and for every mount. Ordered against
 * the other subscribers at the same priority only by when the first copy joined: work that has to run
 * before or after a particular callback takes a priority of its own, or uses `useFrameWhile`.
 * @internal
 */
export function useSharedFrame(callback: RenderCallback, priority = 0, active = true): void {
  const store = useStore();
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  useLayoutEffect(() => (active ? joinFrameGroup(store, (task, at) => store.getState().internal.subscribe(task, at, store), priority, ref) : undefined), [active, priority, store]);
}
