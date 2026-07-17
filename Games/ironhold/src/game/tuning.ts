/** Ironhold tuning — the genre-feel numbers no editor schema models (economy, engagement radii).
 * Placement (bases, spawns, obstacles) lives in the scene document, not here. */

export type Faction = "player" | "enemy";

export const GOLD = "gold";

/** Wallet at match start and the passive trickle that funds reinforcement. */
export const STARTING_GOLD = 180;
export const INCOME_PER_SECOND = 3;

/** Reinforcement: train a Footman at your keep for this much gold. */
export const FOOTMAN_COST = 65;

/** A group ordered to a point is considered arrived within this radius of its slot. */
export const ARRIVE_RADIUS = 1.4;
/** Right-click within this distance of a hostile issues an attack order instead of a move. */
export const ORDER_TARGET_RADIUS = 3.0;
/** Grid spacing between formation slots when a group is ordered to a point. */
export const FORMATION_SPACING = 2.3;
