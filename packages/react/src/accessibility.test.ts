import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccessibilityProvider, ColorblindFilters, ColorblindFrame, useAccessibility, useColorblindMode } from "./accessibility";
import { createAccessibilityStore } from "@jgengine/core/ui/accessibility";
import { ACCESSIBILITY_SETTING_IDS } from "@jgengine/core/settings/accessibilitySettings";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";

function render(store = createAccessibilityStore(), child: () => unknown = () => null): string {
  return renderToStaticMarkup(
    createElement(AccessibilityProvider, { store, children: createElement(child as never) }),
  );
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("AccessibilityProvider", () => {
  test("exposes the text-scale var and default data attributes", () => {
    const html = render(createAccessibilityStore({ textScale: 1.5 }));
    expect(html).toContain("data-accessibility");
    expect(html).toContain("--jg-text-scale:1.5");
    expect(html).toContain('data-reduced-motion="false"');
    expect(html).toContain('data-colorblind="none"');
    expect(html).not.toContain("filter:");
  });

  test("reflects the mode and reduced motion without filtering its own subtree", () => {
    const html = render(createAccessibilityStore({ colorblind: "deuteranopia", reducedMotion: true, highContrast: true }));
    expect(html).toContain('data-colorblind="deuteranopia"');
    expect(html).toContain('data-reduced-motion="true"');
    expect(html).toContain('data-high-contrast="true"');
    // The provider is the HUD/menu root: filtering it would recolour the text the rest of the UI assumes.
    expect(html).not.toContain("filter:");
  });

  test("useAccessibility exposes live state to children", () => {
    function Readout() {
      const { state } = useAccessibility();
      return createElement("span", { "data-scale": state.textScale }, state.colorblind);
    }
    const html = render(createAccessibilityStore({ colorblind: "tritanopia", textScale: 1.25 }), Readout);
    expect(html).toContain('data-scale="1.25"');
    expect(html).toContain("tritanopia");
  });

  test("useAccessibility throws without a provider", () => {
    function Bare() {
      useAccessibility();
      return null;
    }
    expect(() => renderToStaticMarkup(createElement(Bare))).toThrow(/AccessibilityProvider/);
  });
});

describe("ColorblindFilters", () => {
  test("renders all four filter defs standalone", () => {
    const html = renderToStaticMarkup(createElement(ColorblindFilters));
    for (const id of ["jg-cb-protanopia", "jg-cb-deuteranopia", "jg-cb-tritanopia", "jg-cb-grayscale"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});

describe("ColorblindFrame", () => {
  test("filters the frame and leaves everything outside it alone", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(ColorblindFrame, { mode: "protanopia" }, createElement("canvas", { "data-frame": "" })),
        createElement("p", { "data-hud": "" }, "Health 100"),
      ),
    );
    const frame = html.slice(html.indexOf("data-colorblind-frame"), html.indexOf("data-hud"));
    const hud = html.slice(html.indexOf("data-hud"));
    expect(frame).toContain("filter:url(#jg-cb-protanopia)");
    expect(html).toContain('id="jg-cb-protanopia"');
    expect(hud).not.toContain("filter:");
  });

  test("carries no filter when colour vision is off", () => {
    const html = renderToStaticMarkup(createElement(ColorblindFrame, { mode: "none" }, createElement("canvas", null)));
    expect(html).toContain('data-colorblind-frame="none"');
    expect(html).not.toContain("filter:");
  });
});

describe("useColorblindMode", () => {
  function Probe({ store }: { store: ReturnType<typeof createSettingsStore> }) {
    return createElement("output", null, useColorblindMode(store));
  }

  test("reads the mode the settings rows write", () => {
    const store = createSettingsStore(memoryStorage());
    expect(renderToStaticMarkup(createElement(Probe, { store }))).toContain(">none<");
    store.set(ACCESSIBILITY_SETTING_IDS.colorblind, "tritanopia");
    expect(renderToStaticMarkup(createElement(Probe, { store }))).toContain(">tritanopia<");
  });
});
