import { Component, type ErrorInfo, type ReactNode } from "react";

import { GameConnectionErrorScreen } from "@/runtime/components/GameConnectionErrorScreen";
import { formatChunkLoadError } from "@/runtime/chunkLoadError";
import { buildGameErrorReportInput, type GameErrorReportInput } from "@/runtime/gameErrorReport";

interface GameRouteErrorBoundaryProps {
  children: ReactNode;
}

interface GameRouteErrorBoundaryState {
  report: GameErrorReportInput | null;
}

/** Catches lazy-route / dynamic-import failures and shows a recoverable screen. */
export class GameRouteErrorBoundary extends Component<
  GameRouteErrorBoundaryProps,
  GameRouteErrorBoundaryState
> {
  state: GameRouteErrorBoundaryState = { report: null };

  static getDerivedStateFromError(error: unknown): GameRouteErrorBoundaryState {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = formatChunkLoadError(error);
    const isChunkError = message !== rawMessage;

    return {
      report: buildGameErrorReportInput(message, {
        kind: isChunkError ? "chunk" : "runtime",
        stack: error instanceof Error ? error.stack ?? null : null,
      }),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Game route failed to load", error, info.componentStack);
    this.setState((previous) => ({
      report: previous.report
        ? { ...previous.report, componentStack: info.componentStack ?? null }
        : null,
    }));
  }

  render() {
    if (this.state.report !== null) {
      return <GameConnectionErrorScreen report={this.state.report} message={this.state.report.message} />;
    }
    return this.props.children;
  }
}