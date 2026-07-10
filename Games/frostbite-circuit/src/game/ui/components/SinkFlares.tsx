import { PALETTE } from "../theme";

export function SinkFlares({ sinkCount, maxSinks }: { sinkCount: number; maxSinks: number }) {
  return (
    <div
      className="absolute left-4 top-[7.5rem] flex items-center gap-1.5 rounded-lg border px-3 py-2 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
      style={{ borderColor: `${PALETTE.flareRed}40`, backgroundColor: `${PALETTE.deepWater}d9` }}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.25em]" style={{ color: `${PALETTE.snowWhite}73` }}>
        Sinks
      </span>
      <div className="flex gap-1">
        {Array.from({ length: maxSinks }, (_, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-sm"
            style={{
              backgroundColor: i < sinkCount ? PALETTE.flareRed : `${PALETTE.snowWhite}26`,
              boxShadow: i < sinkCount ? `0 0 8px ${PALETTE.flareRed}` : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
