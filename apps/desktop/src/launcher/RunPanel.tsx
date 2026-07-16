import type { GameMount, ProcessSnapshot } from "../project/client";

const MOUNTS: { id: GameMount; label: string; hint: string }[] = [
  {
    id: "standalone",
    label: "Standalone",
    hint: "bun run games:<id> — game Vite harness",
  },
  {
    id: "runner",
    label: "Runner",
    hint: "bun run dev:runner — monorepo /play host",
  },
  {
    id: "website",
    label: "Website",
    hint: "bun run dev — site with embedded /play",
  },
];

export function RunPanel(props: {
  gameId: string;
  busy: string | null;
  processKeys: string[];
  processes: ProcessSnapshot[];
  onStart: (mount: GameMount) => void;
  onStop: (key: string) => void;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">Run controls</h2>
        <span className="text-[11px] text-neutral-500">start/stop over existing scripts</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {MOUNTS.map((mount) => {
          const key = `game:${props.gameId}:${mount.id}`;
          const running = props.processes.some((proc) => proc.key === key && proc.running);
          return (
            <div
              key={mount.id}
              className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3"
            >
              <div className="text-xs font-medium text-neutral-200">{mount.label}</div>
              <div className="min-h-[2.5rem] text-[11px] leading-snug text-neutral-500">
                {mount.hint}
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  disabled={props.busy !== null || running}
                  className="rounded-md bg-sky-700 px-2.5 py-1 text-[11px] font-medium text-white enabled:hover:bg-sky-600 disabled:opacity-40"
                  onClick={() => props.onStart(mount.id)}
                >
                  Start
                </button>
                <button
                  type="button"
                  disabled={props.busy !== null || !running}
                  className="rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-200 enabled:hover:bg-neutral-800 disabled:opacity-40"
                  onClick={() => props.onStop(key)}
                >
                  Stop
                </button>
              </div>
              {running && (
                <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                  running
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
