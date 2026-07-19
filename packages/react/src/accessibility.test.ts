import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccessibilityProvider, ColorblindFilters, useAccessibility } from "./accessibility";
import { createAccessibilityStore } from "@jgengine/core/ui/accessibility";

function render(store = createAccessibilityStore(), child: () => unknown = () => null): string {
  return renderToStaticMarkup(
    createElement(AccessibilityProvider, { store, children: createElement(child as never) }),
  );
}

describe("AccessibilityProvider", () => {
  test("exposes the text-scale var and default data attributes", () => {
    const html = render(createAccessibilityStore({ textScale: 1.5 }));
    expect(html).toContain("data-accessibility");
    expect(html).toContain("--jg-text-scale:1.5");
    expect(html).toContain('data-reduced-motion="false"');
    expect(html).toContain('data-colorblind="none"');
    expect(html).not.toContain("filter:url"); // no filter when colorblind is none
  });

  test("applies the colorblind filter and reflects the mode + reduced motion", () => {
    const html = render(createAccessibilityStore({ colorblind: "deuteranopia", reducedMotion: true, highContrast: true }));
    expect(html).toContain('data-colorblind="deuteranopia"');
    expect(html).toContain('data-reduced-motion="true"');
    expect(html).toContain('data-high-contrast="true"');
    expect(html).toContain("filter:url(#jg-cb-deuteranopia)");
  });

  test("renders the colorblind filter defs (referenceable by id)", () => {
    const html = render();
    expect(html).toContain('id="jg-cb-protanopia"');
    expect(html).toContain('id="jg-cb-grayscale"');
    expect(html).toContain("feColorMatrix");
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
