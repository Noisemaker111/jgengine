/** @jsxImportSource @jgengine/core/ui/jsx */
/** The tablet and the rack menu, on the HUD's native surface (inside `LlmRoot`). */
import type { BuildViewModel } from "../../build/buildSession";
import { RackMenuOverlay } from "../../infrastructure/components/RackMenuOverlay";
import { findPlacedRackById } from "../../infrastructure/infrastructure";
import type { RackHardwareViewModel } from "../../infrastructure/rackHardwareSession";
import type { ReadyWorldViewModel } from "../../runtime/worldViewModel";
import type { LabGoalSelection } from "../../tutorial/labGuide";
import type { TutorialViewModel } from "../../tutorial/tutorialRuntime";
import { GameTablet } from "./GameTablet";
import { useTabletNavContext } from "./tabletNav";

export function TabletLayer({ world, build, rackHardware, tutorial, isTouch, embedded = false, goalSelection }: {
  world: ReadyWorldViewModel; build: BuildViewModel; rackHardware: RackHardwareViewModel; tutorial: TutorialViewModel; isTouch: boolean; embedded?: boolean; goalSelection: LabGoalSelection;
}) {
  const { rackMenuOverlayRackId, closeMenu } = useTabletNavContext();
  const rackMenuRack = findPlacedRackById(world.racks, rackMenuOverlayRackId);
  return <>
    <GameTablet world={world} build={build} tutorial={tutorial} isTouch={isTouch} embedded={embedded} goalSelection={goalSelection} />
    {rackMenuRack ? <RackMenuOverlay
      rack={rackMenuRack}
      hardwareInventory={world.hardwareInventory}
      coolingInventory={world.coolingInventory}
      onMoveHardware={rackHardware.moveHardware}
      onInstallCooler={rackHardware.onInstallCoolerToRack}
      onUninstallCooler={rackHardware.onUninstallCoolerFromRack}
      onClose={closeMenu}
    /> : null}
  </>;
}
