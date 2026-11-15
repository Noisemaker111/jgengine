import type { LightingZone } from "@jgengine/core/lighting/lightingZones";

import { AISLE_NINE_TRACK, TRACKS, type Track } from "../tracks/catalog";
import type { DepartmentLight } from "../tracks/types";

/** Metres of floor past a department's course its own light still covers. */
const DEPARTMENT_MARGIN = 40;
/** Departments sit hundreds of metres apart, so their light blends in over a long, unhurried edge. */
const DEPARTMENT_FADE = 60;
/** The store's width the Aisle 9 sections span: the corridor, its kiosks and the side walls. */
const AISLE_SECTION_WIDTH = 100;
/** A section of Aisle 9 hands over to the next within a few cart lengths. */
const AISLE_SECTION_FADE = 18;

function departmentZone(track: Track, light: DepartmentLight): LightingZone {
  const b = track.course.bounds;
  return {
    ...light,
    area: {
      w: b.maxX - b.minX + DEPARTMENT_MARGIN * 2,
      d: b.maxZ - b.minZ + DEPARTMENT_MARGIN * 2,
      position: [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
    },
    fade: DEPARTMENT_FADE,
  };
}

/**
 * The store re-lit per department: each track's `light` over its own floor, then each Aisle 9
 * section's (its run metres are world z) over its stretch of the main aisle.
 */
export function storeLightingZones(tracks: readonly Track[] = TRACKS): LightingZone[] {
  const zones: LightingZone[] = [];
  for (const track of tracks) {
    if (track.def.light !== undefined) zones.push(departmentZone(track, track.def.light));
  }
  for (const section of AISLE_NINE_TRACK.def.zones) {
    if (section.light === undefined) continue;
    zones.push({
      ...section.light,
      area: { w: AISLE_SECTION_WIDTH, d: section.end - section.start, position: [0, (section.start + section.end) / 2] },
      fade: AISLE_SECTION_FADE,
    });
  }
  return zones;
}
