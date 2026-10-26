import { probeHiddenState, type HiddenStateSource, type SensorProbeOptions } from "@jgengine/core/sensor/hiddenStateProbe";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

/** Reads a hidden zone/entity state variable in range (EMF / thermometer / geiger style sensor verb, #116). */
export function useHiddenStateProbe(
  origin: EntityPosition,
  sources: readonly HiddenStateSource[],
  options: SensorProbeOptions,
) {
  return probeHiddenState(origin, sources, options);
}

export interface SensorReadoutMeterProps {
  label: string;
  reading: ReturnType<typeof probeHiddenState>;
  className?: string;
}

/** A handheld-sensor readout: needle strength bar + the raw reading, or a "no signal" idle state. */
export function SensorReadoutMeter({ label, reading, className }: SensorReadoutMeterProps) {
  const percent = reading === null ? 0 : Math.round(reading.strength * 100);
  return (
    <div className={className ?? "w-44 rounded border border-emerald-400/30 bg-black/70 p-2 text-xs text-emerald-200 shadow-lg"}>
      <div className="mb-1 flex items-center justify-between uppercase tracking-wide">
        <span>{label}</span>
        <span className="tabular-nums">{reading === null ? "—" : `${percent}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-emerald-300/70">
        {reading === null ? "no signal" : String(reading.value)}
      </div>
    </div>
  );
}
