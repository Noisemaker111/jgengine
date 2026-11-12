import type { HitMarkerTiming } from "@jgengine/core/combat/hitMarker";
import type { ImpactDecalsConfig } from "@jgengine/core/vfx/impactDecals";

import { enemies } from "../entities/enemies/catalog";

/**
 * Armoured bodies (loaders, crawlers, elite husks) bleed oil onto the ground under the shot; flesh
 * takes no mark, keeping Ferralon blood-free.
 */
const OIL_BODIES: Readonly<Record<string, string>> = Object.fromEntries(
  enemies.filter((enemy) => enemy.surface === "armor").map((enemy) => [enemy.id, "oil"]),
);

/**
 * What a Scrap Signal round leaves in Ferralon: dust splashes in the wasteland dirt, bright dents in
 * the scrap that walls and wrecks are made of, pale chips in rock, splinter holes in wood and canvas,
 * oil under a hit robot, and a wide scorch where anything explosive lands.
 */
export const SCRAP_DECALS: ImpactDecalsConfig = {
  kinds: {
    dust: { look: "splash", tint: "#8a6a48", size: 0.9, lifeSeconds: 18, fadeSeconds: 3 },
    scrap: { look: "dent", tint: "#d9b98a", size: 0.7, lifeSeconds: 30, fadeSeconds: 3 },
    rock: { look: "chip", tint: "#c9b49a", size: 0.8, lifeSeconds: 30, fadeSeconds: 3 },
    splinter: { look: "hole", tint: "#4a3326", size: 0.6, lifeSeconds: 25, fadeSeconds: 3 },
    oil: { look: "splash", tint: "#1b1612", size: 1.4, lifeSeconds: 20, fadeSeconds: 4 },
    scorch: { look: "scorch", tint: "#2a2018", size: 1.1, lifeSeconds: 40, fadeSeconds: 5 },
  },
  surfaces: {
    terrain: "dust",
    wall: "scrap",
    object: "scrap",
    entity: null,
    catalog: {
      ...OIL_BODIES,
      rock_spire: "rock",
      bone_arch: "rock",
      dead_tree: "splinter",
      signpost: "splinter",
      road_marker: "splinter",
      tent: "splinter",
      banner_pole: "splinter",
      // Vendors and stations stay clean: the town's machines are not target practice.
      vendor_rigg: null,
      vendor_sparx: null,
      black_market: null,
      rebuild_station: null,
      fast_travel: null,
    },
    impacts: { explosive: "scorch" },
  },
};

/** The crosshair hit marker: a cross that pops and fades over 220 ms, longer on a crit and a kill. */
export const SCRAP_HIT_MARKER: HitMarkerTiming = {
  lifeMs: { hit: 220, crit: 260, kill: 420 },
  popMs: 150,
  popScale: 1.6,
  fadeMs: 70,
  // Shotgun pellets settle in one trigger pull: one marker at the volley's strongest blow.
  volleyMs: 40,
};
