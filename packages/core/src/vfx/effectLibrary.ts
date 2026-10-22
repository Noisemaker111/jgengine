import type { ParticleAttachOptions, ParticleBlendHint, ParticleRenderHint } from "./particleDirector";
import type { EmitterConfig, Vec3 } from "./particles";

/** The family an effect belongs to; groups the library browser and the contact sheet. */
export type EffectGroup =
  | "fire"
  | "smoke"
  | "sparks"
  | "dust"
  | "splash"
  | "muzzle"
  | "explosion"
  | "magic"
  | "weather";

/**
 * The procedural sprite family a particle draws with on the GPU path. Each family maps to a
 * {@link ParticleRenderHint} shape: `soft` puffs, velocity-stretched `spark` streaks, `flake`
 * crystals, `flame` tongues, `smoke` puffs, connected `ribbon` trails and flat `ring` ripples.
 * There is no image file to load or credit — the field is the authored name for the sprite.
 */
export type EffectTexture = "soft" | "spark" | "flake" | "flame" | "smoke" | "ribbon" | "ring";

const TEXTURE_SHAPE: Record<EffectTexture, ParticleRenderHint["shape"]> = {
  soft: "point",
  spark: "streak",
  flake: "flake",
  flame: "flame",
  smoke: "smoke",
  ribbon: "ribbon",
  ring: "ripple",
};

/**
 * One named effect a game or the editor plays by name. Every field is data: the `config` is the
 * same `EmitterConfig` a hand-authored emitter uses, so a library effect serializes, retunes and
 * renders on the existing pooled GPU path without a second implementation.
 */
export interface ParticleEffect {
  /** Stable name, e.g. `fire/flame`. Names are the data contract; configs are not. */
  name: string;
  /** Human label for pickers and contact sheets. */
  title: string;
  group: EffectGroup;
  /**
   * Drop order under the graphics-tier particle budget: higher survives, lower is dropped first.
   * Gameplay-loud effects (explosions, muzzle flashes) outrank ambient dressing (dust, weather).
   */
  priority: number;
  /** `continuous` emits from `rate`; `burst` emits `burst` particles per play. */
  mode: "continuous" | "burst";
  /** Particles emitted per one-shot `play`, and the pool size a standing emitter may reach. */
  burst: number;
  texture: EffectTexture;
  /** Velocity streak length in seconds for `spark`/`ribbon` textures. Default 0.08. */
  stretch?: number;
  blending: ParticleBlendHint;
  config: EmitterConfig;
  /** Attachment defaults (follow, offset, space, collision child, environment influence). */
  options?: Omit<ParticleAttachOptions, "priority">;
}

/** Ambient dressing drops first, then gameplay-loud effects last. */
export const EFFECT_PRIORITY = {
  weather: 20,
  dust: 40,
  smoke: 60,
  magic: 70,
  sparks: 70,
  fire: 80,
  splash: 80,
  muzzle: 90,
  explosion: 90,
} as const satisfies Record<EffectGroup, number>;

/**
 * The shared library of named particle effects: fire, smoke, sparks, dust, splashes, muzzle flash,
 * explosions, magic and weather. Each entry is authored parameters only — rate, lifetime, size,
 * colour and the sprite texture — so a game calls `ctx.particles.play("explosion/core", at)` and
 * the editor authors the same name instead of hand-tuning an `EmitterConfig`. Names are the
 * contract; a config retune here changes every consumer deliberately.
 */
export const EFFECT_LIBRARY: readonly ParticleEffect[] = [
  // Fire — additive flame tongues that rise, shrink and cool from yellow to deep red.
  {
    name: "fire/flame", title: "Flame", group: "fire", priority: EFFECT_PRIORITY.fire, mode: "continuous", burst: 48, texture: "flame", blending: "additive",
    config: { rate: 180, max: 256, direction: [0, 1, 0], spread: 0.5, speed: { min: 2.2, max: 3.8 }, gravity: [0, 1.5, 0], drag: 0.4, lifetime: { min: 0.7, max: 1.3 }, size: { start: 1.6, end: 0.1 }, colorStart: 0xffd24a, colorEnd: 0xff2a00, alpha: { start: 1, end: 0 } },
  },
  {
    name: "fire/torch", title: "Torch", group: "fire", priority: EFFECT_PRIORITY.fire, mode: "continuous", burst: 32, texture: "flame", blending: "additive",
    config: { rate: 60, max: 96, direction: [0, 1, 0], spread: 0.35, speed: { min: 1, max: 1.8 }, gravity: [0, 1.2, 0], drag: 0.5, lifetime: { min: 0.45, max: 0.8 }, size: { start: 0.5, end: 0.05 }, colorStart: 0xffe08a, colorEnd: 0xff5a1a, alpha: { start: 1, end: 0 } },
  },
  {
    name: "fire/ember", title: "Embers", group: "fire", priority: EFFECT_PRIORITY.fire, mode: "burst", burst: 24, texture: "spark", stretch: 0.1, blending: "additive",
    config: { max: 128, direction: [0, 1, 0], spread: 0.9, speed: { min: 1.2, max: 3 }, gravity: [0, 0.4, 0], drag: 0.3, lifetime: { min: 1.4, max: 2.6 }, size: { start: 0.16, end: 0.04 }, colorStart: 0xffc24a, colorEnd: 0xff3a00, alpha: { start: 1, end: 0 } },
  },

  // Smoke — normal-blended grey that grows as it fades.
  {
    name: "smoke/plume", title: "Smoke plume", group: "smoke", priority: EFFECT_PRIORITY.smoke, mode: "continuous", burst: 24, texture: "smoke", blending: "normal",
    config: { rate: 36, max: 192, direction: [0.35, 1, 0], spread: 0.35, speed: { min: 0.8, max: 1.4 }, gravity: [0.2, 0.3, 0], drag: 0.6, lifetime: { min: 2.5, max: 4 }, size: { start: 1.2, end: 4 }, colorStart: 0xb2b8be, colorEnd: 0x40454a, alpha: { start: 0.5, end: 0 } },
  },
  {
    name: "smoke/puff", title: "Smoke puff", group: "smoke", priority: EFFECT_PRIORITY.smoke, mode: "burst", burst: 12, texture: "smoke", blending: "normal",
    config: { max: 64, direction: [0, 1, 0], spread: 0.7, speed: { min: 0.4, max: 1.1 }, drag: 0.8, lifetime: { min: 0.8, max: 1.6 }, size: { start: 0.6, end: 2.4 }, colorStart: 0x9aa0a6, colorEnd: 0x2f3438, alpha: { start: 0.45, end: 0 } },
  },

  // Sparks — additive streaks under strong gravity.
  {
    name: "sparks/weld", title: "Weld sparks", group: "sparks", priority: EFFECT_PRIORITY.sparks, mode: "burst", burst: 20, texture: "spark", stretch: 0.12, blending: "additive",
    config: { max: 128, direction: [0, 1, 0], spread: 1.1, speed: { min: 4, max: 8 }, gravity: [0, -14, 0], lifetime: { min: 0.4, max: 0.9 }, size: { start: 0.22, end: 0.04 }, colorStart: 0xfff6d0, colorEnd: 0xff7a2a, alpha: { start: 1, end: 0 }, collision: { planeY: 0, response: "kill", maxEvents: 16 }, deathEvents: true },
  },
  {
    name: "sparks/fountain", title: "Spark fountain", group: "sparks", priority: EFFECT_PRIORITY.sparks, mode: "continuous", burst: 32, texture: "spark", stretch: 0.1, blending: "additive",
    config: { rate: 200, max: 384, direction: [0, 1, 0], spread: 0.85, speed: { min: 5, max: 8 }, gravity: [0, -12, 0], lifetime: { min: 0.9, max: 1.6 }, size: { start: 0.5, end: 0.08 }, colorStart: 0xfff2b0, colorEnd: 0xff8a3a, alpha: { start: 1, end: 0 } },
  },
  {
    name: "sparks/ricochet", title: "Ricochet", group: "sparks", priority: EFFECT_PRIORITY.sparks, mode: "burst", burst: 10, texture: "spark", stretch: 0.14, blending: "additive",
    config: { max: 48, direction: [0, 1, 0], spread: 1.4, speed: { min: 6, max: 11 }, gravity: [0, -16, 0], lifetime: { min: 0.2, max: 0.5 }, size: { start: 0.18, end: 0.03 }, colorStart: 0xffffff, colorEnd: 0xffb347, alpha: { start: 1, end: 0 } },
  },

  // Dust — normal-blended, low and wide.
  {
    name: "dust/impact", title: "Impact dust", group: "dust", priority: EFFECT_PRIORITY.dust, mode: "burst", burst: 16, texture: "soft", blending: "normal",
    config: { max: 96, direction: [0, 1, 0], spread: 1.5, speed: { min: 0.5, max: 1.8 }, gravity: [0, -1.2, 0], drag: 0.9, lifetime: { min: 0.5, max: 1.1 }, size: { start: 0.4, end: 1.6 }, colorStart: 0xc9c0ac, colorEnd: 0x8a8071, alpha: { start: 0.55, end: 0 } },
  },
  {
    name: "dust/plume", title: "Dust plume", group: "dust", priority: EFFECT_PRIORITY.dust, mode: "continuous", burst: 24, texture: "soft", blending: "normal",
    config: { rate: 30, max: 160, direction: [0.2, 1, 0], spread: 0.5, speed: { min: 0.4, max: 1.1 }, drag: 0.7, lifetime: { min: 1.6, max: 3 }, size: { start: 0.8, end: 3.2 }, colorStart: 0xbdb3a0, colorEnd: 0x6f6555, alpha: { start: 0.4, end: 0 } },
  },
  {
    name: "dust/motes", title: "Air motes", group: "dust", priority: EFFECT_PRIORITY.dust, mode: "continuous", burst: 12, texture: "soft", blending: "normal",
    config: { rate: 14, max: 80, direction: [0, 1, 0], spread: Math.PI, speed: { min: 0.05, max: 0.25 }, drag: 0.2, lifetime: { min: 3, max: 6 }, size: { start: 0.06, end: 0.03 }, colorStart: 0xfff4dc, colorEnd: 0xe8dcc0, alpha: { start: 0.5, end: 0 } },
  },

  // Splashes — a quick upward crown of droplets that falls back.
  {
    name: "splash/impact", title: "Water splash", group: "splash", priority: EFFECT_PRIORITY.splash, mode: "burst", burst: 22, texture: "soft", blending: "normal",
    config: { max: 96, direction: [0, 1, 0], spread: 1.1, speed: { min: 2.2, max: 4.5 }, gravity: [0, -9.8, 0], lifetime: { min: 0.35, max: 0.8 }, size: { start: 0.22, end: 0.06 }, colorStart: 0xdff1ff, colorEnd: 0x9fc4de, alpha: { start: 0.85, end: 0 } },
  },
  {
    name: "splash/rain", title: "Rain impact", group: "splash", priority: EFFECT_PRIORITY.splash, mode: "burst", burst: 8, texture: "soft", blending: "normal",
    config: { max: 48, direction: [0, 1, 0], spread: 0.9, speed: { min: 0.6, max: 1.4 }, gravity: [0, -9.8, 0], lifetime: { min: 0.2, max: 0.45 }, size: { start: 0.12, end: 0.03 }, colorStart: 0xd7ecff, colorEnd: 0x9ab6cc, alpha: { start: 0.7, end: 0 } },
  },

  // Muzzle flash — a very short, bright cone from the barrel, plus its smoke.
  {
    name: "muzzle/flash", title: "Muzzle flash", group: "muzzle", priority: EFFECT_PRIORITY.muzzle, mode: "burst", burst: 14, texture: "flame", blending: "additive",
    config: { max: 48, direction: [0, 0, 1], spread: 0.35, speed: { min: 3, max: 7 }, lifetime: { min: 0.05, max: 0.12 }, size: { start: 0.7, end: 0.1 }, colorStart: 0xfff6c0, colorEnd: 0xff9a2a, alpha: { start: 1, end: 0 } },
  },
  {
    name: "muzzle/smoke", title: "Muzzle smoke", group: "muzzle", priority: EFFECT_PRIORITY.muzzle, mode: "burst", burst: 8, texture: "smoke", blending: "normal",
    config: { max: 32, direction: [0, 0.2, 1], spread: 0.5, speed: { min: 0.6, max: 1.6 }, drag: 0.9, lifetime: { min: 0.4, max: 0.9 }, size: { start: 0.25, end: 1 }, colorStart: 0xb0b4b8, colorEnd: 0x4a4e52, alpha: { start: 0.4, end: 0 } },
  },

  // Explosions — a fireball core, thrown debris and a ground shockwave ring.
  {
    name: "explosion/core", title: "Explosion", group: "explosion", priority: EFFECT_PRIORITY.explosion, mode: "burst", burst: 40, texture: "flame", blending: "additive",
    config: { max: 160, direction: [0, 1, 0], spread: Math.PI, speed: { min: 3, max: 9 }, gravity: [0, 2, 0], drag: 1.2, lifetime: { min: 0.35, max: 0.8 }, size: { start: 1.8, end: 0.3 }, colorStart: 0xfff0b0, colorEnd: 0xff3a00, alpha: { start: 1, end: 0 } },
  },
  {
    name: "explosion/debris", title: "Explosion debris", group: "explosion", priority: EFFECT_PRIORITY.explosion, mode: "burst", burst: 20, texture: "soft", blending: "normal",
    config: { max: 96, direction: [0, 1, 0], spread: 1.3, speed: { min: 4, max: 10 }, gravity: [0, -16, 0], lifetime: { min: 0.6, max: 1.4 }, size: { start: 0.2, end: 0.06 }, colorStart: 0x6b6156, colorEnd: 0x3a342e, alpha: { start: 1, end: 0 }, collision: { planeY: 0, response: "bounce", restitution: 0.3, maxEvents: 24 }, deathEvents: true },
  },
  {
    name: "explosion/shockwave", title: "Shockwave", group: "explosion", priority: EFFECT_PRIORITY.explosion, mode: "burst", burst: 6, texture: "ring", blending: "additive",
    config: { max: 24, direction: [1, 0, 0], spread: Math.PI, speed: { min: 6, max: 9 }, drag: 1.4, lifetime: { min: 0.25, max: 0.45 }, size: { start: 1, end: 3.4 }, colorStart: 0xffe6b0, colorEnd: 0xff8a3a, alpha: { start: 0.7, end: 0 } },
  },

  // Magic — slow, floaty and bright.
  {
    name: "magic/cast", title: "Cast glow", group: "magic", priority: EFFECT_PRIORITY.magic, mode: "continuous", burst: 24, texture: "soft", blending: "additive",
    config: { rate: 50, max: 128, direction: [0, 1, 0], spread: Math.PI, speed: { min: 0.3, max: 1 }, drag: 0.8, lifetime: { min: 0.6, max: 1.4 }, size: { start: 0.5, end: 0.1 }, colorStart: 0xd98aff, colorEnd: 0x6a2ad0, alpha: { start: 0.9, end: 0 } },
  },
  {
    name: "magic/sparkle", title: "Sparkles", group: "magic", priority: EFFECT_PRIORITY.magic, mode: "burst", burst: 18, texture: "flake", blending: "additive",
    config: { max: 96, direction: [0, 1, 0], spread: Math.PI, speed: { min: 0.8, max: 2.4 }, drag: 0.6, lifetime: { min: 0.8, max: 1.8 }, size: { start: 0.18, end: 0.02 }, colorStart: 0xffffff, colorEnd: 0xbfe6ff, alpha: { start: 1, end: 0 } },
  },
  {
    name: "magic/heal", title: "Healing aura", group: "magic", priority: EFFECT_PRIORITY.magic, mode: "continuous", burst: 20, texture: "flake", blending: "additive",
    config: { rate: 34, max: 96, direction: [0, 1, 0], spread: 0.5, speed: { min: 0.6, max: 1.4 }, drag: 0.5, lifetime: { min: 1, max: 2 }, size: { start: 0.16, end: 0.03 }, colorStart: 0xd8ffc0, colorEnd: 0x4ec46a, alpha: { start: 0.9, end: 0 } },
  },

  // Weather — ambient dressing that yields the budget first.
  {
    name: "weather/rain-splash", title: "Rain splashes", group: "weather", priority: EFFECT_PRIORITY.weather, mode: "burst", burst: 10, texture: "soft", blending: "normal",
    config: { max: 64, direction: [0, 1, 0], spread: 1.2, speed: { min: 0.8, max: 1.8 }, gravity: [0, -9.8, 0], lifetime: { min: 0.18, max: 0.4 }, size: { start: 0.1, end: 0.02 }, colorStart: 0xcfe4f5, colorEnd: 0x8fa9bd, alpha: { start: 0.6, end: 0 } },
  },
  {
    name: "weather/snow-puff", title: "Snow puffs", group: "weather", priority: EFFECT_PRIORITY.weather, mode: "burst", burst: 12, texture: "flake", blending: "normal",
    config: { max: 64, direction: [0, 1, 0], spread: 1.2, speed: { min: 0.3, max: 0.9 }, gravity: [0, -0.6, 0], drag: 0.7, lifetime: { min: 0.6, max: 1.4 }, size: { start: 0.14, end: 0.04 }, colorStart: 0xffffff, colorEnd: 0xcfe0f0, alpha: { start: 0.9, end: 0 } },
  },
  {
    name: "weather/leaves", title: "Drifting leaves", group: "weather", priority: EFFECT_PRIORITY.weather, mode: "continuous", burst: 10, texture: "flake", blending: "normal",
    config: { rate: 8, max: 48, direction: [1, 0.2, 0], spread: 0.9, speed: { min: 0.4, max: 1.2 }, gravity: [0, -0.9, 0], drag: 0.9, lifetime: { min: 3, max: 6 }, size: { start: 0.2, end: 0.16 }, colorStart: 0xc7a45a, colorEnd: 0x7d5a2a, alpha: { start: 0.9, end: 0 } },
  },
];

const byName = new Map(EFFECT_LIBRARY.map((effect) => [effect.name, effect]));

/** The fallback effect used when a play call names an unknown effect — a typo still shows a spark. */
export const DEFAULT_EFFECT = "sparks/weld";

/** Every library effect name, for editor pickers and runtime discovery. */
export function effectNames(): readonly string[] {
  return EFFECT_LIBRARY.map((effect) => effect.name);
}

/** The named effect, or `undefined` when the name is not in the library.
 * @capability find-effect look up one named particle effect in the shared library, or undefined when unknown
 */
export function findEffect(name: string): ParticleEffect | undefined {
  return byName.get(name);
}

/** Per-call overrides merged over a library effect; each field wins over the authored default. */
export interface EffectOverride {
  config?: Partial<EmitterConfig>;
  options?: Partial<ParticleAttachOptions>;
  /** World position, or the standing emitter's origin when it does not follow an entity. */
  position?: Vec3;
  /** One-shot particle count; overrides the effect's authored `burst`. */
  burst?: number;
}

/** A library effect resolved into the exact data the director and renderer consume. */
export interface ResolvedEffect {
  name: string;
  group: EffectGroup;
  mode: ParticleEffect["mode"];
  priority: number;
  /** Particles a one-shot `play` emits. */
  burst: number;
  config: EmitterConfig;
  render: ParticleRenderHint;
  blending: ParticleBlendHint;
  /** Attach options including the resolved `priority`, ready for the director. */
  options: ParticleAttachOptions;
}

/**
 * Resolve a named effect into concrete emitter data, with any `override` winning field by field.
 * An unknown name resolves to {@link DEFAULT_EFFECT} rather than throwing, so a typo shows
 * *something*; call {@link findEffect} when the caller must reject an unknown name.
 *
 * @capability effect-resolve turn a named library effect into emitter config, GPU sprite texture, blending and budget priority with per-call overrides
 */
export function resolveEffect(name: string, override?: EffectOverride): ResolvedEffect {
  const effect = byName.get(name) ?? byName.get(DEFAULT_EFFECT)!;
  const { priority: overridePriority, render: overrideRender, ...optionOverrides } = override?.options ?? {};
  const render: ParticleRenderHint = overrideRender ?? { shape: TEXTURE_SHAPE[effect.texture], ...(effect.stretch === undefined ? {} : { stretch: effect.stretch }) };
  return {
    name: effect.name,
    group: effect.group,
    mode: effect.mode,
    priority: overridePriority ?? effect.priority,
    burst: override?.burst ?? effect.burst,
    config: {
      ...effect.config,
      ...override?.config,
      ...(override?.position === undefined ? {} : { position: override.position }),
    },
    render,
    blending: effect.blending,
    options: {
      ...effect.options,
      ...optionOverrides,
      blending: effect.blending,
      priority: overridePriority ?? effect.priority,
      render,
    },
  };
}
