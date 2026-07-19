import { describe, expect, test } from "bun:test";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CharacterSheet,
  Paperdoll,
  StatList,
  defaultEquipLayout,
  type EquipSlot,
  type StatRow,
} from "./characterSheet";
import type { SlotItem } from "./slots";

/** Recursively invoke hook-free function components down to host nodes, collecting every element with an `onClick`. */
function collectClickable(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectClickable(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === "function") {
    collectClickable((el.type as (props: unknown) => unknown)(el.props), out);
    return out;
  }
  if (typeof el.props.onClick === "function") out.push(el);
  collectClickable(el.props.children, out);
  return out;
}

const sword: SlotItem = { icon: "sword", school: "steel", label: "Blade" };

describe("defaultEquipLayout", () => {
  test("produces the flanking convenience arrangement with empty slots by default", () => {
    const layout = defaultEquipLayout();
    expect(layout.map((s) => s.id)).toEqual([
      "head",
      "chest",
      "hands",
      "legs",
      "feet",
      "mainHand",
      "offHand",
      "ring1",
      "ring2",
      "trinket",
    ]);
    expect(layout.every((s) => s.item === null)).toBe(true);
    expect(layout.find((s) => s.id === "head")?.position).toBe("left");
    expect(layout.find((s) => s.id === "mainHand")?.position).toBe("right");
  });

  test("fills only the supplied slots by id", () => {
    const layout = defaultEquipLayout({ mainHand: sword });
    expect(layout.find((s) => s.id === "mainHand")?.item).toBe(sword);
    expect(layout.find((s) => s.id === "head")?.item).toBe(null);
  });
});

describe("Paperdoll", () => {
  const slots: EquipSlot[] = [
    { id: "head", label: "Head", item: null, position: "left" },
    { id: "mainHand", label: "Main Hand", item: sword, position: "right" },
  ];

  test("renders filled slots as treated icons and empty slots as placeholders", () => {
    const html = renderToStaticMarkup(createElement(Paperdoll, { slots }));
    expect(html).toContain('data-icon-treatment="steel"'); // the equipped sword
    expect(html).toContain("data-slot-empty"); // the empty head slot
  });

  test("each slot is an accessible, labelled group", () => {
    const html = renderToStaticMarkup(createElement(Paperdoll, { slots }));
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Main Hand"');
    expect(html).toContain('data-equip-slot="mainHand"');
  });

  test("draws a silhouette placeholder when no portrait is supplied", () => {
    const html = renderToStaticMarkup(createElement(Paperdoll, { slots }));
    expect(html).toContain("data-paperdoll-silhouette");
  });

  test("onSlotActivate is wired per slot and fires with the slot id", () => {
    const fired: string[] = [];
    const tree = Paperdoll({ slots, onSlotActivate: (id) => fired.push(id) });
    const clickable = collectClickable(tree);
    expect(clickable.length).toBe(2);
    for (const el of clickable) (el.props.onClick as () => void)();
    expect(fired.sort()).toEqual(["head", "mainHand"]);
  });

  test("no interactive wiring when onSlotActivate is omitted", () => {
    const tree = Paperdoll({ slots });
    expect(collectClickable(tree).length).toBe(0);
  });
});

describe("StatList", () => {
  const stats: StatRow[] = [
    { id: "armor", label: "Armor", value: 128, group: "Defense" },
    { id: "dodge", label: "Dodge", value: "12%", hint: "+2%", group: "Defense" },
    { id: "crit", label: "Crit", value: "8%", group: "Offense" },
  ];

  test("renders every supplied row with its label and value", () => {
    const html = renderToStaticMarkup(createElement(StatList, { stats }));
    expect(html).toContain("Armor");
    expect(html).toContain("128");
    expect(html).toContain("12%");
    expect(html).toContain('data-stat-row="crit"');
  });

  test("buckets rows under group headers and shows hints", () => {
    const html = renderToStaticMarkup(createElement(StatList, { stats }));
    expect(html).toContain('data-stat-group="Defense"');
    expect(html).toContain('data-stat-group="Offense"');
    expect(html).toContain("+2%"); // dodge hint
  });
});

describe("CharacterSheet", () => {
  test("composes header, paperdoll, and stat list inside a hud frame", () => {
    const html = renderToStaticMarkup(
      createElement(CharacterSheet, {
        slots: defaultEquipLayout({ mainHand: sword }),
        stats: [{ id: "armor", label: "Armor", value: 128 }],
        name: "Thrall",
        subtitle: "Level 60 Shaman",
      }),
    );
    expect(html).toContain("data-hud-frame");
    expect(html).toContain("data-character-sheet");
    expect(html).toContain("data-paperdoll");
    expect(html).toContain("data-stat-list");
    expect(html).toContain("Thrall");
    expect(html).toContain("Level 60 Shaman");
  });
});
