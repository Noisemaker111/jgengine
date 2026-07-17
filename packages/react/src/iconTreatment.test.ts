import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IconTreatment, schoolForAction, schoolForItem, treatedItemIcon } from "./iconTreatment";

describe("schoolForItem / schoolForAction", () => {
  test("infers a school from keywords, else neutral", () => {
    expect(schoolForItem("fire_bomb")).toBe("fire");
    expect(schoolForItem("ice_wand")).toBe("frost");
    expect(schoolForItem("iron_sword")).toBe("steel");
    expect(schoolForAction("cast_heal")).toBe("holy");
    expect(schoolForItem("mystery_thing")).toBe("neutral");
  });
});

describe("IconTreatment", () => {
  test("renders a school-keyed gradient face with the glyph", () => {
    const html = renderToStaticMarkup(createElement(IconTreatment, { icon: "sword", school: "fire" }));
    expect(html).toContain('data-icon-treatment="fire"');
    expect(html).toContain("radial-gradient");
    // GameIcon renders an svg
    expect(html).toContain("<svg");
  });

  test("draws a count badge only when the stack is > 1", () => {
    expect(renderToStaticMarkup(createElement(IconTreatment, { icon: "bomb", count: 12 }))).toContain("data-count");
    expect(renderToStaticMarkup(createElement(IconTreatment, { icon: "bomb", count: 1 }))).not.toContain("data-count");
  });

  test("reads the theme slot tokens and the accent for active state", () => {
    const idle = renderToStaticMarkup(createElement(IconTreatment, { icon: "sword" }));
    expect(idle).toContain("var(--jg-slot-border");
    const active = renderToStaticMarkup(createElement(IconTreatment, { icon: "sword", active: true }));
    expect(active).toContain("var(--jg-accent");
  });

  test("an explicit glyph node wins over the icon name", () => {
    const html = renderToStaticMarkup(
      createElement(IconTreatment, { glyph: createElement("i", { "data-custom": "" }), icon: "sword" }),
    );
    expect(html).toContain("data-custom");
  });
});

describe("treatedItemIcon", () => {
  test("resolves a GameIcon glyph and a count badge from an item id", () => {
    const html = renderToStaticMarkup(treatedItemIcon("longsword", { count: 4 }) as ReactElement);
    expect(html).toContain("<svg"); // sword glyph
    expect(html).toContain("data-count");
  });
});
