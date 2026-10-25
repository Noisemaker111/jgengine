import type { Id } from "@llmville/backend/convex/_generated/dataModel";

function logMutationError(action: string, error: unknown): void {
  console.error(`[game] ${action} failed`, error);
}

interface WrapMutationOptions<TFallback> {
  fallback?: TFallback;
  onError?: (error: unknown) => void;
}

export function wrapMutation<TResult>(
  action: string,
  promise: Promise<TResult>,
): Promise<TResult | undefined>;
export function wrapMutation<TResult, TFallback>(
  action: string,
  promise: Promise<TResult>,
  options: WrapMutationOptions<TFallback>,
): Promise<TResult | TFallback>;
export function wrapMutation<TResult, TFallback>(
  action: string,
  promise: Promise<TResult>,
  options?: WrapMutationOptions<TFallback>,
): Promise<TResult | TFallback | undefined> {
  return promise.catch((error) => {
    logMutationError(action, error);
    options?.onError?.(error);
    return options?.fallback;
  });
}

interface WithEditAccessOptions<TFallback> {
  canEditGame: boolean;
  gameId: Id<"games"> | null;
  onDenied?: () => TFallback;
  onMissingGameId?: () => TFallback;
}

export function withEditAccess<TResult>(
  options: WithEditAccessOptions<undefined>,
  action: (gameId: Id<"games">) => TResult,
): TResult | undefined;
export function withEditAccess<TResult, TFallback>(
  options: WithEditAccessOptions<TFallback>,
  action: (gameId: Id<"games">) => TResult,
): TResult | TFallback | undefined;
export function withEditAccess<TResult, TFallback>(
  options: WithEditAccessOptions<TFallback>,
  action: (gameId: Id<"games">) => TResult,
): TResult | TFallback | undefined {
  if (!options.canEditGame) {
    return options.onDenied?.();
  }
  if (options.gameId === null) {
    return options.onMissingGameId?.();
  }
  return action(options.gameId);
}

