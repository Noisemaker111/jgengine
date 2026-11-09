/**
 * Tasks that must run immediately before or after `renderer.render` in the
 * same task — r3f's `addEffect`/`addAfterEffect` globals, minus the fiber
 * dependency. The driving loop flushes each set around its render: the r3f
 * pump registers one `addEffect`/`addAfterEffect` pair while the Canvas owns
 * frames, and `createEngineLoop` flushes the same sets inside `advance`.
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
 * Run `task` in the same task right before the next render — r3f's
 * `addEffect`. Returns the leave.
 */
export function joinBeforeRenderTask(task: () => void): () => void {
  beforeTasks.add(task);
  return () => {
    beforeTasks.delete(task);
  };
}

/**
 * Run `task` in the same task right after the next render — r3f's
 * `addAfterEffect`. Returns the leave. Used by canvas readers that need the
 * frame the renderer just drew before the drawing buffer is cleared.
 */
export function joinAfterRenderTask(task: () => void): () => void {
  afterTasks.add(task);
  return () => {
    afterTasks.delete(task);
  };
}
