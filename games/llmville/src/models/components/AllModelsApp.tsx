import { useEffect, useMemo, useState } from "react";

import type { BaseModelLibraryEntry } from "@/models/training";
import { MODEL_ACTION_KIND } from "@/models/training";
import type { TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import { TUTORIAL_SCRAPE_MODEL_ID, TUTORIAL_TRAIN_BASE_MODEL_ID } from "@llmville/game/tutorial/tutorialProgress";
import {
  estimatePostTrainingDurationSeconds,
  previewAvailableTrainingPowerFp16,
} from "@llmville/game/models/trainingTransition";
import { getFounderMultipliers } from "@llmville/game/user/founder";
import { usePlayerIdentity } from "@/auth";

import { BaseModelCard } from "@/models/components/ModelCard";
import { ModelDetailView } from "@/models/components/ModelDetailView";
import { TrainDataCommitmentModal } from "@/models/components/TrainDataCommitmentModal";

function useTrainingCountdownSeconds(isTraining: boolean, trainingEndsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isTraining || trainingEndsAt == null) return;
    setNow(Date.now());
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [isTraining, trainingEndsAt]);

  if (!isTraining || trainingEndsAt == null) return null;
  return Math.max(0, Math.ceil((trainingEndsAt - now) / 1000));
}

interface TrainingDurationPreviewInputs {
  trainingLaneTflops: number;
  thermalThrottle: number;
  powerThrottle: number;
}

interface AllModelsAppProps {
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialStage: TutorialStage;
  baseModelLibrary: readonly BaseModelLibraryEntry[];
  isTraining: boolean;
  trainingEndsAt: number | null;
  trainingBaseModelId: string | null;
  lastUnlockedBaseModelId: string | null;
  postTrainError: string | null;
  onDismissPostTrainError: () => void;
  dataTokens: number;
  trainingDurationPreview: TrainingDurationPreviewInputs;
  trainingDurationMultiplier: number;
  onStartPostTraining: (baseModelId: string, options?: { overtrainBracket?: number }) => void;
  onUnlockBaseModel: (baseModelId: string, amount?: number) => void;
  onLaunchLicensedBaseServe: (baseModelId: string) => void;
}

export function AllModelsApp({
  tutorialStarted,
  tutorialCompleted,
  tutorialStage,
  baseModelLibrary,
  isTraining,
  trainingEndsAt,
  trainingBaseModelId,
  lastUnlockedBaseModelId,
  postTrainError,
  onDismissPostTrainError,
  dataTokens,
  trainingDurationPreview,
  trainingDurationMultiplier,
  onStartPostTraining,
  onUnlockBaseModel,
  onLaunchLicensedBaseServe,
}: AllModelsAppProps) {
  const [detailBaseModelId, setDetailBaseModelId] = useState<string | null>(null);
  const [trainCommitModel, setTrainCommitModel] = useState<BaseModelLibraryEntry | null>(null);
  const { avatarId } = usePlayerIdentity();
  const trainingCountdownSeconds = useTrainingCountdownSeconds(isTraining, trainingEndsAt);
  const founderTrainingPowerFp16Multiplier = useMemo(
    () => getFounderMultipliers(avatarId).trainingPowerFp16Multiplier,
    [avatarId],
  );

  const estimateTrainingDurationSeconds = useMemo(
    () => (model: BaseModelLibraryEntry, overtrainBracket = 1) =>
      estimatePostTrainingDurationSeconds({
        baseModel: model,
        availableTrainingPowerFp16: previewAvailableTrainingPowerFp16({
          ...trainingDurationPreview,
          founderTrainingPowerFp16Multiplier,
        }),
        overtrainBracket,
        durationMultiplier: trainingDurationMultiplier,
      }),
    [founderTrainingPowerFp16Multiplier, trainingDurationMultiplier, trainingDurationPreview],
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 pb-24">
      {postTrainError != null && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <p className="flex-1 text-xs text-amber-200/90">{postTrainError}</p>
          <button
            type="button"
            onClick={onDismissPostTrainError}
            className="shrink-0 rounded-lg p-1.5 text-amber-400/80 transition-colors hover:bg-amber-500/20 hover:text-amber-300 focus-visible:ring-2 focus-visible:ring-amber-400/50"
            aria-label="Dismiss error"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="game-section-label">Base models</h4>
          {isTraining && <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200/70">Job Running</span>}
        </div>
        <div className="space-y-3">
          {baseModelLibrary.map((baseModel) => (
            <div
              key={baseModel.id}
              className={
                tutorialStarted &&
                  !tutorialCompleted &&
                  ((tutorialStage === "license_scraper" && baseModel.id === TUTORIAL_SCRAPE_MODEL_ID)
                    || (tutorialStage === "fine_tune" && baseModel.id === TUTORIAL_TRAIN_BASE_MODEL_ID))
                  ? "rounded-2xl ring-2 ring-brand-teal/80 ring-offset-2 ring-offset-[#1c1a22]"
                  : ""
              }
            >
              <BaseModelCard
                model={baseModel}
                justUnlocked={baseModel.id === lastUnlockedBaseModelId}
                estimatedTrainingDurationSeconds={
                  baseModel.actionKind === "train" ? estimateTrainingDurationSeconds(baseModel) : undefined
                }
                onPrimaryAction={() => {
                  if (baseModel.actionKind === "unlock") {
                    onUnlockBaseModel(baseModel.id, baseModel.licenseCost);
                    return;
                  }
                  if (baseModel.actionKind === MODEL_ACTION_KIND.serve_base) {
                    onLaunchLicensedBaseServe(baseModel.id);
                    return;
                  }
                  if (baseModel.actionKind === "scrape") {
                    return;
                  }
                  if (baseModel.actionKind === "train") {
                    const needsDataCommit =
                      baseModel.trainingMethod === "fine_tune" && baseModel.sourceType === "open_source";
                    if (needsDataCommit) {
                      setTrainCommitModel(baseModel);
                    } else {
                      onStartPostTraining(baseModel.id);
                    }
                  }
                }}
                onViewDetail={setDetailBaseModelId}
                trainingSecondsRemaining={
                  baseModel.id === trainingBaseModelId ? trainingCountdownSeconds : null
                }
              />
            </div>
          ))}
        </div>
      </section>

      {detailBaseModelId !== null && (
        <ModelDetailView
          baseModelId={detailBaseModelId}
          initialMode="base"
          estimatedTrainingDurationSeconds={
            (() => {
              const model = baseModelLibrary.find((entry) => entry.id === detailBaseModelId);
              return model?.actionKind === "train" ? estimateTrainingDurationSeconds(model) : undefined;
            })()
          }
          onClose={() => setDetailBaseModelId(null)}
        />
      )}

      {trainCommitModel !== null && (
        <TrainDataCommitmentModal
          model={trainCommitModel}
          dataTokens={dataTokens}
          estimateTrainingDurationSeconds={estimateTrainingDurationSeconds}
          onCancel={() => setTrainCommitModel(null)}
          onConfirm={(overtrainBracket) => {
            onStartPostTraining(trainCommitModel.id, { overtrainBracket });
            setTrainCommitModel(null);
          }}
        />
      )}
    </div>
  );
}
