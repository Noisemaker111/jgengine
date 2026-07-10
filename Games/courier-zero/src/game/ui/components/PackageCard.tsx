import { actionLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../../keybinds";
import { jobById } from "../../delivery/catalog";
import { villageById } from "../../world/villages";
import { deadlineRemaining } from "../../run/runState";
import { useNearActivePrompt, useRunState } from "../useRunView";

export function PackageCard() {
  const run = useRunState();
  const nearPrompt = useNearActivePrompt();
  if (run.status !== "playing") return null;

  const interactKey = actionLabel(keybinds, "interact");
  const promptRing = nearPrompt ? "ring-2 ring-[#e76f51]" : "";

  if (run.carried !== null) {
    const job = jobById(run.carried.jobId);
    const destination = villageById(job.destinationId);
    const remaining = deadlineRemaining(run) ?? 0;
    const urgent = remaining < job.deadlineSeconds * 0.3;
    return (
      <div
        className={`pointer-events-none flex w-60 flex-col gap-2 rounded-xl border border-[#e76f51]/60 bg-[#26413c]/90 px-4 py-3 shadow-lg backdrop-blur-sm ${promptRing}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e76f51]">Carrying Parcel</span>
          <kbd className="rounded border border-[#e8d5a3]/40 bg-[#0f1f1c] px-1.5 py-0.5 text-[10px] font-bold text-[#e8d5a3]">
            {interactKey}
          </kbd>
        </div>
        <div className="text-lg font-bold text-[#e8d5a3]">{destination.name}</div>
        <div className={`font-mono text-sm ${urgent ? "text-[#e76f51]" : "text-[#e8d5a3]/80"}`}>
          {remaining.toFixed(0)}s to deliver
        </div>
      </div>
    );
  }

  const nextJobId = run.queue[0];
  if (nextJobId === undefined) {
    return (
      <div className="pointer-events-none flex w-60 flex-col gap-1 rounded-xl border border-[#e8d5a3]/30 bg-[#26413c]/90 px-4 py-3 shadow-lg backdrop-blur-sm">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8d5a3]/70">Dispatch</span>
        <span className="text-sm text-[#e8d5a3]/80">No parcels left on the board.</span>
      </div>
    );
  }

  const job = jobById(nextJobId);
  const origin = villageById(job.originId);
  return (
    <div
      className={`pointer-events-none flex w-60 flex-col gap-2 rounded-xl border border-[#2a9d8f]/50 bg-[#26413c]/90 px-4 py-3 shadow-lg backdrop-blur-sm ${promptRing}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8d5a3]/70">Next Parcel</span>
        <kbd className="rounded border border-[#e8d5a3]/40 bg-[#0f1f1c] px-1.5 py-0.5 text-[10px] font-bold text-[#e8d5a3]">
          {interactKey}
        </kbd>
      </div>
      <div className="text-lg font-bold text-[#e8d5a3]">Pick up at {origin.name}</div>
      <div className="text-sm text-[#e8d5a3]/70">Bound for {villageById(job.destinationId).name}</div>
    </div>
  );
}
