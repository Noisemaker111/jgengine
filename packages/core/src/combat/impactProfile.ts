/**
 * How hard a blow lands, by weapon or vehicle class. The shell reads a profile for every
 * `combat.damage` and missed direct-fire shot: sparks and dust at the point of impact, a mark on the
 * surface a shot missed into, a camera kick and rumble near big impacts, and a short hit-stop when the local player lands or takes a heavy hit
 * or a kill. Everything is blood-free; a game that wants blood plays its own effect.
 */
export type ImpactClass = "light" | "medium" | "heavy" | "explosive" | "melee" | "vehicle";

/** One class's numbers. Effect names are `ctx.particles` library names. */
export interface ImpactProfile {
  /** Sparks played at the point of impact; `count` scales the library effect's burst. */
  sparks: { effect: string; count: number } | null;
  /** Dust or debris kicked up with the sparks. */
  dust: { effect: string; count: number } | null;
  /** Diameter in metres of the mark a missed shot leaves on the surface it hit; `0` leaves none. */
  markSize: number;
  /** Hit-stop on a hit the local player landed or took, in real milliseconds. */
  hitstopMs: number;
  /** Hit-stop on a kill the local player landed. */
  killHitstopMs: number;
  /**
   * Camera kick (trauma `0..1`) and gamepad rumble when this impact lands within `kickRadius` metres
   * of the local player, fading to nothing at the edge. `0` for classes the per-hit feedback already
   * covers.
   */
  kick: number;
  kickRadius: number;
}

/**
 * The default profiles. Hit-stop values sit in the 0-90 ms window shipped action games use: a light
 * gun never stops time on a plain hit, a heavy or melee blow does briefly, and a kill always reads.
 *
 * @capability impact-feel default impact sparks, surface marks and hit-stop per weapon or vehicle class
 */
export const IMPACT_PROFILES: Readonly<Record<ImpactClass, ImpactProfile>> = {
  light: { sparks: { effect: "sparks/ricochet", count: 6 }, dust: { effect: "dust/impact", count: 4 }, markSize: 0.42, hitstopMs: 0, killHitstopMs: 45, kick: 0, kickRadius: 0 },
  medium: { sparks: { effect: "sparks/ricochet", count: 10 }, dust: { effect: "dust/impact", count: 8 }, markSize: 0.5, hitstopMs: 25, killHitstopMs: 60, kick: 0, kickRadius: 0 },
  heavy: { sparks: { effect: "sparks/weld", count: 16 }, dust: { effect: "dust/impact", count: 14 }, markSize: 0.7, hitstopMs: 50, killHitstopMs: 80, kick: 0.12, kickRadius: 6 },
  explosive: { sparks: { effect: "fire/ember", count: 18 }, dust: { effect: "explosion/debris", count: 16 }, markSize: 1.4, hitstopMs: 70, killHitstopMs: 90, kick: 0.55, kickRadius: 18 },
  melee: { sparks: { effect: "sparks/ricochet", count: 8 }, dust: { effect: "dust/impact", count: 10 }, markSize: 0, hitstopMs: 55, killHitstopMs: 85, kick: 0, kickRadius: 0 },
  vehicle: { sparks: { effect: "sparks/weld", count: 20 }, dust: { effect: "dust/impact", count: 18 }, markSize: 0, hitstopMs: 40, killHitstopMs: 70, kick: 0.3, kickRadius: 10 },
};

const NAME_RULES: readonly [RegExp, ImpactClass][] = [
  [/explo|grenade|rocket|missile|bomb|blast|mortar|\bshell\b|cannon|artillery|launcher|\bmine\b/, "explosive"],
  [/vehicle|\bram\b|crash|collision|\bcar\b|truck|run ?over/, "vehicle"],
  [/melee|punch|kick|\bfist|sword|blade|\baxe|knife|\bclub|\bbat\b|hammer|bash|slash|claw|bite|stab/, "melee"],
  [/shotgun|sniper|rifle|\bslug|magnum|\bheavy|\blmg|minigun|railgun/, "heavy"],
  [/\bsmg|carbine|assault|\bburst|arrow|\bbolt|crossbow/, "medium"],
];

/**
 * The class for a damage type or effect id. An explicit `classes` entry wins; otherwise the name is
 * matched against weapon words (`grenade` → explosive, `shotgun` → heavy, `sword` → melee), and
 * anything unrecognized is `light`.
 */
export function impactClassFor(type: string, classes?: Readonly<Record<string, ImpactClass>>): ImpactClass {
  const explicit = classes?.[type];
  if (explicit !== undefined) return explicit;
  const key = type.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  for (const [pattern, cls] of NAME_RULES) if (pattern.test(key)) return cls;
  return "light";
}
