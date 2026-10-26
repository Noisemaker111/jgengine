import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ArmorSlots, EquipmentSlots, PotionSlots, WeaponSlots, type SlotItem } from "./slots";

const items: (SlotItem | null)[] = [
  { icon: "sword", school: "steel", keycap: "1", active: true },
  { icon: "shield", school: "holy" },
  { icon: "bomb", school: "fire", count: 5 },
  null,
];

describe("atomic slot grids", () => {
  test("each purpose-named grid marks its own category", () => {
    expect(renderToStaticMarkup(createElement(WeaponSlots, { items }))).toContain('data-slots="weapon"');
    expect(renderToStaticMarkup(createElement(ArmorSlots, { items }))).toContain('data-slots="armor"');
    expect(renderToStaticMarkup(createElement(EquipmentSlots, { items }))).toContain('data-slots="equipment"');
    expect(renderToStaticMarkup(createElement(PotionSlots, { items }))).toContain('data-slots="potion"');
  });

  test("filled slots render treated icons; null renders an empty placeholder", () => {
    const html = renderToStaticMarkup(createElement(EquipmentSlots, { items }));
    expect(html).toContain('data-icon-treatment="steel"');
    expect(html).toContain('data-icon-treatment="fire"');
    expect(html).toContain("data-slot-empty");
    expect(html).toContain("data-count"); // the bomb stack of 5
  });

  test("slots read the shared HudTheme tokens", () => {
    const html = renderToStaticMarkup(createElement(EquipmentSlots, { items: [null] }));
    expect(html).toContain("var(--jg-slot-bg");
    expect(html).toContain("var(--jg-slot-border");
  });

  test("columns lays the grid out as a matrix", () => {
    const html = renderToStaticMarkup(createElement(EquipmentSlots, { items, columns: 2 }));
    expect(html).toContain("repeat(2,");
  });
});
