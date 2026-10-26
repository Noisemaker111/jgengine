import { world as place } from "@jgengine/core/placement/place";
import { createRapierBackend } from "@jgengine/rapier";

// Each world carries its own physics. The built-in solver has no
// dependencies; pass Rapier as the backend when you want rigid bodies,
// joints and continuous collision. Movement and combat read the same
// config either way.
export const tideRunnerWorld = place({
  id: "tide-runner",
  ground: { mode: "flat", size: { x: Infinity, z: Infinity } },
  physics: {
    gravity: -24,
    jumpVelocity: 9,
    backend: await createRapierBackend(),
    controller: { radius: 0.35, height: 1.8, stepHeight: 0.4 },
  },
});
