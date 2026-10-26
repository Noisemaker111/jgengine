import { devtools } from "@jgengine/core/devtools/devtools";

export function LogsPanel() {
  const entries = devtools.logs.list().slice(-60);
  const colors: Record<string, string> = {
    error: "text-red-400",
    warn: "text-amber-300",
    info: "text-sky-300",
    log: "text-neutral-300",
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded-md bg-white/[0.04] px-2 py-0.5 text-neutral-300 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/10"
        onClick={() => devtools.logs.clear()}
      >
        Clear
      </button>
      <div className="jg-devtools-scroll max-h-64 space-y-0.5 overflow-auto font-mono text-[10px]">
        {entries.length === 0 ? <div className="text-neutral-400">No logs captured yet.</div> : null}
        {entries.map((entry, index) => (
          <div key={index} className={colors[entry.level]}>
            <span className="text-neutral-500">{new Date(entry.at).toLocaleTimeString()} </span>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}
