import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HealthBar } from "./bars";
import { HudFrame } from "./hudFrame";
import {
  HUD_THEME_PRESETS,
  defaultHudTheme,
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
