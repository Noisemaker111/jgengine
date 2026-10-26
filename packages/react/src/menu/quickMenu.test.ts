import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { QuickMenu, type QuickMenuItem } from "./quickMenu";

const ITEMS: readonly QuickMenuItem[] = [
  { id: "attack", label: "Attack", icon: "⚔️", hotkey: "1", section: "Combat" },
  { id: "spells", label: "Spells", icon: "🔮", section: "Combat", children: [
    { id: "fire", label: "Fireball", badge: 3 },
    { id: "heal", label: "Heal", cooldown: 0.5 },
  ] },
  { id: "rest", label: "Rest", icon: "🔥", section: "Camp", disabled: true },
];

describe("QuickMenu layouts", () => {
  test("list renders sectioned rows with hotkeys, badges disabled state, and submenu markers", () => {
    const html = renderToStaticMarkup(createElement(QuickMenu, { items: ITEMS, layout: "list", onSelect: () => {}, title: "Actions" }));
    expect(html).toContain('data-layout="list"');
    expect(html).toContain('data-section="Combat"');
    expect(html).toContain('data-quick-item="attack"');
    expect(html).toContain("Attack");
    expect(html).toContain("▸"); // spells has children
    expect(html).toContain('data-disabled="true"'); // rest
  });

  test("grid layout renders tiles", () => {
    const html = renderToStaticMarkup(createElement(QuickMenu, { items: ITEMS, layout: "grid", onSelect: () => {}, columns: 4 }));
    expect(html).toContain('data-layout="grid"');
    expect(html).toContain('data-quick-item="spells"');
  });

  test("radial layout delegates to the wheel and marks submenu slices", () => {
    const html = renderToStaticMarkup(createElement(QuickMenu, { items: ITEMS, layout: "radial", onSelect: () => {} }));
    expect(html).toContain('data-layout="radial"');
    expect(html).toContain("data-radial-menu");
    expect(html).toContain('data-radial-option="spells"');
  });

  test("arc layout renders the wheel form", () => {
    const html = renderToStaticMarkup(createElement(QuickMenu, { items: ITEMS, layout: "arc", onSelect: () => {} }));
    expect(html).toContain('data-layout="arc"');
    expect(html).toContain("data-radial-menu");
  });
});
