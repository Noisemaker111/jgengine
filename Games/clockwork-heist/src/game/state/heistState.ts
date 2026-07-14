import { defineStore } from "@jgengine/core/store/defineStore";
import { RUN_SECONDS, mansionClockAt } from "../schedule/mansionClock";
import { SIDE_LOOT_DEFS, TREASURE_DEFS } from "../items/treasures";

export type HeistStatus = "intro" | "playing" | "lost" | "won";
export type LostReason = "caught" | "dawn";

export interface CaughtBy {
  guardName: string;
  roomName: string;
  atLabel: string;
}

export interface Toast {
  id: string;
  text: string;
  createdAt: number;
}

export interface ActiveGrab {
  targetId: string;
  kind: "treasure" | "loot";
  startedAt: number;
}

export interface WonSummary {
  atLabel: string;
  haulValue: number;
  strikesUsed: number;
  elapsedSeconds: number;
}

export interface HeistState {
  status: HeistStatus;
  lostReason: LostReason | null;
  caughtBy: CaughtBy | null;
  runStartedAt: number;
  frozenElapsed: number;
  strikes: number;
  wasDetected: boolean;
  collectedTreasureIds: readonly string[];
  collectedLootIds: readonly string[];
  sneaking: boolean;
  activeGrab: ActiveGrab | null;
  toasts: readonly Toast[];
  wonSummary: WonSummary | null;
}

export const MAX_STRIKES = 3;
export const TOAST_LIMIT = 4;
export const TOAST_TTL_SECONDS = 6;

export function initialHeistState(): HeistState {
  return {
    status: "intro",
    lostReason: null,
    caughtBy: null,
    runStartedAt: 0,
    frozenElapsed: 0,
    strikes: 0,
    wasDetected: false,
    collectedTreasureIds: [],
    collectedLootIds: [],
    sneaking: false,
    activeGrab: null,
    toasts: [],
    wonSummary: null,
  };
}

export const heistStore = defineStore<HeistState>("heist", () => initialHeistState());

export function elapsedSecondsFor(state: HeistState, now: number): number {
  if (state.status === "intro") return 0;
  if (state.status === "lost" || state.status === "won") return state.frozenElapsed;
  return Math.max(0, Math.min(RUN_SECONDS, now - state.runStartedAt));
}

function withToast(state: HeistState, text: string, now: number): HeistState {
  const toast: Toast = { id: `toast-${now.toFixed(3)}-${state.toasts.length}`, text, createdAt: now };
  const next = [...state.toasts, toast];
  const trimmed = next.length > TOAST_LIMIT ? next.slice(next.length - TOAST_LIMIT) : next;
  return { ...state, toasts: trimmed };
}

export function pruneToasts(state: HeistState, now: number): HeistState {
  const kept = state.toasts.filter((toast) => now - toast.createdAt < TOAST_TTL_SECONDS);
  if (kept.length === state.toasts.length) return state;
  return { ...state, toasts: kept };
}

export function startHeist(state: HeistState, now: number): HeistState {
  if (state.status !== "intro") return state;
  return withToast({ ...state, status: "playing", runStartedAt: now }, "The clock begins. Mind the count.", now);
}

export function restartHeist(state: HeistState, now: number): HeistState {
  const fresh = initialHeistState();
  return { ...fresh, status: "playing", runStartedAt: now };
}

export function setSneaking(state: HeistState, sneaking: boolean): HeistState {
  if (state.sneaking === sneaking) return state;
  return { ...state, sneaking };
}

export interface DetectionSource {
  kind: "guard" | "camera";
  name: string;
  roomName: string;
}

export function applyDetectionTick(
  state: HeistState,
  detectedNow: boolean,
  source: DetectionSource | null,
  now: number,
): HeistState {
  if (state.status !== "playing") return state;
  if (!detectedNow) {
    if (!state.wasDetected) return state;
    return { ...state, wasDetected: false };
  }
  if (state.wasDetected) return state;

  const strikes = state.strikes + 1;
  const elapsed = elapsedSecondsFor(state, now);
  const clock = mansionClockAt(elapsed);
  const spottedText = source === null ? "Spotted." : `Spotted by ${source.name} in the ${source.roomName}.`;
  let next = withToast({ ...state, strikes, wasDetected: true }, `${spottedText} (${strikes}/${MAX_STRIKES})`, now);

  if (strikes >= MAX_STRIKES) {
    next = {
      ...next,
      status: "lost",
      lostReason: "caught",
      frozenElapsed: elapsed,
      caughtBy:
        source === null
          ? { guardName: "the household", roomName: "the mansion", atLabel: clock.label }
          : { guardName: source.name, roomName: source.roomName, atLabel: clock.label },
    };
  }
  return next;
}

export function applyDawnCheck(state: HeistState, now: number): HeistState {
  if (state.status !== "playing") return state;
  const elapsed = elapsedSecondsFor(state, now);
  if (elapsed < RUN_SECONDS) return state;
  return { ...state, status: "lost", lostReason: "dawn", frozenElapsed: RUN_SECONDS };
}

export function beginGrab(state: HeistState, targetId: string, kind: "treasure" | "loot", now: number): HeistState {
  if (state.status !== "playing") return state;
  if (state.activeGrab !== null && state.activeGrab.targetId === targetId) return state;
  return { ...state, activeGrab: { targetId, kind, startedAt: now } };
}

export function cancelGrab(state: HeistState): HeistState {
  if (state.activeGrab === null) return state;
  return { ...state, activeGrab: null };
}

export function resolveGrabSuccess(
  state: HeistState,
  targetId: string,
  kind: "treasure" | "loot",
  name: string,
  now: number,
): HeistState {
  if (state.status !== "playing") return state;
  const collectedTreasureIds =
    kind === "treasure" ? [...state.collectedTreasureIds, targetId] : state.collectedTreasureIds;
  const collectedLootIds = kind === "loot" ? [...state.collectedLootIds, targetId] : state.collectedLootIds;
  return withToast(
    { ...state, activeGrab: null, collectedTreasureIds, collectedLootIds },
    `${name} secured.`,
    now,
  );
}

export function resolveGrabFail(state: HeistState, name: string, now: number): HeistState {
  if (state.status !== "playing") return state;
  return withToast({ ...state, activeGrab: null }, `${name} slips from your grasp.`, now);
}

export function attemptExit(state: HeistState, now: number): HeistState {
  if (state.status !== "playing") return state;
  const haulValue = haulValueFor(state);
  if (state.collectedTreasureIds.length < TREASURE_DEFS.length) {
    return withToast(state, "Leaving empty-handed won't pay the crew. Five marks, then the door.", now);
  }
  const elapsed = elapsedSecondsFor(state, now);
  const clock = mansionClockAt(elapsed);
  return {
    ...state,
    status: "won",
    frozenElapsed: elapsed,
    wonSummary: { atLabel: clock.label, haulValue, strikesUsed: state.strikes, elapsedSeconds: elapsed },
  };
}

export function haulValueFor(state: HeistState): number {
  const treasureValue = TREASURE_DEFS.filter((entry) => state.collectedTreasureIds.includes(entry.id)).reduce(
    (sum, entry) => sum + entry.value,
    0,
  );
  const lootValue = SIDE_LOOT_DEFS.filter((entry) => state.collectedLootIds.includes(entry.id)).reduce(
    (sum, entry) => sum + entry.value,
    0,
  );
  return treasureValue + lootValue;
}
