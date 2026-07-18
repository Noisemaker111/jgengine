import type { ConsoleSeverity } from "./consoleStore";

type ConsoleSink = (severity: ConsoleSeverity, source: string, message: string) => void;

let sink: ConsoleSink | null = null;

/**
 * Installs the global console sink (typically the dock console store). Returns a disposer that
 * clears the sink only if it still points at this callback.
 * @internal
 */
export function installEditorConsoleSink(next: ConsoleSink): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}

/** Forwards a real editor event to the installed console sink, if any. @internal */
export function emitEditorConsole(
  severity: ConsoleSeverity,
  source: string,
  message: string,
): void {
  sink?.(severity, source, message);
}
