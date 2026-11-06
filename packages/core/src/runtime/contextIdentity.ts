import type { GameContext } from "./gameContext";

const aliases = new WeakMap<object, GameContext>();

/**
 * Record `view` (a wrapper of `ctx`, such as a suite proof's setup view) as the same context, so every
 * per-context cache resolves it to `ctx` instead of building a second model for the wrapper.
 * @internal the suite proof runner's setup window
 */
export function aliasContext(view: GameContext, ctx: GameContext): void {
  aliases.set(view, ctx);
}

/** The context `ctx` stands for: itself, or the context a wrapper of it was aliased to. */
export function contextOf(ctx: GameContext): GameContext {
  return aliases.get(ctx) ?? ctx;
}

/**
 * A `WeakMap` keyed by context identity that treats a wrapper of a context as the context itself
 * ({@link aliasContext}). Use it for per-context state instead of `new WeakMap<GameContext, T>()`.
 *
 * @capability context-map per-context state keyed by the context a wrapper stands for, so a wrapped context shares its model
 */
export class ContextMap<T> {
  readonly #byContext = new WeakMap<GameContext, T>();

  get(ctx: GameContext): T | undefined {
    return this.#byContext.get(contextOf(ctx));
  }

  has(ctx: GameContext): boolean {
    return this.#byContext.has(contextOf(ctx));
  }

  set(ctx: GameContext, value: T): this {
    this.#byContext.set(contextOf(ctx), value);
    return this;
  }

  delete(ctx: GameContext): boolean {
    return this.#byContext.delete(contextOf(ctx));
  }
}
