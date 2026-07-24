import { defineSystem, type GameContext } from "@jgengine/shell/gameKit";

import { tickConstruction } from "./build/construction";
import { tickTowers } from "./combat/towerAI";
import { session } from "./session";
import { tickWaves } from "./waves/director";
import { heartbeat } from "./world/setup";

export const waves = defineSystem({
  id: "waves",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    if (!session.gameOver && !session.victory) tickWaves(ctx, dt);
  },
});

export const construction = defineSystem({
  id: "construction",
  tick: { type: "frame", stage: "ai", after: "waves" },
  update(ctx, dt) {
    if (!session.gameOver && !session.victory) tickConstruction(ctx, dt);
  },
});

export const towers = defineSystem({
  id: "towers",
  tick: { type: "frame", stage: "combat", after: "waves" },
  update(ctx, dt) {
    if (!session.gameOver && !session.victory) tickTowers(ctx, dt);
  },
});

export const worldHeartbeat = defineSystem({
  id: "world-heartbeat",
  tick: { type: "frame", stage: "cleanup" },
  update(ctx: GameContext) {
    heartbeat(ctx);
  },
});

export const systems = [waves, construction, towers, worldHeartbeat];
