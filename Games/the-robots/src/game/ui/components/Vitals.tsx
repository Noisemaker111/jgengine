import { ExperienceBar, HealthBar, ShieldBar, barTokens } from "@jgengine/react/bars";
import { useEntityStat, usePlayer } from "@jgengine/react/hooks";
import type { CSSProperties } from "react";

import { FERRALON } from "../../palette";

// The Ferralon skin, expressed as shared vitals tokens (#1033/#1034) instead of a hand-rolled `Bar`:
// the skewed parallelogram shape comes from the atomic bars' `shape="skew"`, the palette from tokens.
const VITALS_TOKENS: CSSProperties = {
  ...barTokens({
    health: FERRALON.hudRed,
    healthLow: "#7a1810",
    shield: FERRALON.hudShield,
    xp: FERRALON.hudXp,
    track: "rgba(0,0,0,0.7)",
    frame: "rgba(0,0,0,0.8)",
    frameWidth: "2px",
    height: "20px",
    bevel: "0 2px 6px rgba(0,0,0,0.7)",
    text: "#ffffff",
  }),
};

const XP_THIN = { "--jg-bar-height": "7px", "--jg-bar-frame-width": "1px" } as CSSProperties;

export function VitalsPlate() {
  const { userId } = usePlayer();
  const level = useEntityStat(userId, "level");
  const skillPoints = useEntityStat(userId, "skillPoints");

  return (
    <div className="min-w-[17rem]">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="flex h-9 w-9 skew-x-[-6deg] items-center justify-center border-2 border-black/80 text-lg font-black text-black"
          style={{ background: FERRALON.hudAmber }}
        >
          {level?.current ?? 1}
        </span>
        <span className="text-xs font-black uppercase tracking-[0.25em] text-amber-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          Reclaimer
        </span>
        {(skillPoints?.current ?? 0) > 0 ? (
          <span className="animate-pulse text-[10px] font-bold uppercase tracking-wider text-lime-300">
            [K] +{Math.round(skillPoints?.current ?? 0)} skill pts
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1" style={VITALS_TOKENS}>
        <ShieldBar entityId={userId} shape="skew" width="100%" />
        <HealthBar entityId={userId} shape="skew" width="100%" />
        <ExperienceBar entityId={userId} shape="skew" showValue={false} width="100%" style={XP_THIN} />
      </div>
    </div>
  );
}
