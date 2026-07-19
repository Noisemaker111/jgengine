import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RadialMenu, type RadialMenuOption } from "./radialMenu";

const OPTIONS: readonly RadialMenuOption[] = [
  { id: "sword", label: "Sword" },
  { id: "bow", label: "Bow" },
  { id: "spell", label: "Spell", disabled: true },
  { id: "shield", label: "Shield" },
];

describe("RadialMenu", () => {
  test("renders a wedge per option with ids and labels", () => {
    const html = renderToStaticMarkup(createElement(RadialMenu, { options: OPTIONS, onSelect: () => {} }));
    expect(html).toContain("data-radial-menu");
    for (const option of OPTIONS) expect(html).toContain(`data-radial-option="${option.id}"`);
    expect(html).toContain("Sword");
    expect(html).toContain('data-disabled="true"'); // the disabled spell wedge
  });

  test("highlightIndex marks exactly one wedge highlighted and shows its label in the hub", () => {
    const html = renderToStaticMarkup(
      createElement(RadialMenu, { options: OPTIONS, onSelect: () => {}, highlightIndex: 1 }),
    );
    expect((html.match(/data-highlighted="true"/g) ?? []).length).toBe(1);
  });

  test("open=false and an empty option list render nothing", () => {
    expect(renderToStaticMarkup(createElement(RadialMenu, { options: OPTIONS, onSelect: () => {}, open: false }))).toBe("");
    expect(renderToStaticMarkup(createElement(RadialMenu, { options: [], onSelect: () => {} }))).toBe("");
  });
});
