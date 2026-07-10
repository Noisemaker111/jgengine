import type { ReactNode } from "react";
import { SkillCheckBar } from "@jgengine/react/components";
import { useGameStore } from "@jgengine/react/hooks";
import { treasureById, sideLootById } from "../../items/treasures";
import type { HeistState } from "../../state/heistState";

export function GrabGauge(): ReactNode {
  const grab = useGameStore((ctx) => {
    const heist = ctx.game.store.get("heist") as HeistState | undefined;
    return heist?.activeGrab ?? null;
  });
  if (grab === null) return null;

  if (grab.kind === "treasure") {
    const treasure = treasureById(grab.targetId);
    if (treasure === undefined) return null;
    return (
      <div className="pointer-events-none flex flex-col items-center gap-1 rounded-lg border border-[#c9a227] bg-[#0b0f1c]/90 px-4 py-3 shadow-xl">
        <p className="font-serif text-xs uppercase tracking-widest text-[#c9a227]">Lifting — {treasure.name}</p>
        <SkillCheckBar
          config={treasure.skillCheck}
          startedAt={grab.startedAt}
          className="relative h-3 w-64 overflow-hidden rounded-full border border-[#c9a227]/50 bg-[#1d2b4a]"
          trackClassName="absolute inset-0"
          zoneClassName="absolute top-0 h-full bg-[#c9a227]/50"
          markerClassName="absolute top-0 h-full w-1 -translate-x-1/2 bg-[#f2e3c2]"
        />
        <p className="text-[10px] uppercase tracking-wide text-[#e5d9c3]/70">Release E on the mark</p>
      </div>
    );
  }

  const loot = sideLootById(grab.targetId);
  if (loot === undefined) return null;
  return (
    <div className="pointer-events-none flex flex-col items-center gap-1 rounded-lg border border-[#c9a227]/70 bg-[#0b0f1c]/90 px-4 py-3 shadow-xl">
      <p className="font-serif text-xs uppercase tracking-widest text-[#c9a227]">Pocketing — {loot.name}</p>
      <div className="h-2.5 w-48 overflow-hidden rounded-full border border-[#c9a227]/50 bg-[#1d2b4a]">
        <HoldFill startedAt={grab.startedAt} holdSeconds={loot.holdSeconds} />
      </div>
    </div>
  );
}

function HoldFill({ startedAt, holdSeconds }: { startedAt: number; holdSeconds: number }): ReactNode {
  const fraction = useGameStore((ctx) => Math.max(0, Math.min(1, (ctx.time.now() - startedAt) / holdSeconds)));
  return <div className="h-full bg-[#c9a227]" style={{ width: `${fraction * 100}%` }} />;
}
