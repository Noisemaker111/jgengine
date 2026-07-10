import type { RadioLine } from "../../race/iceEvents";
import { PALETTE } from "../theme";

export function RadioTicker({ lines }: { lines: readonly RadioLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div
      className="absolute bottom-4 left-4 flex max-w-sm flex-col gap-1 rounded-lg border px-3 py-2 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
      style={{ borderColor: `${PALETTE.iceBlue}26`, backgroundColor: `${PALETTE.deepWater}d9` }}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: PALETTE.auroraGreen }}>
        Expedition Radio
      </span>
      {lines.map((line, index) => (
        <span
          key={line.id}
          className="text-[11px] leading-snug"
          style={{ color: `${PALETTE.snowWhite}${index === 0 ? "ee" : "80"}` }}
        >
          {line.message}
        </span>
      ))}
    </div>
  );
}
