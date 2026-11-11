/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { formatBaseModelTrainingVolumeLabel, getBaseModelDefinition, type BaseModelDefinition } from "@llmville/game/models/baseModels";
import { getQuantizationProfile } from "@llmville/game/models/quantization";
import { computeBenchmarkDemandMultiplier } from "@llmville/game/models/servingStats";
import { COMPUTE_PRECISION_VALUES, type ComputePrecision } from "@llmville/game/infrastructure/catalog";
import { formatTrainingDurationLabel } from "@llmville/game/models/trainingDurationLabel";
import {
  dataTokenRateToBarValue,
  formatHourlyIncome,
  formatModelQualityTierLabel,
  moneyPerTokenToPmt,
  priceToBarValue,
  tpsToBarValue,
  type GameUserModel,
  userModelTrainingVolumeLabel,
} from "../models";
import { getBaseModelBaselineStatsById } from "../training";
import { DISPLAY } from "../../ui/theme";
import { Button, C, FULL, Label, Muted, Panel, Row, Sheet, Stack, Text } from "../../ui/kit";
import { getDeltaFillOpacity, ModelStatRow } from "./ModelPresentation";

export type ModelDetailViewMode = "base" | "user";

export interface ModelDetailViewProps {
  baseModelId?: string | null | undefined;
  userModel?: GameUserModel | null;
  initialMode: ModelDetailViewMode;
  estimatedTrainingDurationSeconds?: number | undefined;
  onClose: () => void;
  onViewBaseModel?: (baseModelId: string) => void;
  onQuantizeModel?: (modelId: GameUserModel["id"], precision: ComputePrecision) => void | Promise<unknown> | undefined;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <Row justify="between" width={FULL} padding={[8, 0, 8, 0]}>
    <Label size={11}>{label.toUpperCase()}</Label>
    <Text size={13} weight={800}>{value}</Text>
  </Row>;
}

function Heading({ name, subtitle }: { name: string; subtitle: string }) {
  return <RuneView gap={4}>
    <Text family={DISPLAY} size={24} weight={800}>{name.toUpperCase()}</Text>
    <Label size={11}>{subtitle.toUpperCase()}</Label>
  </RuneView>;
}

function BaseModelSection({ baseModel, estimatedTrainingDurationSeconds }: { baseModel: BaseModelDefinition; estimatedTrainingDurationSeconds?: number | undefined }) {
  const durationLabel = estimatedTrainingDurationSeconds !== undefined
    ? `~${formatTrainingDurationLabel(estimatedTrainingDurationSeconds)} (your GPUs)`
    : `${Math.round(baseModel.trainingDurationMs / 1000)}s catalog hint`;
  const pmt = moneyPerTokenToPmt(baseModel.moneyPerToken);
  return <>
    <Panel shell="inset">
      <Heading name={baseModel.name} subtitle={`${baseModel.tier === "community" ? "Community" : formatModelQualityTierLabel(baseModel.tier)} · ${formatBaseModelTrainingVolumeLabel(baseModel)}`} />
      <ModelStatRow color="green" value={priceToBarValue(pmt)} label={`$${pmt}/M`} />
      <ModelStatRow color="yellow" value={tpsToBarValue(baseModel.tokensPerSecond)} label={`${baseModel.tokensPerSecond} TPS`} title="Throughput per 1 TFLOP of inference" />
      <ModelStatRow color="blue" value={dataTokenRateToBarValue(baseModel.tokensPerToken)} label={`${baseModel.tokensPerToken} data/token`} />
    </Panel>
    <Panel shell="inset" gap={0}>
      <InfoRow label="Creator" value={baseModel.creator} />
      <InfoRow label="Training time" value={durationLabel} />
      <InfoRow label="Source" value={baseModel.sourceType === "closed_source" ? "Closed Source" : "Open Source"} />
      <InfoRow label="Method" value={baseModel.trainingMethod === "distill" ? "Distillation" : "Fine-tuning"} />
      <InfoRow label="Data tokens required" value={baseModel.requiredDataTokens.toLocaleString()} />
      {baseModel.licenseCost > 0 ? <InfoRow label="License" value={`$${baseModel.licenseCost.toLocaleString()} (one-time)`} /> : null}
      {baseModel.distillPoolTokens != null ? <InfoRow label="Distill pool" value={`${baseModel.distillPoolTokens.toLocaleString()} inference tokens`} /> : null}
      {baseModel.vendorHourlyUsd != null ? <InfoRow label="Vendor access" value={`$${baseModel.vendorHourlyUsd}/hr while distilling`} /> : null}
      {baseModel.availability === "research_locked" ? <InfoRow label="Status" value="Research locked" /> : null}
      {baseModel.description ? <Muted size={12} padding={[10, 0, 0, 0]}>{baseModel.description}</Muted> : null}
    </Panel>
  </>;
}

function UserModelSection({ model, baseModel, baseModelId, onViewBaseModel, onQuantizeModel }: {
  model: GameUserModel;
  baseModel?: BaseModelDefinition | undefined;
  baseModelId?: string | null | undefined;
  onViewBaseModel?: ((baseModelId: string) => void) | undefined;
  onQuantizeModel?: ((modelId: GameUserModel["id"], precision: ComputePrecision) => void | Promise<unknown> | undefined) | undefined;
}) {
  const pmt = moneyPerTokenToPmt(model.moneyPerToken);
  const tps = model.tokensPerSecond;
  const [incomeValue, incomeUnit] = formatHourlyIncome(model.estimatedIncomePerSecond).split("/");
  const baseStats = getBaseModelBaselineStatsById(baseModelId ?? model.baseModelId);
  const baseTpsRef = baseModel?.tokensPerSecond ?? baseStats?.tokensPerSecond ?? 5;
  const tpsFillOpacity = baseStats == null ? 1 : getDeltaFillOpacity(tps - baseTpsRef, baseTpsRef);
  const serving = model.launchState === "serving";
  const baseName = baseModel?.name ?? model.baseModelId ?? "custom";
  return <>
    <Panel shell="inset">
      <Heading name={model.name} subtitle={`${formatModelQualityTierLabel(model.qualityTier)} · ${baseName} · ${userModelTrainingVolumeLabel(model)}`} />
      {baseModel && baseModelId && onViewBaseModel ? <RuneAction variant="link" label={`Base model ${baseModel.name}`} run={() => onViewBaseModel(baseModelId)}>
        <Text size={12} weight={800} color={C.teal}>{`Open ${baseModel.name} ›`}</Text>
      </RuneAction> : null}
      <Row justify="between" items="end" width={FULL} gap={16}>
        <RuneView grow={1} shrink gap={4}>
          <ModelStatRow color="green" value={priceToBarValue(pmt)} label={`$${pmt}/M`} />
          <ModelStatRow color="yellow" value={tpsToBarValue(tps)} label={`${tps} TPS`} fillOpacity={tpsFillOpacity} title="Per 1 TFLOP of inference" />
          <ModelStatRow color="blue" value={dataTokenRateToBarValue(model.tokensPerToken)} label={`${model.tokensPerToken} data/token`} />
        </RuneView>
        <RuneView items="center" gap={4}>
          <Label color={serving ? C.teal : C.amber}>{serving ? "SERVING" : "OWNED"}</Label>
          <Row gap={0}><Text family={DISPLAY} size={20} weight={800} color={C.teal}>{incomeValue ?? ""}</Text><Text family={DISPLAY} size={20} weight={800} color={C.amber}>{`/${incomeUnit ?? ""}`}</Text></Row>
        </RuneView>
      </Row>
    </Panel>
    <Panel shell="inset" gap={0}>
      {baseModel ? <InfoRow label="Based on" value={baseModel.name} /> : null}
      {baseModel ? <InfoRow label="Creator" value={baseModel.creator} /> : null}
      <InfoRow label="Rarity" value={formatModelQualityTierLabel(model.qualityTier)} />
      <InfoRow label="Hours served" value="—" />
      {model.trainingDataTokens != null ? <InfoRow label="Tokens used" value={model.trainingDataTokens.toLocaleString()} /> : null}
      {model.tflopsUsed != null ? <InfoRow label="TFLOPs used" value={String(model.tflopsUsed)} /> : null}
      <InfoRow label="Size" value={`${model.paramsB}B params`} />
      <InfoRow label="Benchmark" value={`${model.benchmarkScore} (${computeBenchmarkDemandMultiplier(model.benchmarkScore).toFixed(2)}× demand)`} />
      <InfoRow label="Precision" value={model.precisionLabel} />
      <InfoRow label="VRAM footprint" value={`${model.footprintGb.toFixed(1)} GB`} />
    </Panel>
    {onQuantizeModel ? <Panel shell="inset">
      <Label>QUANTIZE</Label>
      <Row gap={4} width={FULL}>{COMPUTE_PRECISION_VALUES.map((precision) => {
        const active = model.precision === precision;
        const name = getQuantizationProfile(precision).label.split(" ")[0] ?? precision;
        return <Button key={precision} tone="chip" grow={1} disabled={active} fill={active ? C.teal : "#ffffff0d"} label={`Quantize to ${name}`}
          onPress={() => { if (!active) void onQuantizeModel(model.id, precision); }}>
          <Text size={12} weight={800} color={active ? C.ink : C.cream}>{name}</Text>
        </Button>;
      })}</Row>
      <Muted size={11}>Lower precision shrinks VRAM and speeds throughput for a small quality hit. FP8/FP4 need capable hardware.</Muted>
    </Panel> : null}
  </>;
}

/** The lab terminal's model page: a base model's catalog entry, or one of your trained models. */
export function ModelDetailView({ baseModelId, userModel, initialMode, estimatedTrainingDurationSeconds, onClose, onViewBaseModel, onQuantizeModel }: ModelDetailViewProps) {
  const [mode, setMode] = useState<ModelDetailViewMode>(initialMode);
  const baseModel = baseModelId ? getBaseModelDefinition(baseModelId) : undefined;
  const viewBase = (id: string) => { if (onViewBaseModel) onViewBaseModel(id); else setMode("base"); };
  return <Sheet title={mode === "base" ? "Base model" : "Model details"} close={onClose} width={440}>
    <Stack gap={14} width={FULL}>
      {mode === "base" && baseModel ? <BaseModelSection baseModel={baseModel} estimatedTrainingDurationSeconds={estimatedTrainingDurationSeconds} />
        : userModel ? <UserModelSection model={userModel} baseModel={baseModel} baseModelId={baseModelId ?? userModel.baseModelId} onViewBaseModel={baseModelId ? viewBase : undefined} onQuantizeModel={onQuantizeModel} />
          : baseModel ? <BaseModelSection baseModel={baseModel} estimatedTrainingDurationSeconds={estimatedTrainingDurationSeconds} /> : null}
    </Stack>
  </Sheet>;
}
