/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useMemo, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import type { RackHardwareMoveSource, RackHardwareMoveTarget } from "../rackHardwareSession";
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
import { Button, C, FULL, Label, Muted, Row, Sheet, Stack, Text, useCompact } from "../../ui/kit";

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

/** Drag payloads travel as strings: `slot:<index>:<id>` or `inventory:<id>`. */
function encodeDrag(data: DragData): string {
  return data.type === "slot" ? `slot:${data.slotIndex ?? 0}:${data.hardwareModelId}` : `inventory:${data.hardwareModelId}`;
}
function decodeDrag(value: string): DragData | null {
  const [type, a, b] = value.split(":");
  if (type === "slot" && a !== undefined && b !== undefined) return { type, slotIndex: Number(a), hardwareModelId: b as HardwareModelId };
  if (type === "inventory" && a !== undefined) return { type, hardwareModelId: a as HardwareModelId };
  return null;
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

  const [installing, setInstalling] = useState<number | null>(null);
  const compact = useCompact();
  const drop = (value: string, target: string) => {
    const data = decodeDrag(value);
    if (data === null) return;
    const endpoints = rackHardwareDropEndpoints({ overId: target, dragType: data.type, hardwareModelId: data.hardwareModelId, sourceSlotIndex: data.slotIndex });
    if (endpoints !== null) onMoveHardware(rack.id, endpoints.from, endpoints.to);
  };
  // The 3D rack hides the card being carried out of one of its slots, for as long as it is carried.
  const carry = (slotIndex: number, hardwareModelId: HardwareModelId, phase: "down" | "move" | "up") => {
    const set = rackDragVisual?.setRackHardwareDrag;
    if (set === undefined) return;
    if (phase === "down") set({ rackId: rack.id, slotIndex, hardwareModelId });
    else if (phase === "up") set(null);
  };

  const slots = <Stack grow={1} shrink gap={6} {...(compact ? { width: FULL } : {})}>
    <Label align="center">RACK SLOTS</Label>
    {Array.from({ length: slotCapacity }, (_, i) => {
      const hardwareId = installedIds[i];
      return <Stack key={i} gap={4} width={FULL}>
        <Row gap={6} width={FULL}>
          <RuneAction acceptDrop={(value) => drop(value, `slot-${i}`)} grow={1} label={hardwareId ? `Slot ${i + 1}: ${getHardwareDefinition(hardwareId).name}` : `Empty slot ${i + 1}`}
            {...(hardwareId ? { dragValue: encodeDrag({ type: "slot", hardwareModelId: hardwareId, slotIndex: i }), onDrag: (gesture: { phase: "down" | "move" | "up" }) => carry(i, hardwareId, gesture.phase) } : {})}>
            <RackSlot hardwareModelId={hardwareId ?? undefined} temperatureC={hardwareId ? cardTempBySlot.get(i) : undefined} slotNumber={i + 1} />
          </RuneAction>
          {hardwareId
            ? <Button tone="ghost" minHeight={36} label={`Remove GPU from slot ${i + 1}`} onPress={() => onMoveHardware(rack.id, { kind: "slot", slot: i }, { kind: "stock" })}><Text size={12}>Remove</Text></Button>
            : <Button tone="ghost" minHeight={36} disabled={hardwareIdsInInventory.length === 0} label={`Install GPU in slot ${i + 1}`} onPress={() => setInstalling(installing === i ? null : i)}><Text size={12}>Install…</Text></Button>}
        </Row>
        {installing === i && !hardwareId ? <Row gap={4} width={FULL}>{hardwareIdsInInventory.map((id) => <Button key={id} tone="chip" grow={1} label={`Install ${getHardwareDefinition(id).name} in slot ${i + 1}`}
          onPress={() => { setInstalling(null); onMoveHardware(rack.id, { kind: "stock", hardwareId: id }, { kind: "slot", slot: i }); }}>
          <Text size={11} weight={800}>{getHardwareDefinition(id).name}</Text>
        </Button>)}</Row> : null}
      </Stack>;
    })}
  </Stack>;

  return <Sheet title="Rack hardware" close={onClose} width={720} height={720}>
    <Row justify="between" items="start" gap={12} width={FULL}>
      <RuneView gap={2} grow={1} shrink>
        <Label>RACK COOLER</Label>
        <Text size={14} weight={700}>{rack.installedCoolerId ? getRackCoolingUnitDefinition(rack.installedCoolerId).name : "None installed"}</Text>
        <Muted size={11}>{`${rackThermal.rackHeatKw.toFixed(1)} kW heat · ${rackThermal.rackCapacityKw.toFixed(1)} kW cooling`}</Muted>
      </RuneView>
      <RuneView items="end" gap={4}>
        {rack.installedCoolerId ? <Button tone="danger" minHeight={32} onPress={() => onUninstallCooler(rack.id)}>Remove cooler</Button>
          : ownedCoolers.length > 0 ? ownedCoolers.map(([coolerId, count]) => <Button key={coolerId} tone="ghost" minHeight={32} label={`Install ${getRackCoolingUnitDefinition(coolerId).name}`} onPress={() => onInstallCooler(rack.id, coolerId)}>
            <Text size={11} weight={800} color={C.teal}>{`Install ${getRackCoolingUnitDefinition(coolerId).name} (×${count})`}</Text>
          </Button>) : <Muted size={11}>Buy a rack cooler in Store</Muted>}
      </RuneView>
    </Row>
    <RuneView height={1} fill={C.line} width={FULL} />
    <RuneView layout={compact ? "stack" : "row"} gap={16} items="start" width={FULL}>
      {slots}
      <RuneAction acceptDrop={(value) => drop(value, "uninstall")} label="Owned hardware" grow={1} shrink gap={6} padding={[0, 0, 0, compact ? 0 : 12]} {...(compact ? { width: FULL } : {})}
        hover="#ef444414">
        <Label align="center">OWNED HARDWARE</Label>
        {hardwareIdsInInventory.map((hardwareId) => <RuneAction key={hardwareId} dragValue={encodeDrag({ type: "inventory", hardwareModelId: hardwareId })} width={FULL}
          label={`Owned ${getHardwareDefinition(hardwareId).name}`} tooltip="Drag onto a slot">
          <RackSlot hardwareModelId={hardwareId} count={hardwareInventory[hardwareId]} />
        </RuneAction>)}
        {hardwareIdsInInventory.length === 0 ? <RuneView items="center" gap={10} padding={24} width={FULL}>
          <Muted size={13}>You have no hardware</Muted>
          <Button tone="link" onPress={onVisitHardwareStore}>Visit the Store</Button>
        </RuneView> : null}
        <Muted size={12} align="center" padding={[12, 0, 4, 0]}>Drag a card here to uninstall</Muted>
      </RuneAction>
    </RuneView>
  </Sheet>;
}
