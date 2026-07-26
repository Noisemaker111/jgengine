import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import fixture from "./hudThemeChromePresets.fixture.json";

import { HealthBar } from "./bars";
import { HudFrame } from "./hudFrame";
import {
  HUD_THEME_PRESETS,
  defaultHudTheme,
  deriveHudTheme,
  hudTheme,
  hudThemeVars,
  resolveHudTheme,
} from "./hudTheme";

describe("hudThemeVars", () => {
  test("emits the atomic-bar tokens plus frame/slot/ring tokens", () => {
    const vars = hudThemeVars(defaultHudTheme) as Record<string, string>;
    // bar tokens (same names the atomic bars read — proves one theme drives the bars)
    expect(vars["--jg-health"]).toBe(defaultHudTheme.palette.health);
    expect(vars["--jg-shield"]).toBe(defaultHudTheme.palette.shield);
    expect(vars["--jg-bar-height"]).toBe(defaultHudTheme.bar.height);
    // shared chrome tokens
    expect(vars["--jg-frame-bg"]).toBe(defaultHudTheme.frame.bg);
    expect(vars["--jg-slot-border"]).toBe(defaultHudTheme.slot.border);
    expect(vars["--jg-ring"]).toBe(defaultHudTheme.ring);
  });
});

describe("presets", () => {
  test("every preset is a complete theme with all palette keys", () => {
    for (const [name, theme] of Object.entries(HUD_THEME_PRESETS)) {
      for (const key of ["health", "mana", "shield", "xp", "accent"] as const) {
        expect(typeof theme.palette[key], `${name}.${key}`).toBe("string");
      }
      expect(theme.frame.radius.length).toBeGreaterThan(0);
    }
  });

  test("distinct presets produce distinct token blocks", () => {
    const arcane = JSON.stringify(hudThemeVars(HUD_THEME_PRESETS["arcane-stone"]));
    const military = JSON.stringify(hudThemeVars(HUD_THEME_PRESETS["military-flat"]));
    expect(arcane).not.toBe(military);
  });
});

describe("resolveHudTheme", () => {
  test("resolves a preset name, a full theme, and the default", () => {
    expect(resolveHudTheme("sleek-hex")).toBe(HUD_THEME_PRESETS["sleek-hex"]);
    expect(resolveHudTheme()).toBe(defaultHudTheme);
    expect(resolveHudTheme(defaultHudTheme)).toBe(defaultHudTheme);
  });
});

describe("one theme drives multiple primitives", () => {
  test("a themed HudFrame reads the frame tokens", () => {
    const html = renderToStaticMarkup(createElement(HudFrame, { variation: "themed" }));
    expect(html).toContain("var(--jg-frame-bg");
    expect(html).toContain("var(--jg-frame-glow");
  });

  test("a bar under a theme block reads the same tokens the theme sets", () => {
    const html = renderToStaticMarkup(createElement(HealthBar, { value: 50, max: 100 }));
    // the bar references --jg-health, which hudThemeVars sets — so the theme restyles it
    expect(html).toContain("var(--jg-health");
    expect(Object.keys(hudThemeVars(defaultHudTheme))).toContain("--jg-health");
  });
});

describe("the token vocabulary is one set (#1573)", () => {
  const vars = hudThemeVars(defaultHudTheme) as Record<string, string>;

  test("a theme emits the chrome tokens the registry blocks read", () => {
    for (const token of [
      "--jg-surface",
      "--jg-surface-deep",
      "--jg-edge",
      "--jg-edge-bright",
      "--jg-text",
      "--jg-text-dim",
      "--jg-backdrop",
      "--jg-danger",
      "--jg-warning",
      "--jg-success",
      "--jg-hostile",
      "--jg-friendly",
      "--jg-neutral",
      "--jg-font-display",
      "--jg-font-numeric",
      "--jg-font-body",
      "--jg-accent-deep",
      "--jg-accent-glow",
      "--jg-accent-dim",
      "--jg-rarity-common",
      "--jg-rarity-legendary",
      "--jg-health-deep",
      "--jg-xp-deep",
    ]) {
      expect(vars[token]).toBeString();
    }
  });

  test("every emitted token has a value", () => {
    for (const [token, value] of Object.entries(vars)) {
      expect(value, token).not.toBe("");
      expect(value, token).toBeDefined();
    }
  });
});

describe("deriveHudTheme", () => {
  test("a seed pair fills bars, frames, slots, and chrome together", () => {
    const derived = deriveHudTheme({ accent: "#e3b054", surface: "#17120d" });
    expect(derived.palette.accent).toBe("#e3b054");
    expect(derived.surface.surface).toBe("#17120d");
    // the seed reaches the groups a HudTheme could previously not express
    expect(derived.surface.edge).not.toBe(defaultHudTheme.surface.edge);
    expect(derived.frame.bg).toContain("23, 18, 13");
    expect(derived.bar.frame).toBe(derived.surface.surfaceDeep);
  });

  test("hudTheme fills unnamed groups from the default", () => {
    const partial = hudTheme({ palette: { accent: "#ff0000" } });
    expect(partial.palette.accent).toBe("#ff0000");
    expect(partial.rarity).toEqual(defaultHudTheme.rarity);
    expect(partial.font).toEqual(defaultHudTheme.font);
  });
});

describe("the chrome presets keep their pre-unification values (#1573)", () => {
  test("ember / synthwave / fieldkit emit every token they emitted before, unchanged", () => {
    for (const [name, before] of Object.entries(fixture as Record<string, Record<string, string>>)) {
      const after = hudThemeVars(HUD_THEME_PRESETS[name as "ember"]) as Record<string, string>;
      for (const [token, value] of Object.entries(before)) expect(after[token], `${name} ${token}`).toBe(value);
    }
  });
});
