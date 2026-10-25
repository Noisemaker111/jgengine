import type { ErrorComponentProps } from "@tanstack/react-router";

import { GameConnectionErrorScreen } from "@/runtime/components/GameConnectionErrorScreen";
import { formatChunkLoadError } from "@/runtime/chunkLoadError";
import { buildGameErrorReportInput, type GameErrorKind } from "@/runtime/gameErrorReport";

/** TanStack Router error component: replaces the default "Something went wrong" panel
 * with the game-wide error screen, including the "Copy for agent" report button. */
export function GameRouteErrorComponent({ error, info }: ErrorComponentProps) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = formatChunkLoadError(error);
  const isChunkError = message !== rawMessage;
  const kind: GameErrorKind = isChunkError ? "chunk" : "runtime";
  const stack = error instanceof Error ? error.stack ?? null : null;
  const componentStack = info?.componentStack ?? null;

  return (
    <GameConnectionErrorScreen
      report={buildGameErrorReportInput(message, { kind, stack, componentStack })}
      message={message}
    />
  );
}
