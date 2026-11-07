/**
 * ARK's flyers on the Island, ridden: how fast each flies (metres a second, ARK's tamed flying speed over
 * 100, approximate), the stamina it burns a second while off the ground, and the biggest body it can lift in
 * its talons (a creature's radius, metres: ARK's drag weight, approximate). Out of stamina in the air, it
 * cannot hold itself up and drops.
 */
export const FLYERS: Readonly<Record<string, { speed: number; stamina: number; liftRadius: number }>> = {
  // A Pteranodon lifts the smallest: a dodo, a compy, a dilophosaur.
  pteranodon: { speed: 16, stamina: 4, liftRadius: 0.6 },
  // An Argentavis lifts up to a raptor, a phiomia or a pachy.
  argentavis: { speed: 11, stamina: 3, liftRadius: 1 },
};

/**
 * How far a flyer's talons reach for a creature to lift, metres: around it to the creature's edge, down below it,
 * and up, for one standing a little uphill of a flyer on the ground.
 */
export const LIFT_REACH = { around: 3, below: 6, above: 2 } as const;

/** How far under its flyer a lifted creature hangs, metres. */
export const LIFT_HANG = 1.4;

/** Climb and dive speed, metres a second: Space climbs, C dives, letting go holds height. */
export const CLIMB_SPEED = 7;

/** Above the ground by more than this, a flyer counts as in the air (burning stamina, flying speed). */
export const AIRBORNE = 0.6;
