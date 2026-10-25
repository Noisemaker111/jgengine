/**
 * Full-screen overlay for the rack hardware menu (E key near rack).
 */

import { createPortal } from "react-dom";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import { useEscapeToClose } from "@/tablet/tablet";
import type { RackHardwareMoveSource, RackHardwareMoveTarget } from "@/infrastructure/rackHardwareSession";

import RackMenu from "./RackMenu";

import type { RackCoolingInventory } from "@llmville/game/infrastructure/catalog";
import type { RackCoolingUnitId } from "@llmville/game/infrastructure/catalog";

interface RackMenuOverlayProps {
  rack: PlacedRack;
  hardwareInventory: Record<string, number>;
  coolingInventory: RackCoolingInventory;
  onMoveHardware: (rackId: string, from: RackHardwareMoveSource, to: RackHardwareMoveTarget) => void;
  onInstallCooler: (rackId: string, coolingUnitId: RackCoolingUnitId) => void;
  onUninstallCooler: (rackId: string) => void;
  onClose: () => void;
}

export function RackMenuOverlay({
  rack,
  hardwareInventory,
  coolingInventory,
  onMoveHardware,
  onInstallCooler,
  onUninstallCooler,
  onClose,
}: RackMenuOverlayProps) {
  useEscapeToClose(onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-none"
        aria-hidden
      />
      <div
        className="relative z-10 w-[calc(100%-1.5rem)] max-w-2xl h-[min(90dvh,720px)] min-h-0 min-w-0 overflow-y-auto pointer-events-auto"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      >
        <RackMenu
          rack={rack}
          hardwareInventory={hardwareInventory}
          coolingInventory={coolingInventory}
          onMoveHardware={onMoveHardware}
          onInstallCooler={onInstallCooler}
          onUninstallCooler={onUninstallCooler}
          onClose={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
