import type { ConsoleSeverity } from "./consoleStore";

type ConsoleSink = (severity: ConsoleSeverity, source: string, message: string) => void;

let sink: ConsoleSink | null = null;

/** @internal */
export function installEditorConsoleSink(next: ConsoleSink): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}

/** @internal */
export function emitEditorConsole(
  severity: ConsoleSeverity,
  source: string,
  message: string,
): void {
  sink?.(severity, source, message);
}
