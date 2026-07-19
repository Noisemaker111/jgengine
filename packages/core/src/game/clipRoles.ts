import type { ModelAnimationConfig } from "./playableGame";

/**
 * Semantic animation roles a GLB clip name can map to. Rigged packs name the same motion
 * differently (`Idle` / `Walking_A` / `Armature|Run`); roles are the pack-agnostic vocabulary
 * the engine defaults from.
 */
export type ClipRole =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "hit"
  | "death"
  | "jump"
  | "spawn"
  | "interact"
  | "cheer";

/**
 * Keyword table driving {@link classifyClip}: lowercase keywords matched against a clip name's
 * tokens (exact token match beats prefix match). Extend or replace per game/pack — the table is
 * plain data, no genre assumptions.
 */
export interface ClipRoleTable {
  readonly roles: Readonly<Partial<Record<ClipRole, readonly string[]>>>;
  /** Tokens that disqualify a clip from classification entirely (e.g. `pose` for held-pose variants). */
  readonly exclude?: readonly string[];
}

/** Tie-break priority when a name matches several roles at equal strength ("Idle_Attack" → attack). */
const ROLE_PRIORITY: readonly ClipRole[] = [
  "death",
  "hit",
  "attack",
  "jump",
  "spawn",
  "interact",
  "cheer",
  "run",
  "walk",
  "idle",
];

/** Default vocabulary covering KayKit, Quaternius, and Mixamo-style clip naming. */
export const DEFAULT_CLIP_ROLE_TABLE: ClipRoleTable = {
  roles: {
    idle: ["idle"],
    walk: ["walk"],
    run: ["run", "sprint", "jog"],
    attack: ["attack", "punch", "slash", "shoot", "chop", "stab", "cast", "swing", "strike", "kick", "throw"],
    hit: ["hit", "receive", "impact", "hurt", "damage"],
    death: ["death", "die", "dead", "dying"],
    jump: ["jump"],
    spawn: ["spawn"],
    interact: ["interact", "use", "pickup"],
    cheer: ["cheer", "victory", "dance", "wave"],
  },
  exclude: ["pose"],
};

/** Lowercased tokens of a clip name: rig prefixes (`Armature|`, `mixamo.com|`) stripped, split on `_ - . space`. */
function tokenize(name: string): string[] {
  const segments = name.split("|");
  const last = segments[segments.length - 1] ?? name;
  return last
    .toLowerCase()
    .split(/[_\-. ]+/)
    .filter((token) => token.length > 0);
}

/**
 * Classify a single GLB clip name into a {@link ClipRole}, or `null` when nothing matches (or an
 * exclusion token like `pose` disqualifies it). Deterministic: exact token matches beat prefix
 * matches; remaining ties resolve by fixed role priority (death > hit > attack > … > idle).
 *
 * @capability clip-roles map a rigged asset's pack-specific clip name to its semantic animation role
 */
export function classifyClip(name: string, table: ClipRoleTable = DEFAULT_CLIP_ROLE_TABLE): ClipRole | null {
  const tokens = tokenize(name);
  if (tokens.length === 0) return null;
  const exclude = table.exclude ?? [];
  for (const token of tokens) {
    if (exclude.includes(token)) return null;
  }
  let best: { role: ClipRole; score: number } | null = null;
  for (const role of ROLE_PRIORITY) {
    const keywords = table.roles[role] ?? [];
    let score = 0;
    for (const token of tokens) {
      for (const keyword of keywords) {
        if (token === keyword) score = Math.max(score, 2);
        else if (token.startsWith(keyword)) score = Math.max(score, 1);
      }
    }
    if (score > 0 && (best === null || score > best.score)) best = { role, score };
  }
  return best?.role ?? null;
}

/**
 * Group a GLB's clip names by role. Each role's variants are sorted simplest-first — fewest name
 * tokens, then lexicographic — so the canonical variant (`Idle` over `2H_Melee_Idle`, KayKit
 * `Walking_A` over `Walking_B`) is always first: stable output for the same clip set regardless
 * of source order.
 */
export function rolesFromClips(
  clips: readonly string[],
  table: ClipRoleTable = DEFAULT_CLIP_ROLE_TABLE,
): Partial<Record<ClipRole, string[]>> {
  const roles: Partial<Record<ClipRole, string[]>> = {};
  for (const clip of clips) {
    const role = classifyClip(clip, table);
    if (role === null) continue;
    (roles[role] ??= []).push(clip);
  }
  for (const variants of Object.values(roles)) {
    variants.sort((a, b) => tokenize(a).length - tokenize(b).length || a.localeCompare(b));
  }
  return roles;
}

/** A role's variants as a one-shot binding: single name stays a string, several become a random-variant array. */
function oneShotSpec(variants: string[] | undefined): string | string[] | undefined {
  if (variants === undefined || variants.length === 0) return undefined;
  return variants.length === 1 ? variants[0] : variants;
}

/**
 * Build the default `ModelConfig.animation` for a rigged asset from its catalog clip names:
 * speed-driven idle/walk/run states plus hit/death/attack one-shots where identifiable. Returns
 * `undefined` when no idle clip is identifiable — an ambiguous rig renders its bind pose rather
 * than guessing. Walk falls back to idle when the pack has no walk clip.
 *
 * @capability clip-roles derive a complete default animation config from a rigged asset's clip names
 */
export function defaultAnimationForClips(
  clips: readonly string[],
  table: ClipRoleTable = DEFAULT_CLIP_ROLE_TABLE,
): ModelAnimationConfig | undefined {
  const roles = rolesFromClips(clips, table);
  const idle = roles.idle?.[0];
  if (idle === undefined) return undefined;
  const walk = roles.walk?.[0] ?? idle;
  const run = roles.run?.[0];
  const oneShots: Record<string, string | string[]> = {};
  const hit = oneShotSpec(roles.hit);
  const death = oneShotSpec(roles.death);
  const attack = oneShotSpec(roles.attack);
  if (hit !== undefined) oneShots.hit = hit;
  if (death !== undefined) oneShots.death = death;
  if (attack !== undefined) oneShots.attack = attack;
  return {
    states: { idle, walk, ...(run === undefined ? {} : { run }) },
    ...(Object.keys(oneShots).length === 0 ? {} : { oneShots }),
  };
}

/**
 * Collapse `ModelConfig.animation`'s widened union to a concrete playback config: explicit
 * configs pass through, `"none"`/absent render the bind pose, and `"auto"` derives states and
 * one-shots from the model's clip names via {@link defaultAnimationForClips}. The shell calls
 * this with the loaded GLB's actual clip names, so `"auto"` works on any rigged model —
 * catalog-resolved ids are stamped `"auto"` automatically.
 */
export function resolveAnimationConfig(
  animation: ModelAnimationConfig | "auto" | "none" | undefined,
  clips: readonly string[] | undefined,
  table: ClipRoleTable = DEFAULT_CLIP_ROLE_TABLE,
): ModelAnimationConfig | undefined {
  if (animation === undefined || animation === "none") return undefined;
  if (animation !== "auto") return animation;
  if (clips === undefined || clips.length === 0) return undefined;
  return defaultAnimationForClips(clips, table);
}
