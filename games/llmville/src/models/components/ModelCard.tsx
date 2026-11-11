/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * The model report cards: name and source on top, three stat bars (quality, serving speed, data
 * yield) and a state-specific action on the right. Uses real model stats when available.
 */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";

import type { BaseModelLibraryEntry } from "../training";
import { getBaseModelBaselineStatsById, MODEL_ACTION_KIND } from "../training";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import {
  benchmarkToBarValue,
  dataTokenRateToBarValue,
  formatHourlyIncome,
  formatModelQualityTierLabel,
  tpsToBarValue,
  type GameUserModel,
  userModelTrainingVolumeLabel,
} from "../models";
import { formatTrainingDurationLabel } from "@llmville/game/models/trainingDurationLabel";

import { DISPLAY } from "../../ui/theme";
import { C, FULL, Label, Row, Text } from "../../ui/kit";
import { MODEL_CARD_ACTION_VARIANT, ModelCardAction } from "./ModelCardAction";
import { getDeltaFillOpacity, ModelStatRow, ModelTrainingDurationEstimate } from "./ModelPresentation";

/** The card's frame: a report sheet with the name, the stats and the action column. */
function ReportCard({ title, subtitle, onTitle, titleColor = C.cream, highlight = false, glow = false, stats, action }: {
  title: string; subtitle: ReactNode; onTitle?: (() => void) | undefined; titleColor?: string; highlight?: boolean; glow?: boolean; stats: ReactNode; action: ReactNode;
}) {
  const name = <Text family={DISPLAY} size={24} weight={800} color={titleColor}>{title}</Text>;
  return <RuneView variant="panel" padding={16} gap={10} width={FULL} radius={16} minHeight={145}
    border={{ width: highlight || glow ? 2 : 1, color: highlight ? C.teal : glow ? C.amber : "#f4ecdd26" }}>
    <RuneView gap={4}>
      {onTitle === undefined ? name : <RuneAction label={`Details for ${title}`} run={onTitle} variant="link">{name}</RuneAction>}
      {subtitle}
    </RuneView>
    <Row justify="between" items="end" gap={16} width={FULL}>
      <RuneView grow={1} shrink gap={4}>{stats}</RuneView>
      <RuneView items="end" gap={4}>{action}</RuneView>
    </Row>
  </RuneView>;
}

/** State A: base model — train, license, scrape progress, serve the base or locked. */
export function BaseModelCard({ model, justUnlocked, highlight = false, onPrimaryAction, onViewDetail, trainingSecondsRemaining, estimatedTrainingDurationSeconds }: {
  model: BaseModelLibraryEntry;
  justUnlocked?: boolean;
  /** The tutorial points at this card. */
  highlight?: boolean;
  onPrimaryAction: () => void;
  onViewDetail?: (baseModelId: string) => void;
  /** When this base model is currently being trained, seconds until completion */
  trainingSecondsRemaining?: number | null;
  /** Live preview from installed GPUs and site throttle (replaces static catalog hint). */
  estimatedTrainingDurationSeconds?: number | undefined;
}) {
  const training = trainingSecondsRemaining != null;
  return <ReportCard title={model.name} highlight={highlight} glow={justUnlocked === true}
    onTitle={onViewDetail === undefined ? undefined : () => onViewDetail(model.id)}
    subtitle={<Label size={11}>{model.sourceType === "closed_source" ? "CLOSED SOURCE" : "OPEN SOURCE"}</Label>}
    stats={<>
      <ModelStatRow color="green" value={benchmarkToBarValue(model.benchmarkScore ?? 50)} label={`${model.benchmarkScore ?? 50} quality`} title="Benchmark score" />
      <ModelStatRow color="yellow" value={tpsToBarValue(model.tokensPerSecond)} label={`${model.tokensPerSecond} tok/s`} title="Serving speed" />
      <ModelStatRow color="blue" value={dataTokenRateToBarValue(model.tokensPerToken)} label={`${model.tokensPerToken} data/token`} title="Data yield per inference token" />
    </>}
    action={<>
      {model.actionKind === "train" && !training ? <>
        {estimatedTrainingDurationSeconds === undefined ? null : <ModelTrainingDurationEstimate estimatedSeconds={estimatedTrainingDurationSeconds} />}
        <ModelCardAction model={model.name} variant={MODEL_CARD_ACTION_VARIANT.train} label={model.actionLabel} disabled={!model.canTrain} onClick={onPrimaryAction} />
      </> : null}
      {model.actionKind === "unlock" ? <ModelCardAction model={model.name} variant={MODEL_CARD_ACTION_VARIANT.unlock} label={model.actionLabel} disabled={!model.canUnlock} onClick={onPrimaryAction} /> : null}
      {model.actionKind === "scrape" && !training ? <ModelCardAction model={model.name} variant={MODEL_CARD_ACTION_VARIANT.progress} label={model.actionLabel} /> : null}
      {model.actionKind === MODEL_ACTION_KIND.serve_base && !training ? <ModelCardAction model={model.name} variant={MODEL_CARD_ACTION_VARIANT.serve} label={model.actionLabel} onServe={onPrimaryAction} /> : null}
      {model.actionKind === "locked" && !training ? <ModelCardAction model={model.name} variant={MODEL_CARD_ACTION_VARIANT.locked} label={model.actionLabel} /> : null}
      {training ? <RuneView items="end">
        <Label size={10} color={C.coral}>TRAINING</Label>
        <Text family={DISPLAY} size={18} weight={800} color={C.coral}>{formatTrainingDurationLabel(trainingSecondsRemaining ?? 0)}</Text>
      </RuneView> : null}
      <Label size={11}>{(training ? "In progress" : model.requirementText).toUpperCase()}</Label>
    </>} />;
}

/** State B: Unknown model — Reveal (trained, stats hidden) */
export function UnknownModelCard({ name = "Unknown Model", qualityTier, onReveal }: { name?: string; qualityTier?: GameUserModel["qualityTier"]; onReveal: () => void }) {
  return <ReportCard title="Unknown Model" titleColor="#f4ecdd66"
    subtitle={<Label size={11}>{(qualityTier ? `${formatModelQualityTierLabel(qualityTier)} · Hidden stats` : "Hidden stats").toUpperCase()}</Label>}
    stats={<>
      <ModelStatRow color="green" value={0} label="???" hidden />
      <ModelStatRow color="yellow" value={0} label="???" hidden />
      <ModelStatRow color="blue" value={0} label="???" hidden />
    </>}
    action={<ModelCardAction model={name} variant={MODEL_CARD_ACTION_VARIANT.reveal} onReveal={onReveal} />} />;
}

/** State C & D: Revealed model — Serve or • serving */
export function RevealedModelCard({ model, onServe, onViewBaseModel, onViewUserModel }: {
  model: GameUserModel;
  onServe: () => void;
  /** Opens the base model's page. */
  onViewBaseModel?: (baseModelId: string) => void;
  /** Opens your model's detail page. */
  onViewUserModel?: () => void;
}) {
  const isServing = model.launchState === "serving";
  const tps = model.tokensPerSecond;
  const [incomeValue, incomeUnit] = formatHourlyIncome(model.estimatedIncomePerSecond).split("/");
  const baseModel = model.baseModelId ? getBaseModelDefinition(model.baseModelId) : undefined;
  const baseStats = getBaseModelBaselineStatsById(model.baseModelId);
  const baseTpsRef = baseModel?.tokensPerSecond ?? baseStats?.tokensPerSecond ?? 5;
  const tpsFillOpacity = baseStats == null ? 1 : getDeltaFillOpacity(tps - baseTpsRef, baseTpsRef);
  const baseLabel = baseModel?.name ?? model.baseModelId ?? "custom";
  const baseId = model.baseModelId;
  const tier = formatModelQualityTierLabel(model.qualityTier).toUpperCase();
  const volume = userModelTrainingVolumeLabel(model).toUpperCase();
  return <ReportCard title={model.name} onTitle={onViewUserModel}
    subtitle={baseId !== undefined && onViewBaseModel !== undefined
      ? <Row gap={4}><Label size={11}>{`${tier} ·`}</Label><RuneAction variant="link" label={`Base model ${baseLabel}`} run={() => onViewBaseModel(baseId)}><Label size={11} color={C.teal}>{baseLabel.toUpperCase()}</Label></RuneAction><Label size={11}>{`· ${volume}`}</Label></Row>
      : <Label size={11}>{`${tier} · ${baseLabel.toUpperCase()} · ${volume}`}</Label>}
    stats={<>
      <ModelStatRow color="green" value={benchmarkToBarValue(model.benchmarkScore)} label={`${model.benchmarkScore} quality`} title="Benchmark score" />
      <ModelStatRow color="yellow" value={tpsToBarValue(tps)} label={`${tps} tok/s`} fillOpacity={tpsFillOpacity} title="Serving speed" />
      <ModelStatRow color="blue" value={dataTokenRateToBarValue(model.tokensPerToken)} label={`${model.tokensPerToken} data/token`} title="Data yield per inference token" />
    </>}
    action={<>
      {isServing ? <ModelCardAction model={model.name} variant={MODEL_CARD_ACTION_VARIANT.serving} /> : <ModelCardAction model={model.name} variant={MODEL_CARD_ACTION_VARIANT.serve} onServe={onServe} />}
      <Row gap={0}><Text family={DISPLAY} size={20} weight={800} color={C.teal}>{incomeValue ?? ""}</Text><Text family={DISPLAY} size={20} weight={800} color={C.amber}>{`/${incomeUnit ?? ""}`}</Text></Row>
    </>} />;
}
