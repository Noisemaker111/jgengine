import { useStore } from "@jgengine/react/store";
import { runStore } from "../../systems/runState";

export function TelemetryToasts() {
  const run = useStore(runStore);
  const active = run.toasts.filter((toast) => toast.expiresAt > run.totalElapsed);
  return (
    <div className="flex flex-col gap-1">
      {active.slice(-3).map((toast) => (
        <div
          key={toast.id}
          className="rounded bg-[#2b2f36]/80 px-2.5 py-1 font-mono text-[11px] tracking-wide text-[#dfe6ee] shadow"
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
