import { getHardwareDefinition } from "@llmville/game/infrastructure/catalog";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { getHardwareImagePath } from "@llmville/game/world/worldModelCatalog";

interface RackSlotProps {
  /** When set, slot is filled with this hardware. When undefined, slot is empty (drop zone). */
  hardwareModelId?: HardwareModelId;
  /** Optional count for inventory display (e.g. ×2) */
  count?: number;
  /** Whether this slot is being dragged */
  isDragging?: boolean;
  /** Drag start handler */
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** When true, drag is handled by parent (e.g. @dnd-kit); disables native draggable */
  useExternalDrag?: boolean;
  /** Card temperature from rack thermal v3 (°C) */
  temperatureC?: number;
  /** Show slot number label (for rack slots) */
  slotNumber?: number;
}

export default function RackSlot({
  hardwareModelId,
  count,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  useExternalDrag,
  temperatureC,
  slotNumber,
}: RackSlotProps) {
  const filled = hardwareModelId != null;
  const hardware = filled ? getHardwareDefinition(hardwareModelId) : null;
  const draggable = filled && !useExternalDrag;

  const slotContent = (
    <div
      draggable={draggable}
      onDragStart={useExternalDrag ? undefined : onDragStart}
      onDragEnd={useExternalDrag ? undefined : onDragEnd}
      onDragOver={useExternalDrag ? undefined : onDragOver}
      onDrop={useExternalDrag ? undefined : onDrop}
      className="w-full h-[96px] flex items-stretch p-0 transition-colors"
    >
      <div
        className={`flex flex-1 items-stretch overflow-hidden rounded-[var(--r-field)] transition-colors ${
          filled
            ? `border border-[var(--surface-border)] bg-black/25 ${useExternalDrag ? "" : "cursor-grab active:cursor-grabbing"}`
            : "border-2 border-dashed border-[var(--surface-border)] bg-black/10 hover:border-brand-teal/30 hover:bg-brand-teal/5"
        } ${isDragging ? "ring-1 ring-brand-teal/50" : ""}`}
      >
        {filled && hardware ? (
          <div className="relative h-full w-full bg-black/35">
            <img
              src={getHardwareImagePath(hardwareModelId)}
              alt=""
              className="absolute inset-0 w-full h-full object-contain object-center scale-125"
            />
            <div className="absolute inset-0 flex items-start justify-between p-1">
              <span className="text-sm font-bold leading-tight text-brand-teal">
                {hardware.name}
              </span>
              <div className="text-right">
                <div className="text-sm font-semibold leading-tight text-brand-cream/90">{hardware.trainingPowerFp16} TFLOPS</div>
                <div className="text-sm font-semibold leading-tight text-brand-cream/80">{hardware.vramGb} GB</div>
              </div>
            </div>
            {count !== undefined && count >= 2 && (
              <span className="absolute bottom-1 right-1 text-[11px] font-bold text-yellow-400 tabular-nums">
                ×{count}
              </span>
            )}
            {temperatureC != null && (
              <span
                className={`absolute bottom-1 left-1 rounded px-1 py-0.5 text-[10px] font-bold tabular-nums ${
                  temperatureC >= 80 ? "bg-red-500/80 text-white" :
                  temperatureC >= 65 ? "bg-amber-500/80 text-black" :
                  "bg-brand-teal/80 text-[#0e231e]"
                }`}
              >
                {Math.round(temperatureC)}°C
              </span>
            )}
          </div>
        ) : (
          <span className="flex items-center justify-center flex-1 text-[9px] text-white/30">Empty</span>
        )}
      </div>
    </div>
  );

  if (slotNumber != null) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 shrink-0 text-center text-[10px] font-bold text-white/50 tabular-nums">
          {slotNumber}
        </span>
        {slotContent}
      </div>
    );
  }

  return slotContent;
}
