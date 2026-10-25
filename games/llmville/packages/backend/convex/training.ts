import {
  normalizeTrainingState,
  trainingEndTime,
  type TrainingJob,
  type TrainingState,
} from "@llmville/game/game/runtime/trainingQueue";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { patchPlayerState, readPlayerState, type PlayerState } from "./playerProfile";

type TrainingPlayerState = PlayerState & { training?: TrainingState };

export async function readTrainingStateForOwner(
  ctx: QueryCtx,
  ownerExternalId: string,
  nowMs: number,
): Promise<TrainingState> {
  const state = (await readPlayerState(ctx, ownerExternalId)) as TrainingPlayerState;
  return normalizeTrainingState(state.training, nowMs);
}

export async function writeTrainingStateForOwner(
  ctx: MutationCtx,
  ownerExternalId: string,
  training: TrainingState,
): Promise<void> {
  await patchPlayerState(ctx, ownerExternalId, (state): TrainingPlayerState => ({ ...state, training }));
}

export async function trainingJobsForGame(
  ctx: QueryCtx,
  game: Pick<Doc<"games">, "createdBy">,
  nowMs: number,
): Promise<readonly TrainingJob[]> {
  return (await readTrainingStateForOwner(ctx, game.createdBy, nowMs)).queue.jobs;
}

export async function activeTrainingSessionsForGame(
  ctx: QueryCtx,
  game: Pick<Doc<"games">, "createdBy">,
  nowMs: number,
): Promise<{ endTime: number; baseModelId: string }[]> {
  return (await trainingJobsForGame(ctx, game, nowMs)).map((job) => ({
    endTime: trainingEndTime(job, nowMs),
    baseModelId: job.spec.baseModelId,
  }));
}
