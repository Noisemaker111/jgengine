/** LAWN ORDER tuning — the genre-feel numbers no editor schema models (economy, engagement radii,
 * pheromone and yard-hazard timing). Placement (nests, food, the hose, the sprinkler, the mower lane)
 * lives in the scene document, not here. */

export type Faction = "player" | "enemy";

export const SUGAR = "sugar";
export const LEAF = "leaf";

/** Starting stockpile and the brood room (supply) the queen's nest provides on its own. */
export const STARTING_SUGAR = 250;
export const STARTING_LEAF = 120;
export const TOWN_HALL_FOOD = 30;
/** Tiny passive sugar trickle so a stalled economy can still recover; real income is worker-gathered. */
export const INCOME_TRICKLE = 1;

/** A group ordered to a point is considered arrived within this radius of its slot. */
export const ARRIVE_RADIUS = 1.4;
/** Right-click within this distance of a hostile issues an attack order instead of a move. */
export const ORDER_TARGET_RADIUS = 3.0;
/** Right-click within this of a resource node sends selected workers to harvest it. */
export const NODE_ORDER_RADIUS = 4.5;
/** Grid spacing between formation slots when a group is ordered to a point. */
export const FORMATION_SPACING = 2.3;
/** A member further than this from its held slot walks back to it (outside ARRIVE_RADIUS so units at
 * post never jitter between "arrived" and "returning"). */
export const FORMATION_HOLD_TOLERANCE = 2.6;

/** Vision — how far a standing red ant's antennae clear the fog. Chambers and the Marshal sense further
 * than a line soldier, and the Scout caste reads pheromone from furthest of all. */
export const SIGHT_RADIUS = 13;
export const SIGHT_RADIUS_SCOUT = 22;
export const SIGHT_RADIUS_HERO = 17;
export const SIGHT_RADIUS_BUILDING = 16;
/** Fog grid: the 96×96 battlefield on 3-unit cells (32×32 cells), redrawn with the minimap. */
export const FOG_CELL = 3;

/** Gather loop. A worker walks to a node, works for HARVEST_SECONDS, then hauls the load home. */
export const HARVEST_RANGE = 2.6;
export const DEPOT_RANGE = 4.5;
export const HARVEST_SECONDS = 2.2;

/** Enemy reinforcement cadence. The Black Ant Nest musters escalating waves that attack-move the
 * red nest; razing the black nest cuts off reinforcements (that is how the tide is stemmed). */
export const ENEMY_WAVE_FIRST_DELAY = 30;
export const ENEMY_WAVE_INTERVAL = 42;
/** Hold new waves while this many black ants are already fielded — bounded pressure, not a swarm. The
 * director clock freezes at the cap and resumes when the roster thins, so held waves never dump. */
export const ENEMY_WAVE_MAX_FIELDED = 22;

/** Pheromone trails (see `pheromone.ts`): a grid of scent the colony lays and walks faster along. */
export const TRAIL_CELL = 2;
/** Scent a hauling worker adds to its cell each second, and the most one cell holds. */
export const TRAIL_HAUL_DEPOSIT = 0.45;
export const TRAIL_MAX = 1;
/** Scent a painted Pheromone Line lays on every cell it crosses. */
export const TRAIL_PAINT_STRENGTH = 1;
/** Sugar a painted line costs, and the longest line one order can paint. */
export const TRAIL_PAINT_COST = 15;
export const TRAIL_PAINT_MAX_LENGTH = 60;
/** Seconds for unattended scent to halve in dry weather; rain multiplies the decay. */
export const TRAIL_HALF_LIFE = 90;
export const TRAIL_RAIN_DECAY = 6;
/** Below this a cell is bare ground again. */
export const TRAIL_FLOOR = 0.04;
/** A red ant on full-strength scent walks this much faster; workers on a scented node harvest faster. */
export const TRAIL_SPEED_BONUS = 0.4;
export const TRAIL_HARVEST_BONUS = 0.3;

/** The garden hose: climbing over it is slow except at its two crossings. */
export const HOSE_SLOW = 0.35;
export const HOSE_HALF_WIDTH = 1.6;
export const HOSE_CROSSING_RADIUS = 3.5;

/** Patio stones are high ground: an ant standing on one senses further. */
export const PATIO_SIGHT_BONUS = 1.35;
