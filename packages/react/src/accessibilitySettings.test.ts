import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ACCESSIBILITY_SETTING_IDS } from "@jgengine/core/settings/accessibilitySettings";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";

import { HudThemeRoot } from "./hudThemeRoot";
import { SettingsProvider } from "./settings";
import { useAccessibilitySettings, useAccessibilityRows, useHoldVsToggle } from "./accessibilitySettings";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("HudThemeRoot accessibility", () => {
  test("scales type and exposes every preference as a data hook", () => {
    const html = renderToStaticMarkup(
      createElement(
        HudThemeRoot,
        { accessibility: { textScale: 1.5, reducedMotion: true, highContrast: true, colorblind: "deuteranopia", captions: true } },
        createElement("p", null, "HUD"),
      ),
    );
    expect(html).toContain("--jg-text-scale:1.5");
    expect(html).toContain('data-reduced-motion="true"');
    expect(html).toContain('data-high-contrast="true"');
    expect(html).toContain('data-colorblind="deuteranopia"');
    expect(html).toContain('data-captions="true"');
  });

  test("leaves the defaults alone when no accessibility state is given", () => {
    const html = renderToStaticMarkup(createElement(HudThemeRoot, null, createElement("p", null, "HUD")));
    expect(html).toContain("--jg-text-scale:1");
    expect(html).not.toContain("data-reduced-motion");
  });
});

function Probe() {
  const state = useAccessibilitySettings();
  const hold = useHoldVsToggle();
  const rows = useAccessibilityRows();
  return createElement("output", null, JSON.stringify({ textScale: state.textScale, reduced: state.reducedMotion, hold, rows: rows.map((row) => row.id) }));
}

describe("accessibility settings hooks", () => {
  test("read the shared settings store", () => {
    const store = createSettingsStore(memoryStorage());
    store.set(ACCESSIBILITY_SETTING_IDS.textScale, 1.3);
    store.set(ACCESSIBILITY_SETTING_IDS.reducedMotion, true);
    store.set(ACCESSIBILITY_SETTING_IDS.holdVsToggle, "toggle");
    const html = renderToStaticMarkup(createElement(SettingsProvider, { store }, createElement(Probe)));
    expect(html).toContain('&quot;textScale&quot;:1.3');
    expect(html).toContain('&quot;reduced&quot;:true');
    expect(html).toContain('&quot;hold&quot;:&quot;toggle&quot;');
    expect(html).toContain(ACCESSIBILITY_SETTING_IDS.colorblind);
    expect(html).toContain(ACCESSIBILITY_SETTING_IDS.captions);
  });
});
