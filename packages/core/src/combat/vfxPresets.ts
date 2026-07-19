import type { VfxKind } from "../game/events";

/**
 * A named visual flavor for a one-shot `combat.vfx` burst: the archetype (`kind`),
 * a `0xRRGGBB` tint, and optional default `durationMs`/`radius`. Purely presentation —
 * a preset never touches damage, range, or any authoritative value; it just answers
 * "what does this attack look like" so a game does not hand-roll colors and archetypes.
 */
export interface VfxPreset {
  kind: VfxKind;
  /** `0xRRGGBB` tint. */
  color: number;
  /** Overrides the shell's per-`kind` default lifetime when set. */
  durationMs?: number;
  /** Default effect radius for `nova`/aura flavors. */
  radius?: number;
}

/**
 * Ready-made visual flavors for the things players actually shoot, swing, and cast —
 * so `ctx.scene.entity.vfx({ preset: "arrow", from, to })` renders a visible bolt with
 * zero tuning, and `"lightning"`, `"web"`, `"slash"`, `"shield"`, `"heal"`, `"explosion"`
 * likewise just work. Each entry only picks a `kind` (`projectile | beam | nova | glow |
 * spark`), a color, and a lifetime; it is visual vocabulary (like named CSS colors), not a
 * gameplay archetype — combat numbers stay in the caller's own effect/ability data. Any
 * field passed to `vfx()` overrides the preset, and unknown names fall back to `spark` so a
 * flavor typo still shows *something* rather than nothing.
 *
 * @capability vfx-presets render a named attack visual (arrow, fireball, lightning, web, slash, shield, heal, explosion) in one call
 */
export const vfxPresets = {
  // Traveling bolts — a thing flies from caster to target.
  arrow: { kind: "projectile", color: 0xd8c9a0 },
  bolt: { kind: "projectile", color: 0xffffff },
  fireball: { kind: "projectile", color: 0xff6a1a, durationMs: 460 },
  firebolt: { kind: "projectile", color: 0xff7a2a },
  frostbolt: { kind: "projectile", color: 0x8ed2ff },
  ice: { kind: "projectile", color: 0x8ed2ff },
  poison: { kind: "projectile", color: 0x86e86a },
  shadowbolt: { kind: "projectile", color: 0x9a5df0 },
  arcane: { kind: "projectile", color: 0xd98aff },
  magicMissile: { kind: "projectile", color: 0xd98aff },
  holybolt: { kind: "projectile", color: 0xffe9a0 },
  rock: { kind: "projectile", color: 0xa89a86 },
  bullet: { kind: "projectile", color: 0xfff2b0, durationMs: 140 },

  // Connecting lines — a beam/tether links caster and target.
  lightning: { kind: "beam", color: 0xbfe6ff, durationMs: 200 },
  laser: { kind: "beam", color: 0xff4d4d },
  beam: { kind: "beam", color: 0x8ed2ff },
  web: { kind: "beam", color: 0xf0f0f0, durationMs: 320 },
  chain: { kind: "beam", color: 0xffe9a0 },

  // Melee / impact — a spark scatters at the point of contact.
  slash: { kind: "spark", color: 0xd6d0c4 },
  sword: { kind: "spark", color: 0xd6d0c4 },
  melee: { kind: "spark", color: 0xd6d0c4 },
  spark: { kind: "spark", color: 0xfff2b0 },
  hit: { kind: "spark", color: 0xffd27a },

  // Ground bursts — an expanding ring/shockwave from a point.
  explosion: { kind: "nova", color: 0xff8a3a, radius: 3 },
  blast: { kind: "nova", color: 0xff8a3a, radius: 3 },
  shockwave: { kind: "nova", color: 0xbfe6ff, radius: 3 },
  frostNova: { kind: "nova", color: 0x8ed2ff, radius: 3 },

  // Auras — a soft glow that lingers on caster or target.
  heal: { kind: "glow", color: 0x86e86a },
  buff: { kind: "glow", color: 0xffe9a0 },
  shield: { kind: "glow", color: 0x8ed2ff },
  cast: { kind: "glow", color: 0xd98aff },
} as const satisfies Record<string, VfxPreset>;

/** A named key into {@link vfxPresets} (`"arrow" | "fireball" | "lightning" | "web" | "slash" | "shield" | "heal" | ...`). */
export type VfxPresetName = keyof typeof vfxPresets;

/** The fallback flavor used when a `vfx()` call names an unknown preset — so a typo still shows a spark instead of nothing. */
export const DEFAULT_VFX_PRESET: VfxPresetName = "spark";

/**
 * Resolve a named visual flavor into a concrete `{ kind, color, durationMs?, radius? }`,
 * with any provided `overrides` winning field by field. An unknown name resolves to
 * {@link DEFAULT_VFX_PRESET} rather than throwing, so a flavor typo degrades to a visible
 * spark. Used by `ctx.scene.entity.vfx({ preset })`; call it directly when you need the raw
 * numbers (e.g. to seed a retained `vfxInstance` from the same vocabulary).
 *
 * @capability vfx-preset-resolve turn a named attack flavor into concrete vfx kind/color/duration with per-field overrides
 */
export function resolveVfxPreset(
  name: string | undefined,
  overrides?: Partial<VfxPreset>,
): VfxPreset {
  const base: VfxPreset =
    name !== undefined && name in vfxPresets
      ? vfxPresets[name as VfxPresetName]
      : vfxPresets[DEFAULT_VFX_PRESET];
  const durationMs = overrides?.durationMs ?? base.durationMs;
  const radius = overrides?.radius ?? base.radius;
  return {
    kind: overrides?.kind ?? base.kind,
    color: overrides?.color ?? base.color,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(radius === undefined ? {} : { radius }),
  };
}
