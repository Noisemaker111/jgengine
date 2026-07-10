import { VitalBar } from "@/components/ui/vital-bar";

import { WATER_MAX } from "../../caravan/water";

export function WaterGauge({ water }: { water: number }) {
  return (
    <VitalBar
      value={{ current: water, max: WATER_MAX }}
      tone="stamina"
      label="Water Skins"
      width={260}
      height={18}
    />
  );
}
