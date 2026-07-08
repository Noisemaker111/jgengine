import { useEntityStat, useFeed, usePlayer } from "@jgengine/react/hooks";

import { MAX_HEALTH, STATUS_FEED, type LevelResult } from "../tuning";

function Hearts({ userId }: { userId: string }) {
  const health = useEntityStat(userId, "health");
  const current = health === null ? MAX_HEALTH : Math.round(health.current);
  const max = health === null ? MAX_HEALTH : Math.round(health.max);
  return (
    <div className="flex items-center gap-1" aria-label="health">
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`text-lg leading-none ${index < current ? "text-rose-400" : "text-white/20"}`}
        >
          {index < current ? "♥" : "♡"}
        </span>
      ))}
    </div>
  );
}

function Score({ userId }: { userId: string }) {
  const score = useEntityStat(userId, "score");
  const stomps = score === null ? 0 : Math.round(score.current);
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-widest text-amber-300/80">Stomps</span>
      <span className="tabular-nums text-lg font-semibold text-amber-200">{stomps}</span>
    </div>
  );
}

function useLevelResult(): LevelResult | null {
  const entries = useFeed({ action: STATUS_FEED, limit: 12 });
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const result = (entries[index]?.data as { result?: string } | undefined)?.result;
    if (result === "won" || result === "lost") return result;
  }
  return null;
}

function Banner() {
  const result = useLevelResult();
  if (result === null) return null;
  const won = result === "won";
  return (
    <div
      className={`rounded-xl border px-8 py-5 text-center shadow-2xl backdrop-blur ${
        won ? "border-emerald-400/60 bg-emerald-950/70" : "border-rose-500/60 bg-rose-950/70"
      }`}
    >
      <p className={`text-2xl font-black tracking-tight ${won ? "text-emerald-300" : "text-rose-300"}`}>
        {won ? "Flag Reached!" : "Game Over"}
      </p>
      <p className="mt-1 text-sm text-white/70">
        {won ? "You hopped across the level." : "A stomper got you — refresh to retry."}
      </p>
    </div>
  );
}

export function GameUI() {
  const { userId } = usePlayer();
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4 rounded-lg border border-white/15 bg-black/55 px-3 py-2 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">Platform Hopper</p>
        <p className="mt-0.5 text-sm text-white/85">Run right, stomp the stompers, reach the flag.</p>
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2 rounded-lg border border-white/15 bg-black/55 px-3 py-2 shadow-lg">
        <Hearts userId={userId} />
        <Score userId={userId} />
      </div>
      <div className="absolute inset-x-0 top-1/3 flex justify-center">
        <Banner />
      </div>
    </div>
  );
}
