import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { getHardwareImagePath } from "@llmville/game/world/worldModelCatalog";

interface GpuModelPreviewProps {
  hardwareModelId: HardwareModelId;
  className?: string;
}

export function GpuModelPreview({ hardwareModelId, className = "" }: GpuModelPreviewProps) {
  const src = getHardwareImagePath(hardwareModelId);
  return (
    <div
      className={`shrink-0 overflow-hidden bg-slate-900/80 rounded-lg border border-white/10 ${className}`}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        className="w-full h-full object-contain object-center"
      />
    </div>
  );
}
