/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import PlacementControls from "./PlacementController";
import type { BuildViewModel } from "../../build/buildSession";
import type { ReadyWorldViewModel } from "../worldViewModel";
import { findPlacedRackById } from "../../infrastructure/infrastructure";
import type { TutorialViewModel } from "../../tutorial/tutorialRuntime";
import { useTabletNavContext } from "../../tablet/components/tabletNav";
import { labGuideState, type LabGoalSelection } from "../../tutorial/labGuide";
import { LabGuideCard } from "../../tutorial/components/LabGuideCard";
import { C, Icon, Muted, Panel, Text } from "../../ui/kit";

function LaunchCelebration() {
  return <RuneView anchor="top" inset={0} padding={[180, 0, 0, 0]}>
    <Panel shell="sticky" items="center" gap={12} padding={16} width={280} label="Model ready to serve">
      <Text size={15} weight={800} color={C.paperInk}>Model ready to serve</Text>
      <RuneView width={64} height={64} radius={32} justify="center" items="center" gradient={{ angle: 2.4, stops: [[0, C.teal], [1, C.tealDeep]] }} shadow={{ y: 0, blur: 18, color: "#5fc2a880" }}>
        <Icon name="sparkles" size={40} color="#0e231e" />
      </RuneView>
      <Muted size={14} align="center" color={C.paperMuted}>Assign its GPUs in GPU jobs to start earning.</Muted>
    </Panel>
  </RuneView>;
}

/** Shared in-world overlays: the crosshair, the lab guide, placement and the launch celebration. */
export function GameplayChrome({ world, build, tutorial, isTouch, chatOpen = false, goalSelection }: {
  world: ReadyWorldViewModel; build: BuildViewModel; tutorial: TutorialViewModel; isTouch: boolean; chatOpen?: boolean; goalSelection: LabGoalSelection;
}) {
  const nav = useTabletNavContext();
  const { width } = useRuneViewport();
  const rackMenuOpen = findPlacedRackById(world.racks, nav.rackMenuOverlayRackId) !== undefined;
  const showGuide = !chatOpen && !nav.tabletOpen && !rackMenuOpen && !build.buildPlacementModeActive;
  return <>
    <RuneView anchor="center"><RuneView width={4} height={4} radius={2} fill="#ffffffcc" /></RuneView>
    {showGuide ? <RuneView anchor="top-right" safe inset={12} padding={[100, 0, 0, 0]} responsive={{ phone: { padding: [146, 0, 0, 0] } }} width={Math.min(304, width - 24)}>
      <LabGuideCard guide={labGuideState(world, tutorial, nav, goalSelection.id)} canEdit={world.canEditGame} />
    </RuneView> : null}
    {world.launchCelebrationActive ? <LaunchCelebration /> : null}
    {build.buildPlacementModeActive ? <RuneView anchor={isTouch ? "bottom-left" : "top-right"} safe inset={isTouch ? 16 : 48} padding={isTouch ? [0, 0, 176, 0] : [48, 0, 0, 0]}>
      <PlacementControls facingLabel={build.placementFacingLabel} onRotate={build.onRotatePlacement} onPlace={build.onConfirmPlacement}
        canPlace={build.placementPreview?.isValid ?? false} claimHint={build.placementClaimHint} isTouch={isTouch} />
    </RuneView> : null}
  </>;
}
