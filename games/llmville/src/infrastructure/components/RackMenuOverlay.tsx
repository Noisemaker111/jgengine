/** @jsxImportSource @jgengine/core/ui/jsx */
/** The rack hardware menu (E near a rack): a modal sheet over the world; Escape or Back closes it. */
import type { PlacedRack } from "../infrastructure";
import type { RackHardwareMoveSource, RackHardwareMoveTarget } from "../rackHardwareSession";
import type { RackCoolingInventory, RackCoolingUnitId } from "@llmville/game/infrastructure/catalog";

import RackMenu from "./RackMenu";

export function RackMenuOverlay(props: {
  rack: PlacedRack;
  hardwareInventory: Record<string, number>;
  coolingInventory: RackCoolingInventory;
  onMoveHardware: (rackId: string, from: RackHardwareMoveSource, to: RackHardwareMoveTarget) => void;
  onInstallCooler: (rackId: string, coolingUnitId: RackCoolingUnitId) => void;
  onUninstallCooler: (rackId: string) => void;
  onClose: () => void;
}) {
  return <RackMenu {...props} />;
}
