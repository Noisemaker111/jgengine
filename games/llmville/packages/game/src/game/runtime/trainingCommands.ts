import type { CommandDef } from "@jgengine/core/runtime/commandRunner";
import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import {
  placedRackAssignmentMap,
  placedRackSnapshots,
  listPlacedObjects,
  type PlacedRackObject,
} from "@llmville/game/datacenter/placedObjects";
import {
  isRecord,
  readFiniteNumber,
  readString,
  readStringArray,
} from "@llmville/game/game/runtime/commandInput";
import { chargeCurrency, currencyBalance } from "@llmville/game/game/runtime/economy";
import {
  enqueueTraining,
  readTrainingState,
  writeTrainingState,
} from "@llmville/game/game/runtime/trainingQueue";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import { decideTrainingStart, type TrainingStartDecision } from "@llmville/game/models/trainingTransition";

export const START_TRAINING_COMMAND = "startTraining";

const UNKNOWN_PLAYER = "Unknown player";
const MALFORMED_INPUT = "Malformed command input";

export interface StartTrainingCommandInput {
  baseModelId: string;
  overtrainBracket: number | null;
  isUnlocked: boolean;
  trainingPowerFp16Multiplier: number;
  trainingDurationMultiplier: number;
  powerCapacityKw: number;
  liveModelIds: string[];
  now: number;
}

function parseStartTrainingInput(input: unknown): StartTrainingCommandInput | null {
  if (!isRecord(input)) return null;
  const baseModelId = readString(input.baseModelId);
  const trainingPowerFp16Multiplier = readFiniteNumber(input.trainingPowerFp16Multiplier);
  const trainingDurationMultiplier = readFiniteNumber(input.trainingDurationMultiplier);
  const powerCapacityKw = readFiniteNumber(input.powerCapacityKw);
  const liveModelIds = readStringArray(input.liveModelIds);
  const now = readFiniteNumber(input.now);
  if (
    baseModelId === null
    || trainingPowerFp16Multiplier === null
    || trainingDurationMultiplier === null
    || powerCapacityKw === null
    || liveModelIds === null
    || now === null
  ) {
    return null;
  }
  if (typeof input.isUnlocked !== "boolean") return null;
  const overtrainBracket = input.overtrainBracket === undefined || input.overtrainBracket === null
    ? null
    : readFiniteNumber(input.overtrainBracket);
  return {
    baseModelId,
    overtrainBracket,
    isUnlocked: input.isUnlocked,
    trainingPowerFp16Multiplier,
    trainingDurationMultiplier,
    powerCapacityKw,
    liveModelIds,
    now,
  };
}

function ownedRacks(snapshot: GameRuntimeSnapshot, actorUserId: string): PlacedRackObject[] {
  return listPlacedObjects(snapshot).filter(
    (object): object is PlacedRackObject => object.kind === "rack" && object.ownerUserId === actorUserId,
  );
}

function decide(
  snapshot: GameRuntimeSnapshot,
  input: StartTrainingCommandInput,
  actorUserId: string,
): TrainingStartDecision {
  const racks = ownedRacks(snapshot, actorUserId);
  return decideTrainingStart({
    baseModel: getBaseModelDefinition(input.baseModelId),
    isUnlocked: input.isUnlocked,
    ...(input.overtrainBracket === null ? {} : { overtrainBracket: input.overtrainBracket }),
    gameDataTokens: currencyBalance(snapshot, actorUserId, "data"),
    hasActiveTraining: readTrainingState(snapshot, actorUserId, input.now).queue.jobs.length > 0,
    racks: placedRackSnapshots(racks),
    computeAssignments: placedRackAssignmentMap(racks, new Set(input.liveModelIds)),
    founder: {
      servingMoneyIncomeMultiplier: 1,
      servingDataTokensIncomeMultiplier: 1,
      servingThroughputMultiplier: 1,
      shopPriceMultiplier: 1,
      electricityBillMultiplier: 1,
      trainingPowerFp16Multiplier: input.trainingPowerFp16Multiplier,
    },
    trainingDurationMultiplier: input.trainingDurationMultiplier,
    powerCapacityKw: input.powerCapacityKw,
    startedBy: actorUserId,
    now: input.now,
  });
}

export const startTrainingCommand: CommandDef = {
  scope: () => ({ players: "actor" }),
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parseStartTrainingInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    const decision = decide(snapshot, parsed, actorUserId);
    return decision.started ? null : { reason: decision.reason };
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parseStartTrainingInput(input);
    if (parsed === null) return snapshot;
    const decision = decide(snapshot, parsed, actorUserId);
    if (!decision.started) return snapshot;

    const state = readTrainingState(snapshot, actorUserId, parsed.now);
    const enqueued = enqueueTraining(state.queue, decision.spec);
    if (!enqueued.ok) return snapshot;

    let next = snapshot;
    if (decision.reserveDataTokens > 0) {
      const charge = chargeCurrency(snapshot, {
        userId: actorUserId,
        currency: "data",
        amount: decision.reserveDataTokens,
        type: "expense_training",
        description: `Training ${decision.spec.baseModelId}`,
      });
      if (!charge.ok) return snapshot;
      next = charge.snapshot;
    }

    return writeTrainingState(next, actorUserId, {
      queue: enqueued.state,
      lastTickAtMs: parsed.now,
    });
  },
};
