import type { HitMarkerTiming } from "@jgengine/core/combat/hitMarker";
import type { ImpactDecalsConfig } from "@jgengine/core/vfx/impactDecals";

/**
 * What a Harbor Heat shot leaves behind. Street shooting is blood-free, so a body takes no mark;
 * the street does: dark punctures in asphalt, pale chips in plaster and paving, bright dents in the
 * dumpsters and containers, star cracks in neon, and a wide scorch wherever a grenade goes off.
 */
export const HARBOR_DECALS: ImpactDecalsConfig = {
  kinds: {
    asphalt: { look: "hole", tint: "#3a3532", size: 0.7, lifeSeconds: 30, fadeSeconds: 3 },
    plaster: { look: "chip", tint: "#e8dcc6", size: 0.8, lifeSeconds: 30, fadeSeconds: 3 },
    metal: { look: "dent", tint: "#c7ccd1", size: 0.6, lifeSeconds: 30, fadeSeconds: 3 },
    wood: { look: "hole", tint: "#5a3f2a", size: 0.6, lifeSeconds: 20, fadeSeconds: 3 },
    glass: { look: "crack", tint: "#e9f6ff", size: 0.9, lifeSeconds: 40, fadeSeconds: 4 },
    scorch: { look: "scorch", tint: "#2b2420", lifeSeconds: 45, fadeSeconds: 5 },
  },
  surfaces: {
    terrain: "asphalt",
    wall: "plaster",
    object: "metal",
    entity: null,
    catalog: {
      obj_plaza_paving: "plaster",
      obj_driveway: "asphalt",
      obj_palm: "wood",
      obj_palm_tall: "wood",
      obj_palm_low: "wood",
      obj_flametree: "wood",
      obj_bench: "wood",
      obj_neon: "glass",
      obj_hedge: null,
      obj_bush: null,
      obj_fern: null,
      obj_cactus: null,
      obj_awning: null,
    },
    impacts: { explosive: "scorch" },
  },
};

/** The hit marker over the street: a quick tick, longer for a crit, longest for a takedown. */
export const HARBOR_HIT_MARKER: HitMarkerTiming = {
  lifeMs: { hit: 200, crit: 260, kill: 420 },
  popMs: 120,
  popScale: 1.5,
  fadeMs: 80,
  // A shotgun's pellets land in one handler call: one tick, not five.
  volleyMs: 40,
};
