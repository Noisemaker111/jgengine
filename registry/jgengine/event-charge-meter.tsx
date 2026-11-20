/** @jsxImportSource @jgengine/core/ui/jsx */
import type { EventMeter } from "@jgengine/core/stats/eventMeter";
import { useEventMeter } from "@jgengine/core/ui/hooks.view";

import { ChargeMeter } from "@/components/ui/charge-meter";

export function EventChargeMeter({
  meter,
  label,
  width = 180,
  className,
}: {
  meter: EventMeter;
  label?: string;
  width?: number | string;
  className?: string;
}) {
  const view = useEventMeter(meter);
  return (
    <ChargeMeter fraction={view.fraction} ready={view.ready} label={label} width={width} className={className} />
  );
}
