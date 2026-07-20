export const CORRIDOR_HALF_WIDTH = 20;
export const MID_LANE_HALF_WIDTH = 9;
export const LEFT_LANE_X: readonly [number, number] = [-18, -10];
export const RIGHT_LANE_X: readonly [number, number] = [10, 18];

/** Barricades span the whole drivable width — there is no un-gated seam to slip through. */
export const CORRIDOR_LANE_SPAN: readonly [number, number] = [-CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_WIDTH];
/** The kart is fenced inside the corridor so it can never drive around a corridor-spanning barricade. */
export const CORRIDOR_DRIVE_HALF_WIDTH = 18.5;

export const ZONE_A_END = 150;
export const ZONE_B_END = 300;
export const EXIT_Z = 470;
export const SPAWN_Z = 4;
export const COMPACTOR_START_Z = -35;

export const CRUSH_BUFFER = 1.5;
export const NEAR_MISS_ENTER = 16;
export const NEAR_MISS_EXIT = 24;
export const ARMOR_SAVE_BUMP = 9;

export const RUN_SEED = "wreckway-run";
