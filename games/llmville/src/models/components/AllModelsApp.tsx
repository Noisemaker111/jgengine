/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState } from "@jgengine/core/ui/jsx";

import type { BaseModelLibraryEntry } from "../training";
import { MODEL_ACTION_KIND } from "../training";
import type { TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import { TUTORIAL_SCRAPE_MODEL_ID, TUTORIAL_TRAIN_BASE_MODEL_ID } from "@llmville/game/tutorial/tutorialProgress";
import {
  estimatePostTrainingDurationSeconds,
  previewAvailableTrainingPowerFp16,
} from "@llmville/game/models/trainingTransition";
import { getFounderMultipliers } from "@llmville/game/user/founder";
import { usePlayerIdentity } from "../../auth";

import { BaseModelCard } from "./ModelCard";
import { ModelDetailView } from "./ModelDetailView";
import { TrainDataCommitmentModal } from "./TrainDataCommitmentModal";
import { Button, C, FULL, Icon, Label, Row, Stack, Text } from "../../ui/kit";

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

  const highlighted = (id: string) => tutorialStarted && !tutorialCompleted
    && ((tutorialStage === "license_scraper" && id === TUTORIAL_SCRAPE_MODEL_ID) || (tutorialStage === "fine_tune" && id === TUTORIAL_TRAIN_BASE_MODEL_ID));
  const act = (baseModel: BaseModelLibraryEntry) => {
    if (baseModel.actionKind === "unlock") { onUnlockBaseModel(baseModel.id, baseModel.licenseCost); return; }
    if (baseModel.actionKind === MODEL_ACTION_KIND.serve_base) { onLaunchLicensedBaseServe(baseModel.id); return; }
    if (baseModel.actionKind !== "train") return;
    if (baseModel.trainingMethod === "fine_tune" && baseModel.sourceType === "open_source") setTrainCommitModel(baseModel);
    else onStartPostTraining(baseModel.id);
  };
  const detailModel = detailBaseModelId === null ? undefined : baseModelLibrary.find((entry) => entry.id === detailBaseModelId);

  return <Stack width={FULL} gap={12}>
    {postTrainError == null ? null : <Row gap={10} items="start" padding={[10, 12, 10, 14]} radius={12} fill="#e0a95c1a" border={{ width: 1, color: "#e0a95c40" }} width={FULL}>
      <Text size={12} color={C.amber} grow={1} shrink>{postTrainError}</Text>
      <Button tone="ghost" minHeight={28} padding={4} label="Dismiss error" onPress={onDismissPostTrainError}><Icon name="close" size={14} color={C.amber} /></Button>
    </Row>}
    <Row justify="between" width={FULL}>
      <Label>BASE MODELS</Label>
      {isTraining ? <Label color={C.amber}>JOB RUNNING</Label> : null}
    </Row>
    {baseModelLibrary.map((baseModel) => <BaseModelCard
      key={baseModel.id}
      model={baseModel}
      highlight={highlighted(baseModel.id)}
      justUnlocked={baseModel.id === lastUnlockedBaseModelId}
      estimatedTrainingDurationSeconds={baseModel.actionKind === "train" ? estimateTrainingDurationSeconds(baseModel) : undefined}
      onPrimaryAction={() => act(baseModel)}
      onViewDetail={setDetailBaseModelId}
      trainingSecondsRemaining={baseModel.id === trainingBaseModelId ? trainingCountdownSeconds : null}
    />)}
    {detailBaseModelId === null ? null : <ModelDetailView
      baseModelId={detailBaseModelId}
      initialMode="base"
      estimatedTrainingDurationSeconds={detailModel?.actionKind === "train" ? estimateTrainingDurationSeconds(detailModel) : undefined}
      onClose={() => setDetailBaseModelId(null)}
    />}
    {trainCommitModel === null ? null : <TrainDataCommitmentModal
      model={trainCommitModel}
      dataTokens={dataTokens}
      estimateTrainingDurationSeconds={estimateTrainingDurationSeconds}
      onCancel={() => setTrainCommitModel(null)}
      onConfirm={(overtrainBracket) => { onStartPostTraining(trainCommitModel.id, { overtrainBracket }); setTrainCommitModel(null); }}
    />}
  </Stack>;
}
