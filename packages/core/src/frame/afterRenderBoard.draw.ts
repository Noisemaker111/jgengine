/**
 * Tasks that run at the two ends of a frame, in the same task as its render:
 * the before set first, ahead of every draw's `frame`, and the after set once
 * the render is done. `createEngineLoop` flushes both inside `advance`.
 * Callbacks may join or leave while flushing.
 */
const beforeTasks = new Set<() => void>();
const afterTasks = new Set<() => void>();

/** Run every task joined with {@link joinBeforeRenderTask}, in join order. */
export function flushBeforeRenderTasks(): void {
  for (const task of beforeTasks) task();
}

/** Run every task joined with {@link joinAfterRenderTask}, in join order. */
export function flushAfterRenderTasks(): void {
  for (const task of afterTasks) task();
}

/**
 * Run `task` in the same task right before the next render. Returns the leave.
 */
export function joinBeforeRenderTask(task: () => void): () => void {
  beforeTasks.add(task);
  return () => {
    beforeTasks.delete(task);
  };
}

/**
 * Run `task` in the same task right after the next render. Returns the leave.
 * Used by canvas readers that need the
 * frame the renderer just drew before the drawing buffer is cleared.
 */
export function joinAfterRenderTask(task: () => void): () => void {
  afterTasks.add(task);
  return () => {
    afterTasks.delete(task);
  };
}
