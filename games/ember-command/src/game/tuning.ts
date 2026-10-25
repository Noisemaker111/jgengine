/** Ember Command tuning — the genre-feel numbers no editor schema models (economy, engagement radii).
 * Placement (bases, spawns, obstacles) lives in the scene document, not here. */

export type Faction = "player" | "enemy";

export const GOLD = "gold";
export const LUMBER = "lumber";

/** Starting stockpile and the supply (food) the Town Hall provides on its own. */
export const STARTING_GOLD = 250;
export const STARTING_LUMBER = 120;
export const TOWN_HALL_FOOD = 30;
/** Tiny passive gold trickle so a stalled economy can still recover; real income is peasant-gathered. */
export const INCOME_TRICKLE = 1;

/** A group ordered to a point is considered arrived within this radius of its slot. */
export const ARRIVE_RADIUS = 1.4;
/** Right-click within this distance of a hostile issues an attack order instead of a move. */
export const ORDER_TARGET_RADIUS = 3.0;
/** Right-click within this of a resource node sends selected peasants to harvest it. */
export const NODE_ORDER_RADIUS = 4.5;
/** Grid spacing between formation slots when a group is ordered to a point. */
export const FORMATION_SPACING = 2.3;
/** A member further than this from its held slot walks back to it (outside ARRIVE_RADIUS so units at
 * post never jitter between "arrived" and "returning"). */
export const FORMATION_HOLD_TOLERANCE = 2.6;

/** Vision — how far a standing Vanguard eye clears the fog. Buildings and the hero see further than
 * a line soldier, so a keep lights its own ground and Bram is the best scout on the field. */
export const SIGHT_RADIUS = 13;
export const SIGHT_RADIUS_HERO = 17;
export const SIGHT_RADIUS_BUILDING = 16;
/** Fog grid: the 96×96 battlefield on 3-unit cells (32×32 cells), redrawn with the minimap. */
export const FOG_CELL = 3;

/** Gather loop. A peasant walks to a node, works for HARVEST_SECONDS, then hauls the load home. */
export const HARVEST_RANGE = 2.6;
export const DEPOT_RANGE = 4.5;
export const HARVEST_SECONDS = 2.2;
export const LUMBER_PER_TRIP = 8;
export const GOLD_MINE_BUDGET = 600;
export const LUMBER_NODE_BUDGET = 500;

/** Enemy reinforcement cadence. The Marauder Warcamp musters escalating waves that attack-move the
 * player keep; razing the warcamp cuts off reinforcements (that is how the tide is stemmed). */
export const ENEMY_WAVE_FIRST_DELAY = 30;
export const ENEMY_WAVE_INTERVAL = 42;
/** Hold new waves while this many Marauders are already fielded — bounded pressure, not a swarm. The
 * director clock freezes at the cap and resumes when the roster thins, so held waves never dump. */
export const ENEMY_WAVE_MAX_FIELDED = 22;
