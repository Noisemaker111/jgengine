import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EntitySummaryDef } from "@jgengine/core/ui/selectionModel";

import { EntityPortrait, EntitySummary, SelectionPanel } from "./selectionHud";

const marine: EntitySummaryDef = {
  id: "m1",
  name: "Marine",
  kind: "marine",
  icon: "M",
  tags: ["ranged"],
  vitals: [{ id: "health", label: "HP", current: 30, max: 45, tone: "health" }],
};

const squad: EntitySummaryDef[] = [
  marine,
  { id: "m2", name: "Marine", kind: "marine", icon: "M" },
  { id: "t1", name: "Tank", kind: "tank", icon: "T" },
];

describe("selection renderers (SSR)", () => {
  test("EntityPortrait renders a selectable, pressed button with health", () => {
    const html = renderToStaticMarkup(createElement(EntityPortrait, { entity: marine, selected: true }));
    expect(html).toContain('data-entity-id="m1"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Marine"');
  });

  test("EntitySummary shows name, kind, tags, and vitals", () => {
    const html = renderToStaticMarkup(createElement(EntitySummary, { entity: marine }));
    expect(html).toContain("Marine");
    expect(html).toContain("marine");
    expect(html).toContain("ranged");
    expect(html).toContain('data-vital="health"');
  });

  test("SelectionPanel renders a primary summary plus a member strip", () => {
    const html = renderToStaticMarkup(createElement(SelectionPanel, { members: squad }));
    expect(html).toContain('data-selection-panel=""');
    expect(html).toContain('data-selection-strip=""');
    expect(html).toContain('data-entity-summary="m1"');
  });

  test("SelectionPanel groups a large selection into chips", () => {
    const many: EntitySummaryDef[] = Array.from({ length: 20 }, (_, i) => ({
      id: `u${i}`,
      kind: i % 2 === 0 ? "marine" : "tank",
      icon: i % 2 === 0 ? "M" : "T",
    }));
    const html = renderToStaticMarkup(createElement(SelectionPanel, { members: many }));
    expect(html).toContain('data-selection-groups=""');
    expect(html).toContain("data-selection-group=");
  });

  test("SelectionPanel renders nothing for an empty selection", () => {
    const html = renderToStaticMarkup(createElement(SelectionPanel, { members: [] }));
    expect(html).toBe("");
  });
});
