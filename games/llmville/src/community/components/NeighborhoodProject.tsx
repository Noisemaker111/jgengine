/** @jsxImportSource @jgengine/core/ui/jsx */
import { useQuery } from "convex/react";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { api } from "@llmville/backend/convex/_generated/api";
import { communityMilestone } from "@llmville/game/tutorial/communityMilestone";

import { C, FULL, Icon, Muted, Panel, Row, Text } from "../../ui/kit";

export function NeighborhoodProject() {
  const progress = useQuery(api.multiplayer.worldPresence.communityProgress, {});
  return progress === undefined ? null : <NeighborhoodProjectView launchedLabs={progress.launchedLabs} />;
}

/** The shared goal: how many neighbours have launched a first earning model. */
export function NeighborhoodProjectView({ launchedLabs }: { launchedLabs: number }) {
  const milestone = communityMilestone(launchedLabs);
  return <Panel shell="inset" width={FULL} gap={8} label="Community project" fill="#e0a95c0d" border={{ width: 1, color: "#e0a95c40" }}>
    <Row gap={8}>
      <Icon name={milestone.complete ? "award" : "users"} size={18} color={milestone.complete ? C.amber : C.teal} />
      <Text size={14} weight={700}>{milestone.complete ? milestone.reward : milestone.title}</Text>
    </Row>
    <Muted size={12} color={C.creamDim}>{milestone.complete
      ? `${launchedLabs} neighbors have launched their first earning model. Your community earned this badge together.`
      : `Help ${milestone.target} neighbors launch their first earning model. Ask for help in chat or share what worked for you.`}</Muted>
    <RuneView height={8} radius={4} fill={C.line} width={FULL}>
      <RuneView height={8} radius={4} fill={C.amber} width={{ fraction: Math.max(0, Math.min(1, milestone.progress / Math.max(1, milestone.target))) }} />
    </RuneView>
    <Text size={12} color={C.amber}>{`${milestone.progress} / ${milestone.target} labs launched${milestone.complete ? "" : ` · Reward: ${milestone.reward}`}`}</Text>
  </Panel>;
}
