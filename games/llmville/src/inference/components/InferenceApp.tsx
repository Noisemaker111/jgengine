/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * Inference app — give each installed GPU card one job (Training, Scraping, or a specific serving
 * model) from its job buttons, or drag its card onto that lane. Replaces the old ratio-based Dashboard: each physical card is a draggable chip, and
 * a card's full stats belong to exactly one job (see `computeAssignments.ts`).
 */
import { useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import type { PlacedRack } from "../../infrastructure/infrastructure";
import { placedRackAssignmentInputs } from "../../infrastructure/infrastructure";
import {
  assignmentKey,
  computeAssignmentStats,
  type ComputeAssignmentMap,
  type ComputeLane,
} from "@llmville/game/infrastructure/infrastructure";
import { getRackInstalledHardwareSlots } from "@llmville/game/infrastructure/infrastructure";
import { getHardwareDefinition, type ComputePrecision, type HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { SERVING_MODE_PROFILES, SERVING_MODE_VALUES, type ServingModeId } from "@llmville/game/models/servingMode";
import {
  getScrapeTierDef,
  computeScrapeTokensPerProc,
  isScrapeTierRunnable,
  SCRAPE_TICK_INTERVAL_MS,
  SCRAPE_TIER_LIST,
  type ScrapeTierId,
} from "@llmville/game/models/scrapingTiers";
import type { TutorialStage } from "@llmville/game/tutorial/tutorialStages";

import { Button, C, FULL, Label, Muted, Panel, Row, Stack, Text } from "../../ui/kit";
import RackSlot from "../../infrastructure/components/RackSlot";
import { RevealedModelCard, UnknownModelCard } from "../../models/components/ModelCard";
import { ModelDetailView } from "../../models/components/ModelDetailView";
import type { RevealingModelStats } from "../../models/components/ModelRevealOverlay";
import { userModelTrainingVolumeLabel, type GameUserModel } from "../../models/models";

interface InferenceAppProps {
  racks: readonly PlacedRack[];
  computeAssignments: ComputeAssignmentMap;
  onAssignCard: (rackId: string, slotIndex: number, lane: ComputeLane, targetModelId?: Id<"models">) => void;
  onUnassignCard: (rackId: string, slotIndex: number) => void;
  activeScrapeTier: ScrapeTierId;
  scrapeSourceTokensPerToken: number;
  onSetScrapeTier: (tier: ScrapeTierId) => void;
  servingMode: ServingModeId;
  onSetServingMode: (mode: ServingModeId) => void;
  userModels: readonly GameUserModel[];
  onServeModel: (modelId: GameUserModel["id"]) => void | Promise<unknown> | undefined;
  onQuantizeModel: (modelId: GameUserModel["id"], precision: ComputePrecision) => void | Promise<unknown> | undefined;
  onQueueModelReveal: (model: RevealingModelStats) => void;
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialStage: TutorialStage;
}

interface InstalledCard {
  key: string;
  rackId: string;
  slotIndex: number;
  hardwareModelId: HardwareModelId;
  lane: ComputeLane | null;
  targetModelId?: string | undefined;
}

/** A lane's drop target id, carried by `acceptDrop`. */
type LaneTarget = "undedicated" | "lane:training" | "lane:scraping" | `serving:${string}`;

/** A card on a lane; drag it to another lane to move it. */
function ComputeChip({ card }: { card: InstalledCard }) {
  return <RuneAction dragValue={card.key} width={180} label={`GPU card ${getHardwareDefinition(card.hardwareModelId).name}, slot ${card.slotIndex + 1}`} tooltip="Drag onto a lane">
    <RackSlot hardwareModelId={card.hardwareModelId} width={180} />
  </RuneAction>;
}

/** A dashed lane that takes a dropped card. */
function DropLane({ target, cards, emptyLabel, onDrop }: { target: LaneTarget; cards: InstalledCard[]; emptyLabel: string; onDrop: (cardKey: string, target: LaneTarget) => void }) {
  return <RuneAction acceptDrop={(cardKey) => onDrop(cardKey, target)} label={`Lane ${target}`} gap={8} padding={8} minHeight={76} width={FULL} radius={12}
    border={{ width: 2, color: C.line }} items="start" justify="center" hover="#5fc2a80d">
    {cards.length === 0 ? <Text size={11} color="#f4ecdd66" align="center" grow={1}>{emptyLabel}</Text> : cards.map((card) => <ComputeChip key={card.key} card={card} />)}
  </RuneAction>;
}

/** An inset section with its eyebrow label and a figure on the right. */
function Section({ title, aside, highlight, children }: { title: string; aside?: ReactNode; highlight?: string | undefined; children: ReactNode }) {
  return <Panel shell="inset" width={FULL} {...(highlight === undefined ? {} : { border: { width: 2, color: highlight } })}>
    <Row justify="between" width={FULL}><Label>{title.toUpperCase()}</Label>{aside}</Row>
    {children}
  </Panel>;
}

function Token({ text, color }: { text: string; color: string }) {
  return <RuneView padding={[3, 8, 3, 8]} radius={999} fill={`${color}1f`}><Text size={10} weight={800} color={color}>{text}</Text></RuneView>;
}

/** One-of-many control: a row of segments, the active one lit. */
function Segments<T extends string>({ items, active, label, detail, runnable = () => true, onSelect }: {
  items: readonly T[]; active: T; label: (id: T) => string; detail: (id: T) => string; runnable?: (id: T) => string | null | true; onSelect: (id: T) => void;
}) {
  return <RuneView layout="row" gap={4} width={FULL}>{items.map((id) => {
    const on = id === active, ready = runnable(id);
    return <Button key={id} tone="chip" grow={1} minHeight={48} radius={10} disabled={on || ready !== true} fill={on ? C.teal : "#ffffff0d"} label={label(id)} onPress={() => onSelect(id)}>
      <RuneView items="center" gap={2}>
        <Text size={12} weight={800} color={on ? C.ink : C.cream}>{label(id)}</Text>
        <Text size={9} weight={700} color={on ? C.ink : C.muted}>{detail(id)}</Text>
        {ready === true ? null : <Text size={9} weight={700} color={C.coral}>{ready ?? ""}</Text>}
      </RuneView>
    </Button>;
  })}</RuneView>;
}

export function InferenceApp({
  racks,
  computeAssignments,
  onAssignCard,
  onUnassignCard,
  activeScrapeTier,
  scrapeSourceTokensPerToken,
  onSetScrapeTier,
  servingMode,
  onSetServingMode,
  userModels,
  onServeModel,
  onQuantizeModel,
  onQueueModelReveal,
  tutorialStarted,
  tutorialCompleted,
  tutorialStage,
}: InferenceAppProps) {
  const [detailModel, setDetailModel] = useState<GameUserModel | null>(null);
  const [detailBaseModelId, setDetailBaseModelId] = useState<string | null>(null);

  const installedCards = useMemo<InstalledCard[]>(() => {
    const cards: InstalledCard[] = [];
    for (const rack of racks) {
      const slots = getRackInstalledHardwareSlots(rack);
      slots.forEach((hardwareModelId, slotIndex) => {
        if (hardwareModelId === null) return;
        const key = assignmentKey(rack.id, slotIndex);
        const assignment = computeAssignments[key];
        cards.push({
          key,
          rackId: rack.id,
          slotIndex,
          hardwareModelId,
          lane: assignment?.lane ?? null,
          targetModelId: assignment?.targetModelId,
        });
      });
    }
    return cards;
  }, [racks, computeAssignments]);

  const undedicatedCards = useMemo(() => installedCards.filter((card) => card.lane === null), [installedCards]);
  const trainingCards = useMemo(() => installedCards.filter((card) => card.lane === "training"), [installedCards]);
  const scrapingCards = useMemo(() => installedCards.filter((card) => card.lane === "scraping"), [installedCards]);
  const servingCardsByModel = useMemo(() => {
    const map = new Map<string, InstalledCard[]>();
    for (const card of installedCards) {
      if (card.lane === "serving" && card.targetModelId) {
        const list = map.get(card.targetModelId) ?? [];
        list.push(card);
        map.set(card.targetModelId, list);
      }
    }
    return map;
  }, [installedCards]);

  const assignmentStats = useMemo(
    () => computeAssignmentStats(placedRackAssignmentInputs(racks), computeAssignments),
    [racks, computeAssignments],
  );

  const servingModels = useMemo(() => userModels.filter((model) => model.launchState === "serving"), [userModels]);

  const byKey = useMemo(() => new Map(installedCards.map((card) => [card.key, card])), [installedCards]);
  const assign = (card: InstalledCard, target: LaneTarget) => {
    if (target === "undedicated") onUnassignCard(card.rackId, card.slotIndex);
    else if (target === "lane:training") onAssignCard(card.rackId, card.slotIndex, "training");
    else if (target === "lane:scraping") onAssignCard(card.rackId, card.slotIndex, "scraping");
    else onAssignCard(card.rackId, card.slotIndex, "serving", target.slice("serving:".length) as Id<"models">);
  };
  const drop = (cardKey: string, target: LaneTarget) => { const card = byKey.get(cardKey); if (card !== undefined) assign(card, target); };
  const tutorialOn = tutorialStarted && !tutorialCompleted;
  const scrapeTflops = assignmentStats.scraping.tflops;
  const jobOf = (card: InstalledCard): LaneTarget => card.lane === "serving" ? `serving:${card.targetModelId ?? ""}` : card.lane === "training" ? "lane:training" : card.lane === "scraping" ? "lane:scraping" : "undedicated";
  const jobs: { target: LaneTarget; name: string }[] = [
    { target: "undedicated", name: "Available" }, { target: "lane:training", name: "Train models" }, { target: "lane:scraping", name: "Collect data" },
    ...servingModels.map((model) => ({ target: `serving:${model.id}` as LaneTarget, name: `Serve ${model.name}` })),
  ];

  return <Stack width={FULL} gap={16}>
    <Section title="Available GPUs" aside={<Label>{`${undedicatedCards.length} UNDEDICATED`}</Label>}>
      <Muted size={11}>Choose a job for each GPU below, or drag its card onto a lane. Each GPU works on one job at a time.</Muted>
      <DropLane target="undedicated" cards={undedicatedCards} emptyLabel="Every installed GPU is dedicated." onDrop={drop} />
      {installedCards.map((card) => {
        const name = `${getHardwareDefinition(card.hardwareModelId).name} · slot ${card.slotIndex + 1}`;
        const current = jobOf(card);
        return <RuneView key={card.key} gap={6} padding={8} radius={12} fill="#ffffff0d" width={FULL}>
          <Text size={12} weight={700}>{name}</Text>
          <RuneView layout="row" gap={4} width={FULL}>{jobs.map((job) => <Button key={job.target} tone="chip" grow={1} minHeight={32} disabled={current === job.target}
            fill={current === job.target ? C.teal : "#ffffff0d"} label={`${job.name} for ${name}`} onPress={() => assign(card, job.target)}>
            <Text size={11} weight={800} color={current === job.target ? C.ink : C.cream}>{job.name}</Text>
          </Button>)}</RuneView>
        </RuneView>;
      })}
    </Section>

    <Section title="Training" aside={<Token text={`${Math.round(assignmentStats.training.tflops)} TFLOPS`} color={C.teal} />}>
      <Muted size={11}>GPUs here train your base model — more TFLOPs, faster runs.</Muted>
      <DropLane target="lane:training" cards={trainingCards} emptyLabel="Drag a GPU here to train." onDrop={drop} />
    </Section>

    <Section title="Collect data" aside={<Token text={`${Math.round(scrapeTflops)} TFLOPS`} color={C.amber} />} highlight={tutorialOn && tutorialStage === "scrape_tokens" ? C.amber : undefined}>
      {tutorialOn && tutorialStage === "scrape_tokens" ? <Text size={12} color={C.amber}>Collect data to train your first model. Assign a GPU below and tokens arrive automatically.</Text> : null}
      <Segments items={SCRAPE_TIER_LIST.map((tier) => tier.id)} active={activeScrapeTier}
        label={(id) => getScrapeTierDef(id).label}
        detail={(id) => `+${computeScrapeTokensPerProc(id, scrapeTflops, scrapeSourceTokensPerToken)} / ${SCRAPE_TICK_INTERVAL_MS / 1000}s`}
        runnable={(id) => isScrapeTierRunnable(id, scrapeTflops) ? true : `Needs ${getScrapeTierDef(id).tflopThreshold} scraping TFLOPS`}
        onSelect={onSetScrapeTier} />
      <Muted size={10}>{getScrapeTierDef(activeScrapeTier).description}</Muted>
      <DropLane target="lane:scraping" cards={scrapingCards} emptyLabel="Drag a GPU here to scrape data tokens." onDrop={drop} />
    </Section>

    <Section title="Serving">
      <Muted size={11}>Serve a model in the deck below, then drag GPUs onto it here — its VRAM and TFLOPs come only from the cards you dedicate to it.</Muted>
      {servingModels.length === 0 ? <Panel shell="inset" items="center" padding={20}><Muted size={13}>No models are serving yet. Reveal and serve a model in the deck below.</Muted></Panel>
        : servingModels.map((model) => {
          const stats = assignmentStats.servingByModel.get(model.id);
          const vram = stats?.vramGb ?? 0, tflops = stats?.tflops ?? 0, fits = vram + 1e-6 >= model.footprintGb;
          return <Stack key={model.id} gap={6} width={FULL}>
            <Row justify="between" width={FULL}>
              <Text size={12} weight={800}>{model.name}</Text>
              <Row gap={6}><Token text={`${Math.round(tflops)} TFLOPS`} color={C.teal} /><Token text={`${Math.round(vram)}/${Math.round(model.footprintGb)} GB`} color={fits ? C.creamDim : C.coral} /></Row>
            </Row>
            <DropLane target={`serving:${model.id}`} cards={servingCardsByModel.get(model.id) ?? []} emptyLabel="Drag a GPU here to serve this model." onDrop={drop} />
            {fits ? null : <Text size={12} color={C.coral} role="status">{`Needs ${(model.footprintGb - vram).toFixed(1)} GB more GPU memory to earn income. Assign another GPU or choose a supported lower precision.`}</Text>}
          </Stack>;
        })}
    </Section>

    <Section title="Serving mode" aside={<Label>{SERVING_MODE_PROFILES[servingMode].latencyLabel}</Label>}>
      <Segments items={SERVING_MODE_VALUES} active={servingMode} label={(mode) => SERVING_MODE_PROFILES[mode].label}
        detail={(mode) => `${SERVING_MODE_PROFILES[mode].throughputMult.toFixed(1)}× tok · ${SERVING_MODE_PROFILES[mode].revenueMult.toFixed(2)}× $`} onSelect={onSetServingMode} />
      <Muted size={10}>{SERVING_MODE_PROFILES[servingMode].description}</Muted>
    </Section>

    <Row justify="between" width={FULL}><Label>MODEL DECK</Label><Label>{`${userModels.length} TOTAL`}</Label></Row>
    {userModels.length === 0 ? <Panel shell="inset" items="center" padding={20}><Muted size={13}>Trained models land here when they are ready to reveal or deploy.</Muted></Panel>
      : userModels.map((model) => {
        const point = tutorialOn && ((!model.isRevealed && tutorialStage === "reveal_model") || (model.isRevealed && tutorialStage === "serve" && model.launchState !== "serving"));
        return <RuneView key={model.id} width={FULL} radius={18} {...(point ? { border: { width: 2, color: C.teal }, padding: 2 } : {})}>
          {!model.isRevealed ? <UnknownModelCard name={model.name} qualityTier={model.qualityTier} onReveal={() => onQueueModelReveal({
            modelId: model.id, name: model.name, qualityTier: model.qualityTier, trainingVolumeLabel: userModelTrainingVolumeLabel(model), baseModelId: model.baseModelId,
            moneyPerToken: model.moneyPerToken, tokensPerSecond: model.tokensPerSecond, tokensPerToken: model.tokensPerToken, tflopsUsed: model.tflopsUsed,
            estimatedIncomePerSecond: model.estimatedIncomePerSecond, trainingDataTokens: model.trainingDataTokens,
          })} /> : <RevealedModelCard model={model} onServe={() => void onServeModel(model.id)} onViewBaseModel={setDetailBaseModelId} onViewUserModel={() => setDetailModel(model)} />}
        </RuneView>;
      })}

    {detailBaseModelId === null ? null : <ModelDetailView baseModelId={detailBaseModelId} initialMode="base" onClose={() => setDetailBaseModelId(null)} />}
    {detailModel === null ? null : <ModelDetailView userModel={detailModel} baseModelId={detailModel.baseModelId} initialMode="user" onQuantizeModel={onQuantizeModel}
      onClose={() => setDetailModel(null)} onViewBaseModel={(id) => { setDetailModel(null); setDetailBaseModelId(id); }} />}
  </Stack>;
}
