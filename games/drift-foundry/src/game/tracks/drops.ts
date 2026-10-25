import type { PartIconId } from "../parts/catalog";
import type { TrackPickupDef } from "./types";

/**
 * Every track opens the same way the corridor does: eight drops on the centreline before the first
 * barricade, ending with the plow blade (the last front drop) and the coil springs (the last wheels
 * drop), so a kart that sweeps the opening straight carries both all the way to the gate. Only the
 * four late drops move, and where a track hides them (on the long way round, down a shortcut) is
 * the sweep's real choice.
 */
const OPENING: readonly { partId: PartIconId; lane: number }[] = [
  { partId: "salvage_v6", lane: 0 },
  { partId: "hood_plate", lane: -1.5 },
  { partId: "truck_engine", lane: 1.5 },
  { partId: "fan_blade_vanes", lane: -1 },
  { partId: "steel_rims", lane: 1 },
  { partId: "plow_blade", lane: 0 },
  { partId: "monster_treads", lane: -1 },
  { partId: "coil_springs", lane: 0 },
];

const LATE: readonly PartIconId[] = ["ev_conversion", "scrap_frame", "roll_cage", "armor_plating"];

/** The opening eight at the given run metres, then the four late drops where the track puts them. */
export function trackDrops(opening: readonly number[], late: readonly { at: number; lane?: number; route?: string }[]): readonly TrackPickupDef[] {
  if (opening.length !== OPENING.length) throw new Error(`tracks: the opening needs ${OPENING.length} drop marks`);
  if (late.length !== LATE.length) throw new Error(`tracks: the late run needs ${LATE.length} drop marks`);
  return [
    ...OPENING.map((entry, index) => ({ partId: entry.partId, lane: entry.lane, at: opening[index]! })),
    ...LATE.map((partId, index) => ({ partId, at: late[index]!.at, lane: late[index]!.lane ?? 0, ...(late[index]!.route === undefined ? {} : { route: late[index]!.route }) })),
  ];
}

/** The usual opening marks: 12 m apart from 10 m, springs at 96 m. */
export const STANDARD_OPENING: readonly number[] = [10, 22, 34, 46, 58, 70, 83, 96];
