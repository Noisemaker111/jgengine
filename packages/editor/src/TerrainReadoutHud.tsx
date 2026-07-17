import type { TerrainReadoutStore } from "./terrainReadoutStore";
import { useStoreSelector } from "./useStoreSelector";

function fmt(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function signed(value: number): string {
  const text = fmt(value);
  return value > 0 ? `+${text}` : text;
}

/**
 * The measurable terrain-readability legend: cursor elevation and delta from the `y = 0` reference,
 * plus the region's min/max/mean relief and the active contour interval. Reads live measurements from
 * the readout store the {@link TerrainReadout} overlay publishes; renders nothing until shown.
 */
export function TerrainReadoutHud({ readout }: { readout: TerrainReadoutStore }) {
  const cursor = useStoreSelector(readout, (s) => s.cursor);
  const summary = useStoreSelector(readout, (s) => s.summary);
  const interval = useStoreSelector(readout, (s) => s.interval);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-40 min-w-[180px] rounded-lg border border-white/[0.08] bg-black/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-200 shadow-lg shadow-black/40 backdrop-blur-md">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Elevation</div>
      <div className="flex justify-between gap-4">
        <span className="text-neutral-400">cursor</span>
        <span>{cursor === null ? "—" : `${fmt(cursor.height)} (${signed(cursor.delta)})`}</span>
      </div>
      {summary !== null ? (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">min / max</span>
            <span>
              {fmt(summary.min)} / {fmt(summary.max)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">mean / relief</span>
            <span>
              {fmt(summary.mean)} / {fmt(summary.range)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">contour</span>
            <span>{interval > 0 ? `${fmt(interval)} m` : "flat"}</span>
          </div>
        </>
      ) : (
        <div className="text-neutral-500">no terrain sampled</div>
      )}
    </div>
  );
}
