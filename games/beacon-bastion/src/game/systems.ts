import { defineSystem, type GameContext } from "@jgengine/shell/gameKit";

import { tickTowers } from "./combat/towerAI";
import { keep, runEnded } from "./keep";
import { tickWaves } from "./waves/director";
import { heartbeat } from "./world/setup";

export const waves = defineSystem({
  id: "waves",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    if (!runEnded(keep.of(ctx))) tickWaves(ctx, dt);
  },
});

export const towers = defineSystem({
  id: "towers",
  tick: { type: "frame", stage: "combat", after: "waves" },
  update(ctx, dt) {
    if (!runEnded(keep.of(ctx))) tickTowers(ctx, dt);
  },
});

export const worldHeartbeat = defineSystem({
  id: "world-heartbeat",
  tick: { type: "frame", stage: "cleanup" },
  update(ctx: GameContext) {
    heartbeat(ctx);
  },
});

/** The keep's world (`keep.system`: builds, upgrades, sales, ripples) beside the real-time sim. */
export const systems = [keep.system, waves, towers, worldHeartbeat];
