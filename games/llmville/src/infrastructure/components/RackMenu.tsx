import { useCallback, useMemo, useState } from "react";
import type { RackHardwareMoveSource, RackHardwareMoveTarget } from "@/infrastructure/rackHardwareSession";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import {
  getRackInstalledHardwareSlots,
  getRackSlotCapacity,
  hardwareModelIdsWithPositiveStock,
  rackHardwareDropEndpoints,
} from "@llmville/game/infrastructure/infrastructure";
import { getHardwareDefinition, type HardwareModelId } from "@llmville/game/infrastructure/catalog";
import {
  getRackCoolingUnitDefinition,
  type RackCoolingInventory,
  type RackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";
import { computeRackThermalStateV3 } from "@llmville/game/infrastructure/infrastructure";
import { getRackCatalogDefinition, resolveRackCatalogId } from "@llmville/game/infrastructure/catalog";
import { useRackHardwareDragVisualOptional } from "@/infrastructure/rackHardwareDragVisual";

import { useTabletNavContext } from "@/tablet/components/tabletNav";

import { PANEL_VARIANT, Panel } from "@/components/ui/panel";
import RackSlot from "./RackSlot";

interface RackMenuProps {
  rack: PlacedRack;
  hardwareInventory: Record<string, number>;
  coolingInventory: RackCoolingInventory;
  onMoveHardware: (rackId: string, from: RackHardwareMoveSource, to: RackHardwareMoveTarget) => void;
  onInstallCooler: (rackId: string, coolingUnitId: RackCoolingUnitId) => void;
  onUninstallCooler: (rackId: string) => void;
  onClose: () => void;
}

type DragData = { type: "inventory" | "slot"; hardwareModelId: HardwareModelId; slotIndex?: number };

function DraggableCard({
  id,
  data,
  children,
}: {
  id: string;
  data: DragData;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`w-full cursor-grab active:cursor-grabbing transition-opacity duration-100 ${isDragging ? "opacity-30" : ""}`}
    >
      {children}
    </div>
  );
}

function DroppableSlot({
  id,
  slotIndex,
  children,
}: {
  id: string;
  slotIndex: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { slotIndex } });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 w-full min-h-[96px] transition-colors duration-150 ${
        isOver ? "ring-2 ring-emerald-400/40 ring-inset rounded-sm" : ""
      }`}
    >
      {children}
    </div>
  );
}

export default function RackMenu({
  rack,
  hardwareInventory,
  coolingInventory,
  onMoveHardware,
  onInstallCooler,
  onUninstallCooler,
  onClose,
}: RackMenuProps) {
  const { openTabletApp, openTabletStoreTab } = useTabletNavContext();
  const onVisitHardwareStore = useCallback(() => {
    onClose();
    openTabletApp("store");
    openTabletStoreTab("hardware");
  }, [onClose, openTabletApp, openTabletStoreTab]);

  const rackDragVisual = useRackHardwareDragVisualOptional();

  const slotCapacity = getRackSlotCapacity(rack.rackType);
  const installedIds = getRackInstalledHardwareSlots(rack);

  const rackThermal = useMemo(
    () => computeRackThermalStateV3({
      id: rack.id,
      rackType: rack.rackType,
      installedHardwareModuleIds: rack.installedHardwareModuleIds,
      installedCoolerId: rack.installedCoolerId,
    }, { isComputeActive: true }),
    [rack],
  );

  const cardTempBySlot = useMemo(
    () => new Map(rackThermal.cards.map((card) => [card.slotIndex, card.temperatureC])),
    [rackThermal.cards],
  );

  const catalogId = resolveRackCatalogId(rack.rackType);
  const allowedCoolants = catalogId ? getRackCatalogDefinition(catalogId).allowedCoolantTypes : ["air" as const];
  const ownedCoolers = (Object.entries(coolingInventory) as [RackCoolingUnitId, number][])
    .filter(([, count]) => count > 0)
    .filter(([id]) => allowedCoolants.includes(getRackCoolingUnitDefinition(id).coolantType));

  const hardwareIdsInInventory = hardwareModelIdsWithPositiveStock(hardwareInventory);

  const [activeData, setActiveData] = useState<DragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const raw = event.active.data.current;
      if (!raw || typeof raw !== "object" || !("hardwareModelId" in raw)) return;
      const data = raw as DragData;
      setActiveData(data);
      if (data.type === "slot" && data.slotIndex !== undefined) {
        rackDragVisual?.setRackHardwareDrag({
          rackId: rack.id,
          slotIndex: data.slotIndex,
          hardwareModelId: data.hardwareModelId,
        });
      }
    },
    [rack.id, rackDragVisual],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveData(null);
      rackDragVisual?.setRackHardwareDrag(null);
      const { active, over } = event;
      if (!over) return;

      const raw = active.data.current;
      if (!raw || typeof raw !== "object" || !("hardwareModelId" in raw)) return;
      const data = raw as DragData;

      const endpoints = rackHardwareDropEndpoints({
        overId: String(over.id),
        dragType: data.type,
        hardwareModelId: data.hardwareModelId,
        sourceSlotIndex: data.slotIndex,
      });
      if (endpoints === null) return;

      onMoveHardware(rack.id, endpoints.from, endpoints.to);
    },
    [rack.id, onMoveHardware, rackDragVisual],
  );

  const handleDragCancel = useCallback(() => {
    setActiveData(null);
    rackDragVisual?.setRackHardwareDrag(null);
  }, [rackDragVisual]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <Panel
        as="div"
        variant={PANEL_VARIANT.terminal}
        label="Rack hardware"
        className="relative flex h-full flex-col overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-sm text-brand-coral hover:bg-brand-coral/15"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Rack cooler</p>
              <p className="text-sm font-semibold text-brand-cream">
                {rack.installedCoolerId
                  ? getRackCoolingUnitDefinition(rack.installedCoolerId).name
                  : "None installed"}
              </p>
              <p className="text-[11px] text-white/45 tabular-nums">
                {rackThermal.rackHeatKw.toFixed(1)} kW heat · {rackThermal.rackCapacityKw.toFixed(1)} kW cooling
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {rack.installedCoolerId ? (
                <button
                  type="button"
                  className="rounded border border-white/15 px-2 py-1 text-[11px] font-semibold text-brand-coral hover:bg-brand-coral/10"
                  onClick={() => onUninstallCooler(rack.id)}
                >
                  Remove cooler
                </button>
              ) : ownedCoolers.length > 0 ? (
                ownedCoolers.map(([coolerId, count]) => (
                  <button
                    key={coolerId}
                    type="button"
                    className="rounded border border-brand-teal/30 px-2 py-1 text-[11px] font-semibold text-brand-teal hover:bg-brand-teal/10"
                    onClick={() => onInstallCooler(rack.id, coolerId)}
                  >
                    Install {getRackCoolingUnitDefinition(coolerId).name} (×{count})
                  </button>
                ))
              ) : (
                <span className="text-[11px] text-white/35">Buy a rack cooler in Store</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex gap-6 p-4 min-h-0 overflow-hidden">
          {/* Rack slots */}
          <section className="flex-1 min-w-0 flex flex-col">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-2 text-center">Rack slots</h2>
            <ul className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-1.5 list-none">
              {Array.from({ length: slotCapacity }, (_, i) => {
                const hardwareId = installedIds[i];
                return (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-white/50 tabular-nums">
                      {i + 1}
                    </span>
                    <DroppableSlot id={`slot-${i}`} slotIndex={i}>
                      {hardwareId ? (
                        <DraggableCard
                          id={`slot-${i}-drag`}
                          data={{ type: "slot", hardwareModelId: hardwareId, slotIndex: i }}
                        >
                          <RackSlot
                            hardwareModelId={hardwareId}
                            temperatureC={cardTempBySlot.get(i)}
                            useExternalDrag
                          />
                        </DraggableCard>
                      ) : (
                        <RackSlot hardwareModelId={undefined} useExternalDrag />
                      )}
                    </DroppableSlot>
                    {hardwareId ? (
                      <button type="button" aria-label={`Remove GPU from slot ${i + 1}`} className="shrink-0 rounded-lg border border-white/15 px-2 py-2 text-xs text-brand-cream-dim" onClick={() => onMoveHardware(rack.id, { kind: "slot", slot: i }, { kind: "stock" })}>Remove</button>
                    ) : (
                      <select aria-label={`Install GPU in slot ${i + 1}`} value="" disabled={hardwareIdsInInventory.length === 0} className="max-w-[45%] rounded-lg border border-white/15 bg-brand-ink px-2 py-2 text-xs text-brand-cream disabled:opacity-40" onChange={(event) => { if (event.target.value) onMoveHardware(rack.id, { kind: "stock", hardwareId: event.target.value as HardwareModelId }, { kind: "slot", slot: i }); }}>
                        <option value="">Install GPU…</option>
                        {hardwareIdsInInventory.map((id) => <option key={id} value={id}>{getHardwareDefinition(id).name}</option>)}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Owned hardware — entire section is the uninstall drop zone */}
          <UninstallSection
            hardwareIdsInInventory={hardwareIdsInInventory}
            hardwareInventory={hardwareInventory}
            onVisitHardwareStore={onVisitHardwareStore}
          />
        </div>
      </Panel>

      {/* Drag overlay — renders above everything in a portal, layout never shifts */}
      <DragOverlay dropAnimation={null}>
        {activeData ? (
          <div className="w-[260px] opacity-95 shadow-2xl shadow-black/60 rotate-1 scale-105 cursor-grabbing">
            <RackSlot hardwareModelId={activeData.hardwareModelId} useExternalDrag />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function UninstallSection({
  hardwareIdsInInventory,
  hardwareInventory,
  onVisitHardwareStore,
}: {
  hardwareIdsInInventory: HardwareModelId[];
  hardwareInventory: Record<string, number>;
  onVisitHardwareStore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "uninstall" });

  return (
    <section
      ref={setNodeRef}
      className={`flex-1 min-w-0 flex flex-col border-l border-white/10 px-4 rounded-r-xl transition-colors duration-150 ${
        isOver ? "bg-red-500/8" : ""
      }`}
    >
      <h2 className={`text-sm font-bold uppercase tracking-widest mb-2 text-center transition-colors duration-150 ${isOver ? "text-red-300" : "text-white"}`}>
        Owned Hardware
      </h2>
      <ul className="flex-1 min-h-0 overflow-auto space-y-1.5 list-none">
        {hardwareIdsInInventory.map((hardwareId) => (
          <li key={hardwareId}>
            <DraggableCard
              id={`inventory-${hardwareId}`}
              data={{ type: "inventory", hardwareModelId: hardwareId }}
            >
              <RackSlot
                hardwareModelId={hardwareId}
                count={hardwareInventory[hardwareId]}
                useExternalDrag
              />
            </DraggableCard>
          </li>
        ))}
        {hardwareIdsInInventory.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6">
            <p className="text-sm font-medium text-white/40 text-center">You have no hardware</p>
            <button
              type="button"
              className="text-sm font-semibold text-brand-teal hover:text-brand-cream underline underline-offset-4 decoration-brand-teal/50 transition-colors duration-150"
              onClick={onVisitHardwareStore}
            >
              Visit the Store
            </button>
          </div>
        )}
      </ul>
      <div className="mt-auto pt-5 pb-4 border-t border-white/10">
        <p className={`text-sm font-medium text-center transition-colors duration-150 ${isOver ? "text-red-400" : "text-white/30"}`}>
          Click or drag here to uninstall
        </p>
      </div>
    </section>
  );
}
