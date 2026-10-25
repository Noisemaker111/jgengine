import { useEffect, useMemo, useState } from "react";

import { PANEL_VARIANT, Panel } from "@/components/ui/panel";
import type { BaseModelLibraryEntry } from "@/models/training";
import { ModelTrainingDurationEstimate } from "@/models/components/ModelPresentation";

export interface TrainDataCommitmentModalProps {
  model: BaseModelLibraryEntry;
  dataTokens: number;
  estimateTrainingDurationSeconds: (model: BaseModelLibraryEntry, overtrainBracket?: number) => number;
  onConfirm: (overtrainBracket: number) => void;
  onCancel: () => void;
}

/**
 * Fine-tune only: pick 1×–4× the base required data tokens, capped by wallet.
 * Full track shows 1×–4×; segments past what you can afford are grayed.
 */
export function TrainDataCommitmentModal({
  model,
  dataTokens,
  estimateTrainingDurationSeconds,
  onConfirm,
  onCancel,
}: TrainDataCommitmentModalProps) {
  const required = model.requiredDataTokens;
  const maxBrackets = 4;

  const maxAffordableBrackets = useMemo(() => {
    if (required <= 0) return 1;
    return Math.max(1, Math.min(maxBrackets, Math.floor(dataTokens / required)));
  }, [dataTokens, required]);

  const [bracket, setBracket] = useState(1);

  useEffect(() => {
    setBracket(1);
  }, [model.id]);

  useEffect(() => {
    setBracket((b) => Math.min(b, maxAffordableBrackets));
  }, [maxAffordableBrackets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const committed = required * bracket;
  const locked = maxAffordableBrackets <= 1;
  const estimatedDurationSeconds = estimateTrainingDurationSeconds(model, bracket);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="train-commitment-title"
      onClick={onCancel}
    >
      <Panel variant={PANEL_VARIANT.terminal} label={`Data commitment · ${model.name}`} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <p className="mt-1 text-xs leading-relaxed text-[#5fc2a8]/70">
          Choose how many data tokens to commit (1× to 4× the model minimum). Higher commitment boosts baselines before quality tier and per-stat rolls.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-brand-cream/45">
            <span>Min {required.toLocaleString()}</span>
            <span>Max {(required * maxBrackets).toLocaleString()} (4×)</span>
          </div>

          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3, 4].map((step) => {
              const affordable = step <= maxAffordableBrackets;
              const filled = affordable && step <= bracket;
              return (
                <div
                  key={step}
                  className={`game-resource-bar relative h-3 min-h-0 flex-1 overflow-hidden ${
                    affordable ? "" : "opacity-40"
                  }`}
                >
                  <div
                    className={`game-resource-fill absolute inset-y-0 left-0 transition-all duration-200 ${
                      filled ? "w-full" : "w-0"
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between px-0.5 text-[10px] font-semibold tabular-nums text-brand-cream/45">
            <span>1×</span>
            <span>2×</span>
            <span>3×</span>
            <span>4×</span>
          </div>

          <div className="relative pt-1">
            <input
              type="range"
              className="h-8 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              style={{ accentColor: "var(--brand-teal)" }}
              min={1}
              max={maxAffordableBrackets}
              step={1}
              value={Math.min(bracket, maxAffordableBrackets)}
              disabled={locked}
              onChange={(e) => setBracket(Number(e.target.value))}
              aria-valuemin={1}
              aria-valuemax={maxAffordableBrackets}
              aria-valuenow={bracket}
              aria-label="Training data commitment multiplier"
            />
          </div>

          <p className="text-center text-sm font-bold tabular-nums text-brand-teal">
            {committed.toLocaleString()} data tokens
            <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-brand-cream/45">
              ({bracket}× minimum)
            </span>
          </p>
          <div className="flex justify-center pt-1">
            <ModelTrainingDurationEstimate estimatedSeconds={estimatedDurationSeconds} />
          </div>
          {dataTokens < committed ? (
            <p role="status" className="text-center text-xs text-brand-coral">Collect {Math.ceil(committed - dataTokens).toLocaleString()} more data tokens before training.</p>
          ) : !Number.isFinite(estimatedDurationSeconds) ? (
            <p role="status" className="text-center text-xs text-brand-coral">Assign a GPU to Training in GPU jobs before starting.</p>
          ) : locked && (
            <p className="text-center text-[11px] text-brand-cream/45">
              Your balance covers a 1× training run. Collect more data to increase it.
            </p>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className="game-button game-button-secondary game-button-compact flex-1">
            Cancel
          </button>
          <button
            type="button"
            disabled={dataTokens < committed || !Number.isFinite(estimatedDurationSeconds)}
            onClick={() => onConfirm(bracket)}
            className="game-button game-button-primary game-button-compact flex-1 disabled:opacity-40"
          >
            Start training
          </button>
        </div>
      </Panel>
    </div>
  );
}
