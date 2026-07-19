import { useAutoScroll } from "@jgengine/react/hooks";

import type { ProcessSnapshot } from "../project/client";

export function GatePanel(props: {
  busy: boolean;
  running: boolean;
  lines: string[];
  processes: ProcessSnapshot[];
  onRun: () => void;
  onStop: () => void;
}) {
  const scroller = useAutoScroll<HTMLPreElement>(props.lines);

  const running = props.running || props.processes.some((proc) => proc.running);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">Run gate</h2>
          <p className="text-[11px] text-neutral-500">bun run gate — streamed output</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={props.busy || running}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-amber-500 disabled:opacity-40"
            onClick={props.onRun}
          >
            {running ? "Running…" : "Run gate"}
          </button>
          <button
            type="button"
            disabled={!running}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 enabled:hover:bg-neutral-800 disabled:opacity-40"
            onClick={props.onStop}
          >
            Stop
          </button>
        </div>
      </div>
      <pre
        ref={scroller}
        className="h-56 overflow-auto rounded-lg border border-neutral-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-neutral-300"
      >
        {props.lines.length === 0
          ? "Gate output will stream here."
          : props.lines.join("\n")}
      </pre>
    </section>
  );
}
