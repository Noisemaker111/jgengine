/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * In-world HUD: resources, model warnings and news tweets at the edges, the lab guide, chat and the
 * world prompt, and the tablet and rack menu above them, all on the one native surface.
 * Walk/look input lives in the shell, not here.
 */
import { useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneFor, RuneView, RuneWorldAnchor, type RuneProjection } from "@jgengine/core/ui/rune/primitives.view";
import { worldLabels } from "../../scene/worldLabels";
import type { ChatMessage } from "@jgengine/core/chat/chat";
import type { NotificationEntry } from "@jgengine/core/notifications/notificationCenter";
import { INTERACTION_GAUGE } from "@llmville/game/simulation/interaction";

import type { BuildViewModel } from "../../build/buildSession";
import TweetNotification from "../../economy/components/TweetNotification";
import { BankruptOverlay } from "../../economy/components/BankruptOverlay";
import { useTweetFeed } from "../../economy/tweetFeed";
import type { RackHardwareViewModel } from "../../infrastructure/rackHardwareSession";
import { WorldChat } from "../../chat/components/WorldChat";
import { ProximityPromptMarker } from "../../scene/components/ProximityPromptMarker";
import { useWorldModelDiagnostics, type WorldModelDiagnostic } from "../../scene/worldModelDiagnostics";
import { TabletLayer } from "../../tablet/components/TabletLayer";
import type { LabGoalSelection } from "../../tutorial/labGuide";
import type { TutorialViewModel } from "../../tutorial/tutorialRuntime";
import { C, LlmRoot, Panel, Text, useCompact } from "../../ui/kit";
import { DISPLAY } from "../../ui/theme";
import type { ReadyWorldViewModel } from "../worldViewModel";
import { GameplayChrome } from "./GameplayChrome";
import { ResourceHud } from "./ResourceHud";

interface GameOverlayProps {
  world: ReadyWorldViewModel;
  build: BuildViewModel;
  rackHardware: RackHardwareViewModel;
  tutorial: TutorialViewModel;
  isTouch: boolean;
  /** When true, the tablet draws inside a dev preview frame instead of the browser viewport. */
  embedded?: boolean;
  chatFixtureMessages?: readonly ChatMessage[];
  /** World to screen through the live camera, for the interaction prompt. */
  project?: RuneProjection | undefined;
  /** Shown over the HUD when the account went bankrupt; the dev preview leaves it out. */
  bankrupt?: ReactNode;
}

/**
 * Asset-pipeline warnings for models that failed to load: a column of small alert toasts under the
 * resources, or on a phone one chip that counts them, so they never cover the guide or chat.
 */
function Diagnostics({ diagnostics }: { diagnostics: readonly WorldModelDiagnostic[] }) {
  const compact = useCompact();
  if (diagnostics.length === 0) return null;
  if (compact) return <Panel shell="toast" padding={[6, 10, 6, 10]} border={{ width: 1, color: "#e0a95c66" }} label={diagnostics.map((d) => d.label).join(", ")}>
    <Text size={11} weight={800} color={C.amber}>{`${diagnostics.length} model warning${diagnostics.length === 1 ? "" : "s"}`}</Text>
  </Panel>;
  return <RuneView width={224} gap={8}>
    {diagnostics.map((diagnostic) => <Panel key={diagnostic.key} shell="toast" gap={4} padding={10} border={{ width: 1, color: "#e0a95c66" }}>
      <Text size={12} weight={800} color={C.amber}>{diagnostic.label}</Text>
      <Text size={10} color="#e0a95ccc">{diagnostic.message}</Text>
    </Panel>)}
  </RuneView>;
}

/** The native HUD layer alone (inside a `LlmRoot`). */
export function GameHud({ world, build, tutorial, isTouch, project, tweet, dismissTweet, diagnostics, goalSelection, chatOpen, chat }: GameOverlayProps & {
  tweet: NotificationEntry | null; dismissTweet: (id: string) => void; diagnostics: readonly WorldModelDiagnostic[];
  goalSelection: LabGoalSelection; chatOpen: boolean; chat: ReactNode;
}) {
  const read = { money: () => world.money, dataTokens: () => world.dataTokens, income: () => world.servingIncomeRate };
  return <>
    <RuneView anchor="top-left" safe inset={12} gap={8}>
      <ResourceHud money={read.money} dataTokens={read.dataTokens} servingIncomeRate={read.income} />
      <Diagnostics diagnostics={diagnostics} />
    </RuneView>
    {tweet === null ? null : <RuneView anchor="bottom" safe inset={16} padding={[0, 0, 64, 0]}><TweetNotification key={tweet.id} tweet={tweet} onDismiss={dismissTweet} /></RuneView>}
    <GameplayChrome world={world} build={build} tutorial={tutorial} isTouch={isTouch} chatOpen={chatOpen} goalSelection={goalSelection} />
    {project === undefined || (world.interactionHint === null && world.interactionPrompt === null) ? null : <ProximityPromptMarker
      hint={world.interactionHint ?? null}
      target={world.interactionTarget}
      promptDisplay={world.interactionPrompt?.prompt.display ?? null}
      gaugeValues={{ [INTERACTION_GAUGE.power]: { value: world.siteHealth.powerDrawKw, max: world.siteHealth.powerCapacityKw, unit: "kW" } }}
      racks={world.racks}
      placedBuildItems={world.placedBuildItems}
    />}
    {project !== undefined && tutorial.tutorialStarted && !tutorial.tutorialCompleted && tutorial.tutorialStage === "install_gpus"
      && (world.isPointerLocked || isTouch) && world.racks[0] !== undefined
      ? <RuneWorldAnchor position={[world.racks[0].x, 1.6, world.racks[0].z]}>
        <Text family={DISPLAY} size={44} weight={800} color={C.teal} label="Install GPUs in this rack" shadow={{ y: 2, blur: 4, color: "#00000066" }}>↓</Text>
      </RuneWorldAnchor> : null}
    {project === undefined ? null : <RuneFor source={worldLabels} keyBy={(entry) => entry.id}>{(entry) =>
      <RuneWorldAnchor position={entry.position}>
        <RuneView x={-40} padding={[2, 8, 2, 8]} radius={6} fill="#1f2b28e6" border={{ width: 1, color: entry.border }}>
          <Text size={10} weight={700} tracking={0.6} color={entry.color} {...(entry.mono === true ? { mono: true } : {})}>{entry.text}</Text>
        </RuneView>
      </RuneWorldAnchor>}
    </RuneFor>}
    {chat}
  </>;
}

/** The whole in-world UI on LLMville's native surface: the HUD, then the tablet and rack menu over it. */
export function GameOverlay(props: GameOverlayProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [goalId, setGoalId] = useState<string | null>(null);
  const goalSelection: LabGoalSelection = { id: goalId, select: setGoalId };
  const diagnostics = useWorldModelDiagnostics();
  const tweets = useTweetFeed(props.world.tweetNotification, props.world.onDismissTweet);
  return <>
    <LlmRoot project={props.project}>
      <GameHud {...props} tweet={tweets.current} dismissTweet={tweets.dismiss} diagnostics={diagnostics}
        goalSelection={goalSelection} chatOpen={chatOpen}
        chat={<WorldChat world={props.world} placing={props.build.buildPlacementModeActive} open={chatOpen} setOpen={setChatOpen} fixtureMessages={props.chatFixtureMessages} />} />
      <TabletLayer world={props.world} build={props.build} rackHardware={props.rackHardware} tutorial={props.tutorial}
        isTouch={props.isTouch} embedded={props.embedded ?? false} goalSelection={goalSelection} />
      {props.bankrupt}
    </LlmRoot>
  </>;
}

export default GameOverlay;
