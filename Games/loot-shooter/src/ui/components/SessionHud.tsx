import { useEngineState } from "@jgengine/react/engineStore";
import { sessionHud } from "../../session/raid";

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function RingWarning() {
  const { ring } = useEngineState(sessionHud);
  if (ring === null) return null;
  if (ring.outside) {
    return (
      <div className="animate-pulse rounded-md border border-rose-500/70 bg-rose-950/80 px-4 py-2 text-center shadow-lg backdrop-blur-sm">
        <div className="text-sm font-black uppercase tracking-widest text-rose-300">Outside the Zone</div>
        <div className="text-xs font-medium text-rose-200/80">Take cover — you are losing health</div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-sky-400/40 bg-slate-950/80 px-4 py-2 text-center shadow-lg backdrop-blur-sm">
      <div className="text-xs font-bold uppercase tracking-widest text-sky-200/80">
        {ring.shrinking ? "Zone Shrinking" : "Zone Closes In"}
      </div>
      <div className="font-mono text-2xl font-black tabular-nums text-sky-100">
        {ring.shrinking ? "NOW" : formatSeconds(ring.timeToShrink)}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-slate-400">radius {Math.round(ring.radius)}m</div>
    </div>
  );
}

export function ExtractionTimer() {
  const { extraction } = useEngineState(sessionHud);
  if (extraction === null) return null;
  const percent = Math.round(extraction.progress * 100);
  return (
    <div className="w-72 rounded-lg border border-emerald-400/40 bg-slate-950/85 p-4 shadow-2xl backdrop-blur-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-black uppercase tracking-widest text-emerald-200">Extracting</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-emerald-300">
          {extraction.remaining.toFixed(1)}s
        </span>
      </div>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-400">{extraction.extractId}</div>
      <div className="relative mt-2 h-3 overflow-hidden rounded-full border border-black/60 bg-black/70">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-[width] duration-100"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1 text-center text-[11px] font-semibold text-emerald-200/70">
        Hold position — {percent}%
      </div>
    </div>
  );
}

export function DownedBanner() {
  const { downed } = useEngineState(sessionHud);
  if (downed === null || downed.phase !== "downed") return null;
  const bleedPercent =
    downed.bleedoutMax <= 0 ? 0 : (downed.bleedoutRemaining / downed.bleedoutMax) * 100;
  const revivePercent =
    downed.reviveSeconds <= 0 ? 0 : (downed.reviveProgress / downed.reviveSeconds) * 100;
  const reviving = downed.reviveProgress > 0;
  return (
    <div className="w-80 rounded-lg border-2 border-rose-500/60 bg-slate-950/85 p-5 text-center shadow-2xl backdrop-blur-md">
      <div className="text-3xl font-black uppercase tracking-[0.3em] text-rose-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
        Downed
      </div>
      <div className="mt-1 text-sm font-medium text-slate-300">
        {reviving ? "An ally is reviving you…" : "Crawl to cover — hold on for a revive"}
      </div>
      <div className="mt-3 text-left text-[11px] font-bold uppercase tracking-wider text-rose-300/80">
        Bleedout {Math.ceil(downed.bleedoutRemaining)}s
      </div>
      <div className="relative mt-1 h-3 overflow-hidden rounded-full border border-black/60 bg-black/70">
        <div
          className="h-full bg-gradient-to-r from-rose-600 to-orange-400 transition-[width] duration-200"
          style={{ width: `${bleedPercent}%` }}
        />
      </div>
      {reviving ? (
        <>
          <div className="mt-2 text-left text-[11px] font-bold uppercase tracking-wider text-emerald-300/80">
            Reviving
          </div>
          <div className="relative mt-1 h-3 overflow-hidden rounded-full border border-black/60 bg-black/70">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-[width] duration-100"
              style={{ width: `${revivePercent}%` }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
