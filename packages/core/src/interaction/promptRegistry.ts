import {
  resolveActivePrompt,
  type PositionedPrompt,
  type PromptPoint,
} from "./proximityPrompt";

/**
 * A partial edit applied to an already-registered {@link PositionedPrompt} by
 * {@link PromptRegistry.update}. Any subset of the mutable fields — everything
 * but the stable `id` — may be supplied; omitted fields keep their prior value.
 */
export type PositionedPromptPatch = Partial<Omit<PositionedPrompt, "id">>;

/**
 * The serializable shape {@link PromptRegistry.snapshot} returns and
 * {@link PromptRegistry.restore} consumes: the full set of positioned prompts
 * (in registration order) plus the id of the prompt that was active when the
 * snapshot was taken. Prompt display/command payloads are free strings and ids —
 * keep them serializable and this round-trips through a save cleanly.
 */
export interface PromptRegistrySnapshot {
  /** Every registered prompt, in registration order (tie-break order for resolve). */
  prompts: readonly PositionedPrompt[];
  /** Id of the active prompt at snapshot time, or `null` if none was active. */
  activeId: string | null;
}

/**
 * A live, observable set of interaction prompts that OWNS the registered
 * {@link PositionedPrompt}s and tracks which one is active for a player. It is a
 * thin stateful layer over {@link resolveActivePrompt}: registration/order lives
 * here, the nearest-within-radius / higher-priority selection stays in the pure
 * resolver. {@link resolve} is the per-frame hot path — call it as the player
 * moves; subscribers fire only when the active prompt actually CHANGES.
 */
export interface PromptRegistry {
  /**
   * Add (or replace, by id) a positioned prompt. Replacing an existing id keeps
   * its registration slot so tie-break order is stable. Does not re-resolve on
   * its own — the next {@link resolve} picks up the change.
   */
  register(prompt: PositionedPrompt): void;
  /**
   * Patch a registered prompt in place. No-op if `id` is unknown. Only the fields
   * present in `patch` change; the rest are preserved.
   */
  update(id: string, patch: PositionedPromptPatch): void;
  /** Remove the prompt with this id, if present. Returns whether one was removed. */
  unregister(id: string): boolean;
  /** Remove every prompt and clear the active selection. */
  clear(): void;
  /** All registered prompts in registration order (do not mutate the returned array). */
  all(): readonly PositionedPrompt[];
  /**
   * Resolve the active prompt for a player at `playerPosition` by delegating to
   * {@link resolveActivePrompt}, cache its id, and notify subscribers only when
   * the active prompt changed since the last call — so a HUD bound to this
   * registry re-renders on transitions, not every frame. Returns the active
   * prompt or `null`.
   */
  resolve(playerPosition: PromptPoint): PositionedPrompt | null;
  /** The prompt selected by the most recent {@link resolve}, or `null`. */
  active(): PositionedPrompt | null;
  /** Observe active-prompt changes (resolve transitions, clear, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): PromptRegistrySnapshot;
  /** Restore prompts + active id from a {@link PromptRegistrySnapshot}. */
  restore(snapshot: PromptRegistrySnapshot): void;
}

/** Structural copy of a positioned prompt so external mutation can't corrupt registry state. */
function clonePrompt(prompt: PositionedPrompt): PositionedPrompt {
  const copy: PositionedPrompt = {
    id: prompt.id,
    position: { x: prompt.position.x, z: prompt.position.z },
    prompt: {
      radius: prompt.prompt.radius,
      display: { ...prompt.prompt.display },
      invoke: prompt.prompt.invoke === null ? null : { ...prompt.prompt.invoke },
    },
  };
  if (prompt.priority !== undefined) copy.priority = prompt.priority;
  return copy;
}

/**
 * Create a live, observable interaction-prompt registry over the pure
 * {@link resolveActivePrompt} resolver. Register positioned "press E" prompts,
 * `resolve(playerPosition)` each frame as the hero moves, and read `active()` —
 * the nearest strictly-in-range prompt (higher `priority` beats closer). The set
 * is owned here (register/update/unregister/clear/all); selection stays pure.
 * Subscribers are notified only when the active prompt *changes*, so a HUD does
 * not thrash per frame, and `snapshot`/`restore` round-trip the prompts plus the
 * active id through a save (display payloads are free strings/ids the game owns —
 * the registry never branches on their meaning). Allocation-aware: `all()` and
 * `resolve()` reuse a cached array instead of rebuilding per call.
 *
 * @capability interaction-prompt observable nearest-interactable prompt registry over the proximity-prompt resolver — register/resolve/active with priority+range and change-notified snapshot/restore
 */
export function createPromptRegistry(): PromptRegistry {
  // Insertion-ordered store; Map preserves registration order for resolve tie-breaks.
  const prompts = new Map<string, PositionedPrompt>();
  const listeners = new Set<() => void>();

  // Cached view of prompts.values(), rebuilt lazily only after a mutation, so the
  // per-frame resolve() does not allocate a fresh array each call.
  let listCache: PositionedPrompt[] | null = null;
  let activeId: string | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function invalidate(): void {
    listCache = null;
  }

  function list(): PositionedPrompt[] {
    if (listCache === null) listCache = [...prompts.values()];
    return listCache;
  }

  return {
    register(prompt) {
      prompts.set(prompt.id, clonePrompt(prompt));
      invalidate();
    },
    update(id, patch) {
      const existing = prompts.get(id);
      if (existing === undefined) return;
      const merged = clonePrompt(existing);
      if (patch.position !== undefined) merged.position = { x: patch.position.x, z: patch.position.z };
      if (patch.priority !== undefined) merged.priority = patch.priority;
      if (patch.prompt !== undefined) {
        merged.prompt = {
          radius: patch.prompt.radius,
          display: { ...patch.prompt.display },
          invoke: patch.prompt.invoke === null ? null : { ...patch.prompt.invoke },
        };
      }
      prompts.set(id, merged);
      invalidate();
    },
    unregister(id) {
      const removed = prompts.delete(id);
      if (removed) {
        invalidate();
        if (activeId === id) {
          activeId = null;
          notify();
        }
      }
      return removed;
    },
    clear() {
      if (prompts.size === 0 && activeId === null) return;
      prompts.clear();
      invalidate();
      if (activeId !== null) {
        activeId = null;
        notify();
      }
    },
    all() {
      return list();
    },
    resolve(playerPosition) {
      const next = resolveActivePrompt(playerPosition, list());
      const nextId = next === null ? null : next.id;
      if (nextId !== activeId) {
        activeId = nextId;
        notify();
      }
      return next;
    },
    active() {
      return activeId === null ? null : prompts.get(activeId) ?? null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        prompts: [...prompts.values()].map(clonePrompt),
        activeId,
      };
    },
    restore(snapshot) {
      prompts.clear();
      for (const prompt of snapshot.prompts) prompts.set(prompt.id, clonePrompt(prompt));
      invalidate();
      activeId = snapshot.activeId !== null && prompts.has(snapshot.activeId) ? snapshot.activeId : null;
      notify();
    },
  };
}
