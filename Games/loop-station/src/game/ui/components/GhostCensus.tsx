import { ghostGlowTier, ghostPositionAt } from "../../run/ghosts";
import { distance3 } from "../../track/geometry";
import type { GhostRecord, GhostFrameData } from "../../run/types";

const CAP = 12;

export function GhostCensus({ ghosts, now, player }: { ghosts: readonly GhostRecord[]; now: number; player: GhostFrameData }) {
  if (ghosts.length === 0) {
    return (
      <div className="pointer-events-none rounded-md border border-[#6247aa]/40 bg-[#12101f]/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-[#f5f2fa]/55">
        No ghosts yet — clean lap one
      </div>
    );
  }
  return (
    <div className="pointer-events-none flex max-w-md flex-wrap items-center justify-center gap-1.5 rounded-md border border-[#6247aa]/40 bg-[#12101f]/70 px-3 py-1.5">
      {ghosts.map((ghost) => {
        const pos = ghostPositionAt(ghost, now);
        const tier = ghost.faded || pos === null ? 0 : ghostGlowTier(distance3(player, pos));
        return (
          <span
            key={ghost.id}
            className="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[10px] font-bold tabular-nums"
            style={{
              background: ghost.faded ? "rgba(98,71,170,0.18)" : `${ghost.color}33`,
              color: ghost.faded ? "#f5f2fa88" : ghost.color,
              boxShadow: !ghost.faded && tier > 0 ? `0 0 ${4 + tier * 6}px ${ghost.color}` : undefined,
              border: `1px solid ${ghost.faded ? "#6247aa55" : ghost.color}`,
            }}
            title={ghost.faded ? `Lap ${ghost.lapIndex} — faded shimmer` : `Lap ${ghost.lapIndex} ghost`}
          >
            {ghost.lapIndex}
          </span>
        );
      })}
      <span className="ml-1 text-[9px] uppercase tracking-widest text-[#f5f2fa]/45">Cap {CAP}</span>
    </div>
  );
}
