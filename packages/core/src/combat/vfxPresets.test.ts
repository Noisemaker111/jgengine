import { describe, expect, test } from "bun:test";

import { DEFAULT_VFX_PRESET, resolveVfxPreset, vfxPresets } from "./vfxPresets";

describe("vfxPresets", () => {
  test("every preset names a valid archetype and a color", () => {
    const kinds = new Set(["projectile", "beam", "nova", "glow", "spark"]);
    for (const [name, preset] of Object.entries(vfxPresets)) {
      expect(kinds.has(preset.kind), `${name} kind`).toBe(true);
      expect(typeof preset.color, `${name} color`).toBe("number");
    }
  });

  test("resolves a named flavor to its archetype and color", () => {
    expect(resolveVfxPreset("arrow")).toMatchObject({ kind: "projectile", color: 0xd8c9a0 });
    expect(resolveVfxPreset("lightning").kind).toBe("beam");
    expect(resolveVfxPreset("web").kind).toBe("beam");
    expect(resolveVfxPreset("slash").kind).toBe("spark");
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
