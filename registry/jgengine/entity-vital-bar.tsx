import { useEntityStat } from "@jgengine/react/hooks";

import { VitalBar, type VitalTone } from "@/components/ui/vital-bar";

export function EntityVitalBar({
  instanceId,
  statId,
  tone,
  label,
  width,
  height,
  lean,
  segments,
  showNumbers,
  className,
}: {
  instanceId: string;
  statId: string;
  tone?: VitalTone;
  label?: string;
  width?: number | string;
  height?: number;
  lean?: number;
  segments?: number;
  showNumbers?: boolean;
  className?: string;
}) {
  const stat = useEntityStat(instanceId, statId);
  if (stat === null) return null;
  return (
    <VitalBar
      value={{ current: stat.current, max: stat.max, min: stat.min }}
      tone={tone}
      label={label}
      width={width}
      height={height}
      lean={lean}
      segments={segments}
      showNumbers={showNumbers}
      className={className}
    />
  );
}
