import { ErrorReportActions, errorReportContext } from "@jgengine/shell/diagnostics/RuntimeDiagnostics";

/** Small pieces every runner app root shares: error formatting and the two panels. */

export function formatLoadError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

export function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  const report = `${title}\n${errorReportContext()}\n\n${detail}`;
  return (
    <div className="flex h-full select-text flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center">
      <div className="text-sm font-semibold text-red-400">{title}</div>
      <pre className="max-h-[50vh] max-w-3xl overflow-auto whitespace-pre-wrap break-words rounded border border-red-900/60 bg-black/60 p-3 text-left font-mono text-xs text-red-200">
        {detail}
      </pre>
      <ErrorReportActions report={report} issueTitle={title} />
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">{label}</div>
  );
}
