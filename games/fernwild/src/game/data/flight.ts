/**
 * ARK's flyers on the Island, ridden: how fast each flies (metres a second, ARK's tamed flying speed over
 * 100, approximate) and the stamina it burns a second while off the ground. Out of stamina in the air, it
 * cannot hold itself up and drops.
 */
export const FLYERS: Readonly<Record<string, { speed: number; stamina: number }>> = {
  pteranodon: { speed: 16, stamina: 4 },
  argentavis: { speed: 11, stamina: 3 },
};

/** Climb and dive speed, metres a second: Space climbs, C dives, letting go holds height. */
export const CLIMB_SPEED = 7;

/** Above the ground by more than this, a flyer counts as in the air (burning stamina, flying speed). */
export const AIRBORNE = 0.6;
