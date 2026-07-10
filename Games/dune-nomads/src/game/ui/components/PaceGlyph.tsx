import { HudLabel } from "@/components/ui/hud-label";

import { gaitGlyphFor, type GaitGlyph } from "../../caravan/pace";

const GAIT_LABEL: Record<GaitGlyph, string> = {
  trudging: "Trudging",
  steady: "Steady Gait",
  brisk: "Brisk Stride",
  flying: "Flying Crest",
};

const GAIT_CHEVRONS: Record<GaitGlyph, number> = {
  trudging: 1,
  steady: 2,
  brisk: 3,
  flying: 4,
};

export function PaceGlyph({ multiplier, resting }: { multiplier: number; resting: boolean }) {
  const gait = gaitGlyphFor(multiplier);
  const filled = GAIT_CHEVRONS[gait];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            aria-hidden
            style={{
              width: 0,
              height: 0,
              borderTop: "7px solid transparent",
              borderBottom: "7px solid transparent",
              borderLeft: `11px solid ${index < filled && !resting ? "var(--jg-accent)" : "var(--jg-edge)"}`,
              opacity: index < filled && !resting ? 1 : 0.4,
            }}
          />
        ))}
      </div>
      <HudLabel>{resting ? "Resting" : GAIT_LABEL[gait]}</HudLabel>
      {!resting && (
        <span className="font-mono text-[11px]" style={{ color: "var(--jg-text)" }}>
          ×{multiplier.toFixed(2)}
        </span>
      )}
    </div>
  );
}
