import { useGameContext } from "@jgengine/react/provider";

import { sectors } from "../../course/sectors";
import { trainLineList } from "../../course/trainLines";
import { sectorWorldStart } from "../../systems/constants";
import { POLARITY_COLOR } from "../../systems/palette";
import { secondsUntilHeadReaches, trainWindowAt } from "../../systems/trains";
import { useRunState } from "../useRunState";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function ProgressStrip() {
  const ctx = useGameContext();
  const run = useRunState();
  const now = ctx.time.now();
  const sector = sectors[run.sectorIndex]!;
  const sectorStart = sectorWorldStart(run.sectorIndex);
  const progress = clamp01(run.z / sector.length);

  const trains = trainLineList.map((line) => {
    const window = trainWindowAt(line, now);
    const midZ = (window.headZ + window.tailZ) / 2;
    const frac = (midZ - sectorStart) / sector.length;
    const onStrip = frac >= -0.02 && frac <= 1.02;
    const eta = secondsUntilHeadReaches(line, now, sectorStart + run.z + 55);
    const inbound = eta !== null && eta <= 8 && !onStrip;
    return { line, onStrip, frac: clamp01(frac), inbound, eta };
  });

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-1">
      <div className="flex w-full items-center justify-between text-[10px] font-semibold tracking-widest text-[#dfe6ee]/70">
        <span>{sector.label}</span>
        <span className="tabular-nums">
          {String(Math.floor(run.totalElapsed / 60)).padStart(2, "0")}:
          {String(Math.floor(run.totalElapsed % 60)).padStart(2, "0")}
        </span>
      </div>
      <div className="relative h-4 w-full rounded-full border border-[#dfe6ee]/25 bg-[#20242a]/85 shadow-inner">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${progress * 100}%`, backgroundColor: sector.tint }}
        />
        {sector.checkpoints.map((checkpoint) => (
          <div
            key={checkpoint.id}
            className="absolute top-0 h-full w-[2px] bg-[#dfe6ee]/70"
            style={{ left: `${clamp01(checkpoint.z / sector.length) * 100}%` }}
          />
        ))}
        {trains
          .filter((t) => t.onStrip)
          .map((t) => (
            <div
              key={t.line.id}
              className="absolute -top-1 h-6 w-2 -translate-x-1/2 rounded-sm shadow"
              style={{ left: `${t.frac * 100}%`, backgroundColor: POLARITY_COLOR[t.line.roofPolarity] }}
              title={t.line.displayName}
            />
          ))}
        <div
          className="absolute -top-1.5 h-7 w-1.5 -translate-x-1/2 rounded-full bg-[#dfe6ee] shadow"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      <div className="flex h-4 gap-3">
        {trains
          .filter((t) => t.inbound)
          .map((t) => (
            <div
              key={t.line.id}
              className="flex items-center gap-1 text-[10px] font-bold tracking-wide"
              style={{ color: POLARITY_COLOR[t.line.roofPolarity] }}
            >
              <span className="animate-pulse">▲▲</span>
              {t.line.displayName} INBOUND {Math.max(0, t.eta ?? 0).toFixed(1)}s
            </div>
          ))}
      </div>
    </div>
  );
}
