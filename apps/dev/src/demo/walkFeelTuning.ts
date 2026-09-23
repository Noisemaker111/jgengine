import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import type { PlayerMovementConfig } from "@jgengine/core/game/playableGame";

export interface WalkFeel {
  name: string;
  label: string;
  color: string;
  walkSpeed: number;
  movement: PlayerMovementConfig;
  physics: PhysicsConfig;
}

// The two characters differ only in these numbers; the engine walk controller does the rest.
export const FLOATY_FEEL: WalkFeel = {
  name: "walk-floaty",
  label: "Floaty platformer",
  color: "#f472b6",
  walkSpeed: 3,
  movement: {
    feel: {
      groundAcceleration: 30,
      airAcceleration: 25,
      groundFriction: 20,
      jumpBufferMs: 150,
      coyoteMs: 120,
      jumpCutFactor: 0.4,
      apexGravityScale: 0.45,
      apexSpeed: 2,
    },
  },
  physics: { gravity: -12, jumpVelocity: 7 },
};

export const WEIGHTY_FEEL: WalkFeel = {
  name: "walk-weighty",
  label: "Weighty shooter",
  color: "#64748b",
  walkSpeed: 3,
  movement: {
    feel: { groundAcceleration: 10, airAcceleration: 1.5, groundFriction: 8, fallGravityScale: 1.6, landingRecoveryMs: 180 },
  },
  physics: { gravity: -32, jumpVelocity: 6 },
};
