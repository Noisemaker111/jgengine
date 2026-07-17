import { describe, expect, test } from "bun:test";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AmmoCounter,
  barTokens,
  BossBar,
  DEFAULT_BAR_TOKENS,
  ExperienceBar,
  HealthBar,
  ManaBar,
  ShieldBar,
  SoulBar,
} from "./bars";

describe("barTokens", () => {
  test("binds only the passed tokens to their CSS custom properties", () => {
    const style = barTokens({ health: "#00ff00", shield: "#0000ff" }) as Record<string, string>;
    expect(style["--jg-health"]).toBe("#00ff00");
    expect(style["--jg-shield"]).toBe("#0000ff");
    expect(style["--jg-mana"]).toBeUndefined();
  });
});

describe("atomic bars render from an explicit value with no provider", () => {
  test("each purpose-named bar renders its own data-bar marker", () => {
    const cases: [FC<any>, string][] = [
      [HealthBar, "health"],
      [ShieldBar, "shield"],
      [ManaBar, "mana"],
      [ExperienceBar, "xp"],
      [SoulBar, "soul"],
    ];
    for (const [Component, marker] of cases) {
      const html = renderToStaticMarkup(createElement(Component, { value: 50, max: 100 }));
      expect(html).toContain(`data-bar="${marker}"`);
    }
  });

  test("fill fraction clamps to 0..1 from value/min/max", () => {
    expect(renderToStaticMarkup(createElement(HealthBar, { value: 30, max: 120 }))).toContain('data-fill-fraction="0.2500"');
    expect(renderToStaticMarkup(createElement(HealthBar, { value: 999, max: 100 }))).toContain('data-fill-fraction="1.0000"');
    expect(renderToStaticMarkup(createElement(HealthBar, { value: -5, max: 100 }))).toContain('data-fill-fraction="0.0000"');
  });

  test("shows the centered current / max readout by default and hides it when asked", () => {
    expect(renderToStaticMarkup(createElement(HealthBar, { value: 42, max: 100 }))).toContain("42 / 100");
    expect(renderToStaticMarkup(createElement(HealthBar, { value: 42, max: 100, showValue: false }))).not.toContain("42 / 100");
  });
});

describe("HealthBar danger threshold", () => {
  test("flags data-low below a quarter full, not above", () => {
    expect(renderToStaticMarkup(createElement(HealthBar, { value: 10, max: 100 }))).toContain("data-low");
    expect(renderToStaticMarkup(createElement(HealthBar, { value: 80, max: 100 }))).not.toContain("data-low");
  });

  test("uses the low token color when in danger", () => {
    const html = renderToStaticMarkup(createElement(HealthBar, { value: 5, max: 100 }));
    expect(html).toContain("--jg-health-low");
    expect(html).toContain(DEFAULT_BAR_TOKENS.healthLow);
  });
});

describe("tokens drive the look (global theming)", () => {
  test("bars read the shared CSS vars with the documented defaults", () => {
    const html = renderToStaticMarkup(createElement(ShieldBar, { value: 50, max: 100 }));
    expect(html).toContain("var(--jg-shield");
    expect(html).toContain(DEFAULT_BAR_TOKENS.shield);
    expect(html).toContain("var(--jg-bar-track");
  });
});

describe("segments and composition", () => {
  test("SoulBar / segmented bars draw divider ticks", () => {
    const html = renderToStaticMarkup(createElement(SoulBar, { value: 3, max: 5, segments: 5 }));
    // 5 segments -> 4 internal dividers
    expect(html.split("left:").length - 1).toBeGreaterThanOrEqual(4);
  });

  test("an end-cap slot composes a portrait beside the bar without bundling it", () => {
    const html = renderToStaticMarkup(
      createElement(HealthBar, { value: 50, max: 100, endCap: createElement("span", { "data-portrait": "" }) }),
    );
    expect(html).toContain("data-portrait");
  });
});

describe("BossBar", () => {
  test("renders a boss-tinted bar with the encounter name", () => {
    const html = renderToStaticMarkup(createElement(BossBar, { value: 900, max: 1000, name: "Ancient Wyrm" }));
    expect(html).toContain('data-bar="boss"');
    expect(html).toContain("Ancient Wyrm");
  });
});

describe("AmmoCounter", () => {
  test("shows loaded, a reserve tally, and a magazine-segmented meter", () => {
    const html = renderToStaticMarkup(createElement(AmmoCounter, { loaded: 12, reserve: 90, magazine: 30 }));
    expect(html).toContain('data-bar="ammo"');
    expect(html).toContain("/90");
    expect(html).toContain('data-fill-fraction="0.4000"'); // 12 / 30
  });
});
