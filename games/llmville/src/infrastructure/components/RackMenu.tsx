import { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { useCallback, useEffect, useMemo } from "@jgengine/core/ui/jsx";
import type { RackHardwareMoveSource, RackHardwareMoveTarget } from "../rackHardwareSession";
import { DragGhost, DraggableCard, DropZone, useDragLayer, type DragLayer } from "@jgengine/core/inventory/dragLayer.view";
import type { PlacedRack } from "../infrastructure";
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
import { useRackHardwareDragVisualOptional } from "../rackHardwareDragVisual";

import { useTabletNavContext } from "../../tablet/components/tabletNav";

import RackSlot from "./RackSlot";
import type { ReactNode } from "@jgengine/core/ui/jsx";

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

function HardwareCard({
  id,
  data,
  layer,
  children,
}: {
  id: string;
  data: DragData;
  layer: DragLayer<DragData>;
  children: ReactNode;
}) {
  return (
    <DraggableCard
      id={id}
      value={data}
      layer={layer}
      onRotate={false}
      className="w-full cursor-grab active:cursor-grabbing transition-opacity duration-100 data-[dragging]:opacity-30"
    >
      {children}
    </DraggableCard>
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

  const drag = useDragLayer<DragData>({
    onDrop({ payload, target }) {
      if (target === null) return;
      const endpoints = rackHardwareDropEndpoints({
        overId: target,
        dragType: payload.value.type,
        hardwareModelId: payload.value.hardwareModelId,
        sourceSlotIndex: payload.value.slotIndex,
      });
      if (endpoints === null) return;
      onMoveHardware(rack.id, endpoints.from, endpoints.to);
    },
  });

  // The 3D rack hides the card being carried out of one of its slots, for as long as it is carried.
  const carried = drag.state.payload?.value ?? null;
  const setRackHardwareDrag = rackDragVisual?.setRackHardwareDrag;
  useEffect(() => {
    if (setRackHardwareDrag === undefined || carried?.type !== "slot" || carried.slotIndex === undefined) return undefined;
    setRackHardwareDrag({ rackId: rack.id, slotIndex: carried.slotIndex, hardwareModelId: carried.hardwareModelId });
    return () => setRackHardwareDrag(null);
  }, [carried, rack.id, setRackHardwareDrag]);

  return (
    <>
      <KitPanel
        as="div"
        data-shell="terminal"
        eyebrow="Rack hardware"
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
                    <DropZone
                      id={`slot-${i}`}
                      layer={drag}
                      className="flex-1 min-w-0 w-full min-h-[96px] transition-colors duration-150"
                      activeClassName="ring-2 ring-emerald-400/40 ring-inset rounded-sm"
                    >
                      {hardwareId ? (
                        <HardwareCard
                          id={`slot-${i}-drag`}
                          data={{ type: "slot", hardwareModelId: hardwareId, slotIndex: i }}
                          layer={drag}
                        >
                          <RackSlot
                            hardwareModelId={hardwareId}
                            temperatureC={cardTempBySlot.get(i)}
                            useExternalDrag
                          />
                        </HardwareCard>
                      ) : (
                        <RackSlot hardwareModelId={undefined} useExternalDrag />
                      )}
                    </DropZone>
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
            layer={drag}
            hardwareIdsInInventory={hardwareIdsInInventory}
            hardwareInventory={hardwareInventory}
            onVisitHardwareStore={onVisitHardwareStore}
          />
        </div>
      </KitPanel>

      {/* The carried card follows the pointer above everything; the layout under it never shifts. */}
      <DragGhost layer={drag} className="w-[260px] opacity-95 shadow-2xl shadow-black/60 scale-105 cursor-grabbing">
        {(payload) => <RackSlot hardwareModelId={payload.value.hardwareModelId} useExternalDrag />}
      </DragGhost>
    </>
  );
}

function UninstallSection({
  layer,
  hardwareIdsInInventory,
  hardwareInventory,
  onVisitHardwareStore,
}: {
  layer: DragLayer<DragData>;
  hardwareIdsInInventory: HardwareModelId[];
  hardwareInventory: Record<string, number>;
  onVisitHardwareStore: () => void;
}) {
  const isOver = layer.dragging && layer.state.overTarget === "uninstall";

  return (
    <DropZone
      id="uninstall"
      layer={layer}
      className="flex-1 min-w-0 flex flex-col border-l border-white/10 px-4 rounded-r-xl transition-colors duration-150"
      activeClassName="bg-red-500/8"
    >
      <h2 className={`text-sm font-bold uppercase tracking-widest mb-2 text-center transition-colors duration-150 ${isOver ? "text-red-300" : "text-white"}`}>
        Owned Hardware
      </h2>
      <ul className="flex-1 min-h-0 overflow-auto space-y-1.5 list-none">
        {hardwareIdsInInventory.map((hardwareId) => (
          <li key={hardwareId}>
            <HardwareCard
              id={`inventory-${hardwareId}`}
              data={{ type: "inventory", hardwareModelId: hardwareId }}
              layer={layer}
            >
              <RackSlot
                hardwareModelId={hardwareId}
                count={hardwareInventory[hardwareId]}
                useExternalDrag
              />
            </HardwareCard>
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
    </DropZone>
  );
}
