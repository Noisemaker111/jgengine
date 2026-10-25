import { useEffect, useState } from "react";

import { InsetSection } from "@/components/ui/inset-section";
import { PANEL_VARIANT, Panel } from "@/components/ui/panel";
import { Token } from "@/components/ui/token";
import { cn } from "@/components/ui/cn";
import { formatBaseModelTrainingVolumeLabel } from "@llmville/game/models/baseModels";
import { getQuantizationProfile } from "@llmville/game/models/quantization";
import { computeBenchmarkDemandMultiplier } from "@llmville/game/models/servingStats";
import { COMPUTE_PRECISION_VALUES, type ComputePrecision } from "@llmville/game/infrastructure/catalog";
import { getDeltaFillOpacity, ModelStatRow } from "@/models/components/ModelPresentation";
import {
  dataTokenRateToBarValue,
  formatHourlyIncome,
  formatModelQualityTierLabel,
  moneyPerTokenToPmt,
  priceToBarValue,
  tpsToBarValue,
  type GameUserModel,
  userModelTrainingVolumeLabel,
} from "@/models/models";
import { formatTrainingDurationLabel } from "@llmville/game/models/trainingDurationLabel";
import { getBaseModelDefinition, type BaseModelDefinition } from "@llmville/game/models/baseModels";
import { getBaseModelBaselineStatsById } from "@/models/training";

export type ModelDetailViewMode = "base" | "user";

export interface ModelDetailViewProps {
  baseModelId?: string | null;
  userModel?: GameUserModel | null;
  initialMode: ModelDetailViewMode;
  estimatedTrainingDurationSeconds?: number;
  onClose: () => void;
  onViewBaseModel?: (baseModelId: string) => void;
  onQuantizeModel?: (modelId: GameUserModel["id"], precision: ComputePrecision) => void | Promise<unknown> | undefined;
}

const modalInsetClassName = "game-panel-surface game-panel-surface--inset p-4";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="game-divider flex items-center justify-between py-2 first:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-brand-cream/45">{label}</span>
      <span className="text-sm font-bold text-brand-cream">{value}</span>
    </div>
  );
}

function BaseModelSection({
  baseModel,
  estimatedTrainingDurationSeconds,
}: {
  baseModel: BaseModelDefinition;
  estimatedTrainingDurationSeconds?: number;
}) {
  const durationLabel =
    estimatedTrainingDurationSeconds !== undefined
      ? `~${formatTrainingDurationLabel(estimatedTrainingDurationSeconds)} (your GPUs)`
      : `${Math.round(baseModel.trainingDurationMs / 1000)}s catalog hint`;

  return (
    <>
      <div className={modalInsetClassName}>
        <div>
          <h2 className="font-game text-2xl font-bold uppercase italic leading-none tracking-tight text-brand-cream">
            {baseModel.name}
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide leading-none text-brand-cream/45">
            {baseModel.tier === "community" ? "Community" : formatModelQualityTierLabel(baseModel.tier)} ·{" "}
            {formatBaseModelTrainingVolumeLabel(baseModel)}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="space-y-0">
            <ModelStatRow color="green" value={priceToBarValue(moneyPerTokenToPmt(baseModel.moneyPerToken))} label={`$${moneyPerTokenToPmt(baseModel.moneyPerToken)}/M`} />
            <ModelStatRow color="yellow" value={tpsToBarValue(baseModel.tokensPerSecond)} label={`${baseModel.tokensPerSecond} TPS`} title="Throughput per 1 TFLOP of inference" />
            <ModelStatRow color="blue" value={dataTokenRateToBarValue(baseModel.tokensPerToken)} label={`${baseModel.tokensPerToken} data/token`} />
          </div>
        </div>
      </div>

      <InsetSection className="!gap-0 divide-y divide-[var(--surface-border)]">
        <InfoRow label="Creator" value={baseModel.creator} />
        <InfoRow label="Training time" value={durationLabel} />
        <InfoRow label="Source" value={baseModel.sourceType === "closed_source" ? "Closed Source" : "Open Source"} />
        <InfoRow label="Method" value={baseModel.trainingMethod === "distill" ? "Distillation" : "Fine-tuning"} />
        <InfoRow label="Data tokens required" value={baseModel.requiredDataTokens.toLocaleString()} />
        {baseModel.licenseCost > 0 && <InfoRow label="License" value={`$${baseModel.licenseCost.toLocaleString()} (one-time)`} />}
        {baseModel.distillPoolTokens != null && (
          <InfoRow label="Distill pool" value={`${baseModel.distillPoolTokens.toLocaleString()} inference tokens`} />
        )}
        {baseModel.vendorHourlyUsd != null && (
          <InfoRow label="Vendor access" value={`$${baseModel.vendorHourlyUsd}/hr while distilling`} />
        )}
        {baseModel.availability === "research_locked" && <InfoRow label="Status" value="Research locked" />}
        {baseModel.description && (
          <div className="game-divider pt-3">
            <p className="text-xs leading-relaxed text-brand-cream/45">{baseModel.description}</p>
          </div>
        )}
      </InsetSection>
    </>
  );
}

function UserModelSection({
  model,
  baseModel,
  baseModelId,
  onViewBaseModel,
  onQuantizeModel,
}: {
  model: GameUserModel;
  baseModel?: BaseModelDefinition;
  baseModelId?: string | null;
  onViewBaseModel?: (baseModelId: string) => void;
  onQuantizeModel?: (modelId: GameUserModel["id"], precision: ComputePrecision) => void | Promise<unknown> | undefined;
}) {
  const pmt = moneyPerTokenToPmt(model.moneyPerToken);
  const tps = model.tokensPerSecond;
  const tpt = model.tokensPerToken;
  const hourlyIncome = formatHourlyIncome(model.estimatedIncomePerSecond);
  const [incomeValue, incomeUnit] = hourlyIncome.split("/");
  const baseStats = getBaseModelBaselineStatsById(baseModelId ?? model.baseModelId);
  const baseTpsRef = baseModel?.tokensPerSecond ?? baseStats?.tokensPerSecond ?? 5;
  const tpsFillOpacity = baseStats == null ? 1 : getDeltaFillOpacity(tps - baseTpsRef, baseTpsRef);
  const trainingVolumeLabel = userModelTrainingVolumeLabel(model);

  return (
    <>
      <div className={modalInsetClassName}>
        <div>
          <h2 className="truncate font-game text-2xl font-bold uppercase italic leading-none tracking-tight text-brand-cream">
            {model.name}
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide leading-none text-brand-cream/45">
            {formatModelQualityTierLabel(model.qualityTier)} ·{" "}
            {baseModel && baseModelId && onViewBaseModel ? (
              <button
                type="button"
                onClick={() => onViewBaseModel(baseModelId)}
                className="cursor-pointer underline transition-colors hover:text-brand-teal"
              >
                {baseModel.name}
              </button>
            ) : (
              baseModel?.name ?? model.baseModelId ?? "custom"
            )}{" "}
            · {trainingVolumeLabel}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="space-y-0">
            <ModelStatRow color="green" value={priceToBarValue(pmt)} label={`$${pmt}/M`} />
            <ModelStatRow color="yellow" value={tpsToBarValue(tps)} label={`${tps} TPS`} fillOpacity={tpsFillOpacity} title="Per 1 TFLOP of inference" />
            <ModelStatRow color="blue" value={dataTokenRateToBarValue(tpt)} label={`${tpt} data/token`} />
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <Token tone={model.launchState === "serving" ? "teal" : "amber"}>
              {model.launchState === "serving" ? "Serving" : "Owned"}
            </Token>
            <span className="font-game text-xl font-bold italic leading-none tracking-tight">
              <span className="text-brand-teal">{incomeValue}</span>
              <span className="text-brand-amber">/{incomeUnit}</span>
            </span>
          </div>
        </div>
      </div>

      <InsetSection className="!gap-0">
        {baseModel && <InfoRow label="Based on" value={baseModel.name} />}
        {baseModel && <InfoRow label="Creator" value={baseModel.creator} />}
        <InfoRow label="Rarity" value={formatModelQualityTierLabel(model.qualityTier)} />
        <InfoRow label="Hours served" value="—" />
        {model.trainingDataTokens != null && <InfoRow label="Tokens used" value={model.trainingDataTokens.toLocaleString()} />}
        {model.tflopsUsed != null && <InfoRow label="TFLOPs used" value={String(model.tflopsUsed)} />}
        <InfoRow label="Size" value={`${model.paramsB}B params`} />
        <InfoRow label="Benchmark" value={`${model.benchmarkScore} (${computeBenchmarkDemandMultiplier(model.benchmarkScore).toFixed(2)}× demand)`} />
        <InfoRow label="Precision" value={model.precisionLabel} />
        <InfoRow label="VRAM footprint" value={`${model.footprintGb.toFixed(1)} GB`} />
      </InsetSection>

      {onQuantizeModel && (
        <InsetSection label="Quantize">
          <div className="game-control-group">
            {COMPUTE_PRECISION_VALUES.map((precision) => {
              const active = model.precision === precision;
              return (
                <button
                  key={precision}
                  type="button"
                  onClick={() => {
                    if (!active) onQuantizeModel(model.id, precision);
                  }}
                  disabled={active}
                  className={cn("game-control-segment", active && "game-control-segment-active")}
                >
                  {getQuantizationProfile(precision).label.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] leading-snug text-brand-cream/45">
            Lower precision shrinks VRAM and speeds throughput for a small quality hit. FP8/FP4 need capable hardware.
          </p>
        </InsetSection>
      )}
    </>
  );
}

export function ModelDetailView({
  baseModelId,
  userModel,
  initialMode,
  estimatedTrainingDurationSeconds,
  onClose,
  onViewBaseModel,
  onQuantizeModel,
}: ModelDetailViewProps) {
  const [mode, setMode] = useState<ModelDetailViewMode>(initialMode);

  const baseModel = baseModelId ? getBaseModelDefinition(baseModelId) : undefined;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleViewBase = (id: string) => {
    if (onViewBaseModel) {
      onViewBaseModel(id);
      return;
    }
    setMode("base");
  };

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Model details"
      onClick={onClose}
    >
      <Panel
        variant={PANEL_VARIANT.terminal}
        label={mode === "base" ? "Base model" : "Model details"}
        className="max-h-[90dvh] w-full max-w-[420px] overflow-y-auto scrollbar-none overscroll-contain"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 -mx-4 -mt-2 mb-2 flex items-center justify-between border-b border-[#243430] bg-[#0a1210] px-4 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5fc2a8]/70">Lab terminal</span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#5fc2a8]/50 transition-colors hover:text-[#5fc2a8]"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {mode === "base" && baseModel ? (
            <BaseModelSection
              baseModel={baseModel}
              estimatedTrainingDurationSeconds={estimatedTrainingDurationSeconds}
            />
          ) : userModel ? (
            <UserModelSection
              model={userModel}
              baseModel={baseModel}
              baseModelId={baseModelId ?? userModel.baseModelId}
              onViewBaseModel={baseModelId ? handleViewBase : undefined}
              onQuantizeModel={onQuantizeModel}
            />
          ) : baseModel ? (
            <BaseModelSection
              baseModel={baseModel}
              estimatedTrainingDurationSeconds={estimatedTrainingDurationSeconds}
            />
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
