import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createFloatingTextField, type FloatingTextView } from "@jgengine/core/ui/floatingText";

import { FloatingText, layoutFloatingText } from "./floatingText";
import type { EntityScreenProjection } from "./entityFrames";

// A projector: pass world position straight through as screen px; z<0 → behind.
function project(pos: readonly [number, number, number]): EntityScreenProjection {
  return { x: pos[0], y: pos[1], depth: pos[2], behind: pos[2] < 0 };
}

function views(): FloatingTextView[] {
  const field = createFloatingTextField({ now: () => 0 });
  field.emit({ position: [10, 20, 5], text: "24", kind: "damage" });
  field.emit({ position: [30, 40, 1], text: "88!", kind: "crit" });
  return field.active();
}

describe("layoutFloatingText", () => {
  test("projects, applies offsets, and depth-sorts farthest-first", () => {
    const placed = layoutFloatingText(views(), project, { offsetX: 100, offsetY: -5 });
    expect(placed).toHaveLength(2);
    // crit (depth 5) is farther than damage (depth 1) → paints first.
    expect(placed[0]!.view.kind).toBe("damage");
    expect(placed[1]!.view.kind).toBe("crit");
    expect(placed[0]!.x).toBe(10 + 100); // offsetX applied
    expect(placed[0]!.y).toBe(20 - 5); // offsetY applied
  });

  test("culls entries behind the camera and off-screen", () => {
    const field = createFloatingTextField({ now: () => 0 });
    field.emit({ position: [10, 10, -1], text: "behind", kind: "x" }); // behind camera
    field.emit({ position: [5000, 10, 1], text: "far", kind: "x" }); // off the right edge
    field.emit({ position: [10, 10, 1], text: "keep", kind: "x" });
    const placed = layoutFloatingText(field.active(), project, { viewport: { width: 400, height: 300 }, margin: 50 });
    expect(placed.map((p) => p.view.text)).toEqual(["keep"]);
  });
});

describe("FloatingText", () => {
  test("renders each on-screen entry with kind and text and skinnable color", () => {
    const html = renderToStaticMarkup(
      createElement(FloatingText, {
        entries: views(),
        project,
        styleFor: (v) => ({ color: v.kind === "crit" ? "#ff0000" : "#ffffff" }),
      }),
    );
    expect(html).toContain('data-floating-text=""');
    expect(html).toContain('data-kind="damage"');
    expect(html).toContain('data-kind="crit"');
    expect(html).toContain("24");
    expect(html).toContain("88!");
    expect(html).toContain("#ff0000"); // crit skin applied
  });
});
