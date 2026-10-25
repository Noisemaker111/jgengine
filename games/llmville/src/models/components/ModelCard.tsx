/**
 * ModelCard — matches the mock: dark purple/indigo bg, label-left bar-right layout,
 * three stat bars (money/M, TPS per 1 TFLOP, data tokens per inference token), state-specific action button.
 * Uses real model stats when available.
 */

import type { BaseModelLibraryEntry } from "@/models/training";
import { getBaseModelBaselineStatsById, MODEL_ACTION_KIND } from "@/models/training";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import {
  benchmarkToBarValue,
  dataTokenRateToBarValue,
  formatHourlyIncome,
  formatModelQualityTierLabel,
  tpsToBarValue,
  type GameUserModel,
  userModelTrainingVolumeLabel,
} from "@/models/models";

import { CARD_VARIANT, Card } from "@/components/ui/card";
import { MODEL_CARD_ACTION_VARIANT, ModelCardAction } from "@/models/components/ModelCardAction";
import { getDeltaFillOpacity, ModelStatRow, ModelTrainingDurationEstimate } from "@/models/components/ModelPresentation";
import { formatTrainingDurationLabel } from "@llmville/game/models/trainingDurationLabel";

const CARD_BASE = "mb-4 flex h-[145px] gap-4 overflow-hidden relative";

/** State A: base model — card shows catalog hint seconds; live duration uses data drain or distill pool vs TPS×TFLOPs */
export function BaseModelCard({
  model,
  justUnlocked,
  onPrimaryAction,
  onViewDetail,
  trainingSecondsRemaining,
  estimatedTrainingDurationSeconds,
}: {
  model: BaseModelLibraryEntry;
  justUnlocked?: boolean;
  onPrimaryAction: () => void;
  onViewDetail?: (baseModelId: string) => void;
  /** When this base model is currently being trained, seconds until completion */
  trainingSecondsRemaining?: number | null;
  /** Live preview from installed GPUs and site throttle (replaces static catalog hint). */
  estimatedTrainingDurationSeconds?: number;
}) {
  const isTrainingThisModel = trainingSecondsRemaining != null;
  return (
    <Card
      variant="model-report"
      header="Lab Report"
      className={`${CARD_BASE} ${justUnlocked ? "animate-unlock-success" : ""}`}
      data-just-unlocked={justUnlocked ? "true" : undefined}
    >
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0">
        <div>
          <h3
            className={`font-game text-2xl font-bold text-brand-cream italic tracking-tight leading-none ${onViewDetail ? "cursor-pointer underline hover:text-brand-teal transition-colors" : ""}`}
            onClick={() => onViewDetail?.(model.id)}
            role={onViewDetail ? "button" : undefined}
          >
            {model.name}
          </h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-cream/45 leading-none">
            {model.sourceType === "closed_source" ? "Closed Source" : "Open Source"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 mt-2">
          <div className="space-y-0">
            <ModelStatRow
              color="green"
              value={benchmarkToBarValue(model.benchmarkScore ?? 50)}
              label={`${model.benchmarkScore ?? 50} quality`}
              title="Benchmark score"
            />
            <ModelStatRow
              color="yellow"
              value={tpsToBarValue(model.tokensPerSecond)}
              label={`${model.tokensPerSecond} tok/s`}
              title="Serving speed"
            />
            <ModelStatRow
              color="blue"
              value={dataTokenRateToBarValue(model.tokensPerToken)}
              label={`${model.tokensPerToken} data/token`}
              title="Data yield per inference token"
            />
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {model.actionKind === "train" && !isTrainingThisModel && (
              <>
                {estimatedTrainingDurationSeconds !== undefined && (
                  <ModelTrainingDurationEstimate estimatedSeconds={estimatedTrainingDurationSeconds} />
                )}
                <ModelCardAction
                  variant={MODEL_CARD_ACTION_VARIANT.train}
                  label={model.actionLabel}
                  disabled={!model.canTrain}
                  onClick={onPrimaryAction}
                />
              </>
            )}
            {model.actionKind === "unlock" && (
              <ModelCardAction
                variant={MODEL_CARD_ACTION_VARIANT.unlock}
                label={model.actionLabel}
                disabled={!model.canUnlock}
                onClick={onPrimaryAction}
              />
            )}
            {model.actionKind === "scrape" && !isTrainingThisModel && (
              <ModelCardAction variant={MODEL_CARD_ACTION_VARIANT.progress} label={model.actionLabel} />
            )}
            {model.actionKind === MODEL_ACTION_KIND.serve_base && !isTrainingThisModel && (
              <ModelCardAction
                variant={MODEL_CARD_ACTION_VARIANT.serve}
                label={model.actionLabel}
                onServe={onPrimaryAction}
              />
            )}
            {model.actionKind === "locked" && !isTrainingThisModel && (
              <ModelCardAction variant={MODEL_CARD_ACTION_VARIANT.locked} label={model.actionLabel} />
            )}
            {isTrainingThisModel && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold uppercase tracking-wide text-brand-coral/90">Training</span>
                <span className="inline-flex items-center gap-1.5 font-game text-lg font-bold tabular-nums text-brand-coral">
                  {formatTrainingDurationLabel(trainingSecondsRemaining ?? 0)}
                </span>
              </div>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-cream/45">
              {isTrainingThisModel ? "In progress" : model.requirementText}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** State B: Unknown model — Reveal (trained, stats hidden) */
export function UnknownModelCard({
  qualityTier,
  onReveal,
}: {
  qualityTier?: GameUserModel["qualityTier"];
  onReveal: () => void;
}) {
  return (
    <Card variant={CARD_VARIANT.redacted} className={CARD_BASE}>
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0 relative z-[1]">
        <div>
          <h3 className="font-game text-2xl font-bold text-brand-cream/40 italic tracking-tight leading-none">Unknown Model</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-cream/45 leading-none">
            {qualityTier ? `${formatModelQualityTierLabel(qualityTier)} · Hidden stats` : "Hidden stats"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 mt-2">
          <div className="space-y-0">
            <ModelStatRow color="green" value={0} label="???" hidden />
            <ModelStatRow color="yellow" value={0} label="???" hidden />
            <ModelStatRow color="blue" value={0} label="???" hidden />
          </div>
          <ModelCardAction variant={MODEL_CARD_ACTION_VARIANT.reveal} onReveal={onReveal} />
        </div>
      </div>
    </Card>
  );
}

/** State C & D: Revealed model — Serve or • serving */
export function RevealedModelCard({
  model,
  onServe,
  onViewBaseModel,
  onViewUserModel,
}: {
  model: GameUserModel;
  onServe: () => void;
  /** Called when base model link (e.g. Alpaca 1) is clicked — opens that model's page */
  onViewBaseModel?: (baseModelId: string) => void;
  /** Called when model name is clicked — opens your model's detail page */
  onViewUserModel?: () => void;
}) {
  const isServing = model.launchState === "serving";
  const tps = model.tokensPerSecond;
  const tpt = model.tokensPerToken;
  const hourlyIncome = formatHourlyIncome(model.estimatedIncomePerSecond);
  const [incomeValue, incomeUnit] = hourlyIncome.split('/');
  const baseModel = model.baseModelId ? getBaseModelDefinition(model.baseModelId) : undefined;
  const baseStats = getBaseModelBaselineStatsById(model.baseModelId);
  const baseTpsRef = baseModel?.tokensPerSecond ?? baseStats?.tokensPerSecond ?? 5;
  const tpsFillOpacity = baseStats == null ? 1 : getDeltaFillOpacity(tps - baseTpsRef, baseTpsRef);
  const baseLabel = baseModel?.name ?? model.baseModelId ?? "custom";
  const canViewBase = model.baseModelId !== undefined && onViewBaseModel !== undefined;
  const trainingVolumeLabel = userModelTrainingVolumeLabel(model);

  return (
    <Card variant="model-report" header="Deployed Model" className={CARD_BASE}>
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0">
        <div>
          <h3
            className={`truncate font-game text-2xl font-bold text-brand-cream italic tracking-tight leading-none ${
              onViewUserModel ? "cursor-pointer underline hover:text-brand-teal transition-colors" : ""
            }`}
            onClick={onViewUserModel}
            role={onViewUserModel ? "button" : undefined}
          >
            {model.name}
          </h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-cream/45 leading-none">
            {formatModelQualityTierLabel(model.qualityTier)} ·{" "}
            {canViewBase ? (
              <button
                onClick={() => onViewBaseModel(model.baseModelId!)}
                className="cursor-pointer underline transition-colors hover:text-brand-teal"
              >
                {baseLabel}
              </button>
            ) : (
              baseLabel
            )}{" "}
            · {trainingVolumeLabel}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 mt-2">
          <div className="space-y-0">
            <ModelStatRow
              color="green"
              value={benchmarkToBarValue(model.benchmarkScore)}
              label={`${model.benchmarkScore} quality`}
              title="Benchmark score"
            />
            <ModelStatRow
              color="yellow"
              value={tpsToBarValue(tps)}
              label={`${tps} tok/s`}
              fillOpacity={tpsFillOpacity}
              title="Serving speed"
            />
            <ModelStatRow
              color="blue"
              value={dataTokenRateToBarValue(tpt)}
              label={`${tpt} data/token`}
              title="Data yield per inference token"
            />
          </div>
          <div className="flex flex-col items-center justify-center gap-1 shrink-0">
            {isServing ? (
              <ModelCardAction variant={MODEL_CARD_ACTION_VARIANT.serving} />
            ) : (
              <ModelCardAction variant={MODEL_CARD_ACTION_VARIANT.serve} onServe={onServe} />
            )}
            <span className="font-game text-xl font-bold italic leading-none tracking-tight">
              <span className="text-brand-teal">{incomeValue}</span>
              <span className="text-brand-amber">/{incomeUnit}</span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
