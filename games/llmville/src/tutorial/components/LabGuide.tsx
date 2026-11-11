/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import type { ReadyWorldViewModel } from "../../runtime/worldViewModel";
import type { TutorialViewModel } from "../tutorialRuntime";
import { useTabletNavContext } from "../../tablet/components/tabletNav";
import { labGuideState, type LabGoalSelection } from "../labGuide";
import { Button, C, FULL, Icon, Row, Stack, Text } from "../../ui/kit";
import { LabGuideCard } from "./LabGuideCard";
export type { LabGoalSelection } from "../labGuide";

/** The lab guide on the tablet's home: the HUD card, then the chapter goals once the tutorial is done. */
export function LabGuide({ world, tutorial, selection }: { world: ReadyWorldViewModel; tutorial: TutorialViewModel; selection?: LabGoalSelection | undefined }) {
  const nav = useTabletNavContext();
  const [localGoal, setLocalGoal] = useState<string | null>(null);
  const choose = selection?.select ?? setLocalGoal;
  const guide = labGuideState(world, tutorial, nav, selection?.id ?? localGoal);
  return <Stack gap={8} width={FULL}>
    <LabGuideCard guide={guide} canEdit={world.canEditGame} />
    {tutorial.tutorialCompleted ? <RuneView layout="grid" columns={2} gap={8} width={FULL}>
      {guide.goals.map((entry) => {
        const chosen = guide.goal?.id === entry.id;
        return <Button key={entry.id} tone="ghost" justify="start" label={`Goal ${entry.title}`} border={{ width: 1, color: entry.done ? "#5fc2a84d" : chosen ? C.coral : C.line }} onPress={() => choose(entry.id)}>
          <Row gap={4}>{entry.done ? <Icon name="check" size={12} color={C.teal} /> : null}<Text size={12} color={entry.done ? C.teal : chosen ? C.cream : C.creamDim}>{entry.title}</Text></Row>
        </Button>;
      })}
    </RuneView> : null}
  </Stack>;
}
