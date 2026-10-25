import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { physics, world } from "../world";
import { content } from "./content";
import { keep } from "./keep";
import { resetSession } from "./session";
import { setupWorld } from "./world/setup";

/**
 * A headless defense for tests: the keep's world installed as the game installs it (so `beacon.*`
 * commands exist), the defense set up, and nothing else ticking unless a test asks.
 */
export function beaconRunner(name = "Beacon (test)", options: { terrain?: boolean } = {}): HeadlessRunner {
  resetSession();
  const definition = defineGameDefinition({
    name,
    multiplayer: "off",
    ...(options.terrain === true ? { world, physics } : {}),
    systems: [keep.system],
    loop: { onInit: setupWorld, onNewPlayer() {} },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop! });
}

/** Run the keep's world for `seconds`: builds rise, sales land and their entities spawn or despawn. */
export function advanceKeep(runner: HeadlessRunner, seconds: number, step = 0.25): void {
  for (let t = 0; t < seconds - 1e-9; t += step) keep.system.update?.(runner.ctx, step);
}
