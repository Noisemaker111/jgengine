/** @jsxImportSource @jgengine/core/ui/jsx */
import { Component, type ErrorInfo, type ReactNode } from "@jgengine/core/ui/jsx";

import { GameConnectionErrorScreen } from "./GameConnectionErrorScreen";
import { LlmRoot } from "../../ui/kit";
import { formatChunkLoadError } from "../chunkLoadError";
import { buildGameErrorReportInput, type GameErrorReportInput } from "../gameErrorReport";

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
  override state: GameRouteErrorBoundaryState = { report: null };

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

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Game route failed to load", error, info.componentStack);
    this.setState((previous) => ({
      report: previous.report
        ? { ...previous.report, componentStack: info.componentStack ?? null }
        : null,
    }));
  }

  override render() {
    if (this.state.report !== null) {
      // The failed subtree took its native surface with it, so the error screen brings its own.
      return <LlmRoot><GameConnectionErrorScreen report={this.state.report} message={this.state.report.message} /></LlmRoot>;
    }
    return this.props.children;
  }
}