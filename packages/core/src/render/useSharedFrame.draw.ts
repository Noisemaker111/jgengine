import { useLayoutEffect, useRef } from "react";

import { joinFrameTask, observeFrameTasks, type FrameTaskRef } from "@jgengine/core/frame/frameBoard.draw";
import type { EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

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
const observers = new WeakMap<object, { enter(task: Task): void; leave(): void }>();

/** Set the observer for shared frame members. @internal */
export function observeSharedFrames(loop: object, observer: { enter(task: Task): void; leave(): void } | null): void {
  if (observer === null) observers.delete(loop);
  else observers.set(loop, observer);
  // The board is the one live frame source now; mirror the observer onto it so
  // per-member timing keeps working while the r3f pump drives.
  observeFrameTasks(observer === null ? null : {
    enter: (task: FrameTaskRef) => observer.enter(task),
    leave: () => observer.leave(),
  });
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
        const observer = observers.get(loop);
        if (observer === undefined) each.current(state, delta, frame);
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
 * copy at one priority runs inside a single frame-board subscription, in the order they joined, and
 * leaves it while `active` is false. The board groups tasks per priority, so a world of a thousand
 * batches with a callback each pays one frame slot, not a thousand. Ordered against the other
 * subscribers at the same priority only by when the first copy joined: work that has to run before
 * or after a particular callback takes a priority of its own.
 * @internal
 */
export function useSharedFrame(
  callback: (state: EngineFrameState, delta: number) => void,
  priority = 0,
  active = true,
): void {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  useLayoutEffect(
    () => (active ? joinFrameTask(priority, (state, delta) => ref.current(state, delta)) : undefined),
    [active, priority],
  );
}
