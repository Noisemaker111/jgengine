import { describe, expect, test } from "bun:test";

import { DEFAULT_GRAPHICS_PROFILES } from "../settings/graphicsProfile";
import type { GraphicsQuality } from "../settings/settingsModel";
import { createParticleSystem } from "./particles";
import { planParticleBudget } from "./particleBudget";
import { DEFAULT_EFFECT, EFFECT_LIBRARY, EFFECT_PRIORITY, effectNames, findEffect, resolveEffect } from "./effectLibrary";

const REQUIRED_GROUPS = ["fire", "smoke", "sparks", "dust", "splash", "muzzle", "explosion", "magic", "weather"] as const;

describe("effect library", () => {
  test("names every required family and keeps names unique", () => {
    const groups = new Set(EFFECT_LIBRARY.map((effect) => effect.group));
    for (const group of REQUIRED_GROUPS) expect(groups.has(group)).toBe(true);
    expect(new Set(effectNames()).size).toBe(EFFECT_LIBRARY.length);
    expect(effectNames()).toContain(DEFAULT_EFFECT);
  });

  test("every effect authors a rate, lifetime, size, colour and texture", () => {
    for (const effect of EFFECT_LIBRARY) {
      expect(effect.texture.length).toBeGreaterThan(0);
      expect(effect.config.lifetime).toBeDefined();
      expect(effect.config.size).toBeDefined();
      expect(effect.config.colorStart).toBeDefined();
      expect(effect.config.max).toBeGreaterThan(0);
      expect(effect.burst).toBeGreaterThan(0);
      if (effect.mode === "continuous") expect(effect.config.rate).toBeGreaterThan(0);
      expect(effect.priority).toBe(EFFECT_PRIORITY[effect.group]);
    }
  });

  test("resolveEffect maps the texture to a GPU sprite shape and applies overrides", () => {
    const flame = resolveEffect("fire/flame");
    expect(flame.render.shape).toBe("flame");
    expect(flame.blending).toBe("additive");
    expect(flame.options.priority).toBe(EFFECT_PRIORITY.fire);

    const placed = resolveEffect("explosion/core", { position: [3, 1, -2], burst: 8, config: { colorStart: 0x00ff00 } });
    expect(placed.config.position).toEqual([3, 1, -2]);
    expect(placed.config.colorStart).toBe(0x00ff00);
    expect(placed.burst).toBe(8);
    expect(placed.config.max).toBe(findEffect("explosion/core")!.config.max);

    const ring = resolveEffect("explosion/shockwave");
    expect(ring.render.shape).toBe("ripple");

    const unknown = resolveEffect("does/not/exist");
    expect(unknown.name).toBe(DEFAULT_EFFECT);
  });

  test("priorities put ambient dressing below gameplay-loud effects", () => {
    expect(EFFECT_PRIORITY.weather).toBeLessThan(EFFECT_PRIORITY.dust);
    expect(EFFECT_PRIORITY.dust).toBeLessThan(EFFECT_PRIORITY.smoke);
    expect(EFFECT_PRIORITY.smoke).toBeLessThan(EFFECT_PRIORITY.fire);
    expect(EFFECT_PRIORITY.fire).toBeLessThan(EFFECT_PRIORITY.explosion);
  });
});

/** Live particles the whole library holds at one graphics tier, on the real pooled simulators. */
function measureTier(quality: GraphicsQuality): { cap: number; live: number; admitted: number; dropped: string[] } {
  const cap = DEFAULT_GRAPHICS_PROFILES[quality].particleBudget;
  const plan = planParticleBudget(
    EFFECT_LIBRARY.map((effect) => ({ id: effect.name, priority: effect.priority, requested: effect.config.max ?? 512 })),
    cap,
  );
  let live = 0;
  for (const grant of plan.grants) {
    const effect = findEffect(grant.id)!;
    const system = createParticleSystem({ ...effect.config, max: grant.particles, seed: grant.id });
    if (effect.mode === "burst") system.emit(effect.burst);
    for (let step = 0; step < 120; step += 1) system.update(1 / 60);
    live += system.count();
  }
  return { cap, live, admitted: plan.grants.length, dropped: plan.dropped };
}

describe("graphics-tier particle cap", () => {
  test("the whole library stays inside each tier's live particle cap", () => {
    for (const quality of ["low", "medium", "high"] as const) {
      const measured = measureTier(quality);
      expect(measured.live).toBeGreaterThan(0);
      expect(measured.live).toBeLessThanOrEqual(measured.cap);
    }
  });

  test("a lower tier drops more effects than a higher one", () => {
    const low = measureTier("low");
    const high = measureTier("high");
    expect(low.dropped.length).toBeGreaterThan(high.dropped.length);
    expect(high.live).toBeGreaterThan(low.live);
    expect(high.dropped.every((id) => findEffect(id) !== undefined)).toBe(true);
  });
});
