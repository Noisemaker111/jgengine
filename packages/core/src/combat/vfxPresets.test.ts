import { describe, expect, test } from "bun:test";

import { DEFAULT_VFX_PRESET, resolveVfxPreset, vfxPresets } from "./vfxPresets";

describe("vfxPresets", () => {
  test("every preset names a valid archetype and a color", () => {
    const kinds = new Set(["projectile", "beam", "nova", "glow", "spark", "arc"]);
    for (const [name, preset] of Object.entries(vfxPresets)) {
      expect(kinds.has(preset.kind), `${name} kind`).toBe(true);
      expect(typeof preset.color, `${name} color`).toBe("number");
    }
  });

  test("resolves a named flavor to its archetype and color", () => {
    expect(resolveVfxPreset("arrow")).toMatchObject({ kind: "projectile", color: 0xd8c9a0 });
    expect(resolveVfxPreset("lightning").kind).toBe("beam");
    expect(resolveVfxPreset("web").kind).toBe("beam");
    expect(resolveVfxPreset("slash").kind).toBe("arc");
    expect(resolveVfxPreset("hit").kind).toBe("spark");
    expect(resolveVfxPreset("shield").kind).toBe("glow");
    expect(resolveVfxPreset("explosion")).toMatchObject({ kind: "nova", radius: 3 });
  });

  test("overrides win field by field over the preset", () => {
    const resolved = resolveVfxPreset("fireball", { color: 0x00ff00, durationMs: 999 });
    expect(resolved.kind).toBe("projectile");
    expect(resolved.color).toBe(0x00ff00);
    expect(resolved.durationMs).toBe(999);
  });

  test("an unknown flavor falls back to the default preset instead of throwing", () => {
    expect(resolveVfxPreset("no-such-flavor")).toEqual(vfxPresets[DEFAULT_VFX_PRESET]);
    expect(resolveVfxPreset(undefined)).toEqual(vfxPresets[DEFAULT_VFX_PRESET]);
  });

  test("omits durationMs/radius when neither preset nor override supplies them", () => {
    const resolved = resolveVfxPreset("arrow");
    expect("durationMs" in resolved).toBe(false);
    expect("radius" in resolved).toBe(false);
  });
});

describe("melee swing presets", () => {
  test("slash, sword and melee draw a coloured arc, not a white spark burst", () => {
    for (const name of ["slash", "sword", "melee"] as const) {
      const preset = resolveVfxPreset(name);
      expect(preset.kind, name).toBe("arc");
      const [r, g, b] = [(preset.color >> 16) & 0xff, (preset.color >> 8) & 0xff, preset.color & 0xff];
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${name} saturation`).toBeGreaterThan(60);
    }
  });
});
