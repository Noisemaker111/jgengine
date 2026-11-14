import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

/**
 * Per-run mission timers. In the store rather than module scope so a server host, a test, and two
 * split-screen contexts each get their own - module-level `let` is shared by every context in the
 * process.
 */
export interface MissionFlags {
  bustedHold: number;
  raceSettled: boolean;
  raceClearAt: number;
}

const FRESH_MISSION: MissionFlags = {
  bustedHold: 0,
  raceSettled: false,
  raceClearAt: 0,
};

export const missionStore = defineStore<MissionFlags>("harbor.mission", () => ({ ...FRESH_MISSION }));

export function mission(ctx: GameContext): MissionFlags {
  return missionStore.read(ctx);
}

export function patchMission(ctx: GameContext, patch: Partial<MissionFlags>): void {
  missionStore.write(ctx, { ...mission(ctx), ...patch });
}

export function resetMissionState(ctx: GameContext): void {
  missionStore.write(ctx, { ...FRESH_MISSION });
}
