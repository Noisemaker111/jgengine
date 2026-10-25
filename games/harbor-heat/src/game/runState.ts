import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { createWaveRunner, type WaveRunner } from "@jgengine/core/ai/waveRunner";
import type { SpawnDirectorState } from "@jgengine/core/ai/spawnDirector";
import { perContext } from "@jgengine/core/runtime/perContext";
import { DOCK_FIGHT_CENTER } from "./world/districts";

/**
 * Per-run mission timers. In the store rather than module scope so a server host, a test, and two
 * split-screen contexts each get their own - module-level `let` is shared by every context in the
 * process.
 */
export interface MissionState {
  bustedHold: number;
  raceSettled: boolean;
  raceClearAt: number;
}

const FRESH_MISSION: MissionState = {
  bustedHold: 0,
  raceSettled: false,
  raceClearAt: 0,
};

export const missionStore = defineStore<MissionState>("harbor.mission", () => ({ ...FRESH_MISSION }));

export function mission(ctx: GameContext): MissionState {
  return missionStore.read(ctx);
}

export function patchMission(ctx: GameContext, patch: Partial<MissionState>): void {
  missionStore.write(ctx, { ...mission(ctx), ...patch });
}

export function resetMissionState(ctx: GameContext): void {
  missionStore.write(ctx, { ...FRESH_MISSION });
}

const CONVOY_TOTAL = 10;

/** One dock reinforcement per six seconds, ten of them: the convoy is a wave manifest, not a counter. */
const CONVOY_WAVES = Array.from({ length: CONVOY_TOTAL }, () => ({
  budget: 1,
  duration: 6,
  entries: [{ id: "ganger_dock", cost: 1 }],
}));

/**
 * The Carmine convoy as the engine's wave runner: the director owns the cadence and the alive cap,
 * the sink places each request on the dock ring, and `attachWaveFeedback` announces the wave. The
 * runner is built on first use, so a world that has not reached the convoy can still snapshot "none".
 */
const convoySlot = perContext((ctx: GameContext): { runner: WaveRunner | null } =>
  ({ runner: null as WaveRunner | null }),
);

export function convoyRunners(ctx: GameContext): WaveRunner {
  const slot = convoySlot(ctx);
  if (slot.runner === null) {
    slot.runner = createWaveRunner({
      waves: CONVOY_WAVES,
      maxAlive: 4,
      seed: 20260712,
      onSpawn(request) {
        const wave = request.wave + 1;
        const angle = (wave / CONVOY_TOTAL) * Math.PI * 2;
        const x = DOCK_FIGHT_CENTER[0] + Math.sin(angle) * 22;
        const z = DOCK_FIGHT_CENTER[2] + Math.cos(angle) * 22;
        ctx.scene.entity.spawn("ganger_dock", {
          id: `convoy_${wave}`,
          position: [x, ctx.world.groundHeightAt(x, z), z],
          role: "npc",
        });
      },
    });
  }
  return slot.runner;
}

/** The convoy's wave/alert/budget state, or null before the director has been built this boot. */
export function convoySnapshot(ctx: GameContext): SpawnDirectorState | null {
  return convoySlot(ctx).runner?.snapshot() ?? null;
}

/** Put the director back where the reload left it so the convoy resumes mid-wave. */
export function restoreConvoy(ctx: GameContext, state: SpawnDirectorState): void {
  convoyRunners(ctx).restore(state);
}
