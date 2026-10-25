import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { registerCommands } from "./game/commands";
import { registerCaptureCommands } from "./game/capture";
import { setupWorld } from "./game/sim/setup";
import { simulateHousehold } from "./game/sim/simulate";
import { checkpointOrbit, orbitSession, prepareOrbit, registerOrbitLifecycle } from "./game/session/lifecycle";

export function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  registerCaptureCommands(ctx);
  setupWorld(ctx);
  registerOrbitLifecycle(ctx);
  prepareOrbit(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  const session = orbitSession.read(ctx);
  if (session.screen !== null) { ctx.time.pause(); return; }
  simulateHousehold(ctx, dt);
  if (ctx.time.now() - session.lastSavedAt >= 1) checkpointOrbit(ctx);
}

export const loop = { onInit, onNewPlayer, onTick };
