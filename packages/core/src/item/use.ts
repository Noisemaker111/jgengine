import type { Aim } from "../scene/spatial";

export interface ItemUseInput {
  from: string;
  itemId: string;
  inventoryId?: string;
  aim?: Aim;
}

export interface ItemUseRejection {
  reason: string;
}

export interface ItemUseResult<TState> {
  state: TState;
  error?: string;
}

export interface ItemUseHandler<TState> {
  can?(state: TState, input: ItemUseInput): ItemUseRejection | null;
  apply(state: TState, input: ItemUseInput): ItemUseResult<TState>;
}

export interface ItemUse<TState> {
  register(handlers: Record<string, ItemUseHandler<TState>>): void;
  registered(): string[];
  can(state: TState, input: ItemUseInput): ItemUseRejection | null;
  use(state: TState, input: ItemUseInput): ItemUseResult<TState>;
}

export function createItemUse<TState>(
  resolveUse: (itemId: string) => string | null | undefined,
): ItemUse<TState> {
  const handlers = new Map<string, ItemUseHandler<TState>>();

  function resolveHandler(itemId: string): { handler: ItemUseHandler<TState> } | { rejection: ItemUseRejection } {
    const useName = resolveUse(itemId);
    if (!useName) return { rejection: { reason: "not-usable" } };

    const handler = handlers.get(useName);
    if (!handler) return { rejection: { reason: "unknown-handler" } };

    return { handler };
  }

  return {
    register(newHandlers) {
      for (const [name, handler] of Object.entries(newHandlers)) {
        if (handlers.has(name)) {
          throw new Error(`Item use handler "${name}" is already registered.`);
        }
        handlers.set(name, handler);
      }
    },
    registered() {
      return Array.from(handlers.keys());
    },
    can(state, input) {
      const resolved = resolveHandler(input.itemId);
      if ("rejection" in resolved) return resolved.rejection;
      return resolved.handler.can?.(state, input) ?? null;
    },
    use(state, input) {
      const resolved = resolveHandler(input.itemId);
      if ("rejection" in resolved) return { state, error: resolved.rejection.reason };

      const rejection = resolved.handler.can?.(state, input);
      if (rejection) return { state, error: rejection.reason };

      return resolved.handler.apply(state, input);
    },
  };
}
