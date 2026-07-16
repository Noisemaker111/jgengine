import { Component, useState, type ErrorInfo, type ReactNode } from "react";

import { VERSION } from "@jgengine/core/meta/changelog";

export interface RuntimeDiagnostic {
  id: number;
  phase: string;
  message: string;
  stack?: string;
  componentStack?: string;
  capturedAt: string;
}

function errorToDiagnostic(error: unknown, phase: string, componentStack?: string): Omit<RuntimeDiagnostic, "id"> {
  const capturedAt = new Date().toISOString();
  if (error instanceof Error) {
    return { phase, message: error.message, stack: error.stack, componentStack, capturedAt };
  }
  return { phase, message: typeof error === "string" ? error : JSON.stringify(error), componentStack, capturedAt };
}

export function logRuntimeError(error: unknown, phase: string, componentStack?: string): Omit<RuntimeDiagnostic, "id"> {
  const diagnostic = errorToDiagnostic(error, phase, componentStack);
  console.error(`[jgengine:${phase}] ${diagnostic.message}`, error);
  return diagnostic;
}

export class GameUiErrorBoundary extends Component<
  { children: ReactNode; onRuntimeError: (error: unknown, phase: string, componentStack?: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onRuntimeError(error, "ui-render", info.componentStack ?? undefined);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function expandedReactError(message: string): string | null {
  return /Minified React error #185\b/.test(message)
    ? "Maximum update depth exceeded. A component is repeatedly updating state during render or after every update."
    : null;
}

function diagnosticReport(diagnostic: RuntimeDiagnostic, gameName: string): string {
  const explanation = expandedReactError(diagnostic.message);
  return [
    "JGengine runtime error",
    `Game: ${gameName}`,
    `Engine: ${VERSION}`,
    `Phase: ${diagnostic.phase}`,
    `Time: ${diagnostic.capturedAt}`,
    `Page: ${window.location.origin}${window.location.pathname}`,
    `Browser: ${navigator.userAgent}`,
    explanation === null ? null : `Explanation: ${explanation}`,
    "",
    `Message: ${diagnostic.message}`,
    diagnostic.stack === undefined ? null : `JavaScript stack:\n${diagnostic.stack}`,
    diagnostic.componentStack === undefined ? null : `React component stack:\n${diagnostic.componentStack}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function DiagnosticOverlay({ diagnostics, gameName }: { diagnostics: RuntimeDiagnostic[]; gameName: string }) {
  const [copied, setCopied] = useState(false);
  if (diagnostics.length === 0) return null;
  const latest = diagnostics[diagnostics.length - 1]!;
  const explanation = expandedReactError(latest.message);
  const report = diagnosticReport(latest, gameName);
  const issueBody = report.length > 8000 ? `${report.slice(0, 8000)}\n\n[Report truncated; use Copy error for the full report.]` : report;
  const issueUrl = `https://github.com/Noisemaker111/jgengine/issues/new?title=${encodeURIComponent(`[BUG] ${latest.phase}: ${latest.message.slice(0, 100)}`)}&body=${encodeURIComponent(issueBody)}`;
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-50 max-w-lg rounded border border-red-400/60 bg-red-950/95 p-3 text-xs text-red-50 shadow-2xl">
      <div className="mb-1 font-semibold uppercase tracking-wide text-red-200">JG engine error</div>
      <div className="font-mono text-[11px] text-red-100">
        [{latest.phase}] {latest.message}
      </div>
      {explanation !== null ? <div className="mt-2 text-red-100">{explanation}</div> : null}
      {latest.stack !== undefined ? (
        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-[10px] text-red-200/80">
          {latest.stack}
        </pre>
      ) : null}
      {latest.componentStack !== undefined ? (
        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-[10px] text-red-200/80">
          {latest.componentStack}
        </pre>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          className="rounded border border-red-300/50 bg-red-900 px-2 py-1 font-semibold hover:bg-red-800"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(report).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : "Copy error"}
        </button>
        <a
          className="rounded border border-red-300/50 bg-red-900 px-2 py-1 font-semibold hover:bg-red-800"
          href={issueUrl}
          rel="noreferrer"
          target="_blank"
        >
          File issue
        </a>
      </div>
    </div>
  );
}
