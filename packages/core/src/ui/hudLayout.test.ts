import { describe, expect, test } from "bun:test";

import {
  HUD_ANCHOR_FRACTIONS,
  anchoredPlacement,
  clampRect,
  createHudLayout,
  isHudAnchor,
  isPanelDraggable,
  nearestAnchor,
  placementFromRect,
  rectFromPlacement,
  type HudRect,
  type HudSize,
} from "./hudLayout";

const VP: HudSize = { width: 1000, height: 600 };

describe("nearestAnchor", () => {
  test("picks top-left for a rect near the top-left corner", () => {
    expect(nearestAnchor({ x: 0, y: 0, width: 80, height: 40 }, VP)).toBe("top-left");
  });

  test("picks top-right for a rect near the top-right corner", () => {
    expect(nearestAnchor({ x: 900, y: 0, width: 100, height: 40 }, VP)).toBe("top-right");
  });

  test("picks bottom-right for a rect near the bottom-right corner", () => {
    expect(nearestAnchor({ x: 900, y: 550, width: 100, height: 50 }, VP)).toBe("bottom-right");
  });

  test("picks center for a rect centered in the viewport", () => {
    expect(nearestAnchor({ x: 460, y: 280, width: 80, height: 40 }, VP)).toBe("center");
  });

  test("picks top for a rect centered on the top edge", () => {
    expect(nearestAnchor({ x: 460, y: 0, width: 80, height: 40 }, VP)).toBe("top");
  });

  test("picks left for a rect centered on the left edge", () => {
    expect(nearestAnchor({ x: 0, y: 280, width: 80, height: 40 }, VP)).toBe("left");
  });

  test("falls back to center for a zero-size viewport", () => {
    expect(nearestAnchor({ x: 900, y: 550, width: 100, height: 50 }, { width: 0, height: 0 })).toBe("center");
  });
});

describe("clampRect", () => {
  test("clamps a rect pushed past the left edge", () => {
    expect(clampRect({ x: -50, y: 50, width: 100, height: 50 }, VP)).toEqual({ x: 0, y: 50, width: 100, height: 50 });
  });

  test("clamps a rect pushed past the top edge", () => {
    expect(clampRect({ x: 50, y: -50, width: 100, height: 50 }, VP)).toEqual({ x: 50, y: 0, width: 100, height: 50 });
  });

  test("clamps a rect pushed past the right edge", () => {
    expect(clampRect({ x: 950, y: 50, width: 100, height: 50 }, VP)).toEqual({ x: 900, y: 50, width: 100, height: 50 });
  });

  test("clamps a rect pushed past the bottom edge", () => {
    expect(clampRect({ x: 50, y: 580, width: 100, height: 50 }, VP)).toEqual({ x: 50, y: 550, width: 100, height: 50 });
  });

  test("pins to x=0 when the rect is wider than the viewport", () => {
    expect(clampRect({ x: 100, y: 50, width: 1200, height: 50 }, VP).x).toBe(0);
  });
});

describe("placementFromRect / rectFromPlacement round trip", () => {
  const rects: HudRect[] = [
    { x: 0, y: 0, width: 80, height: 40 },
    { x: 900, y: 0, width: 100, height: 40 },
    { x: 900, y: 550, width: 100, height: 50 },
    { x: 460, y: 280, width: 80, height: 40 },
    { x: 460, y: 0, width: 80, height: 40 },
    { x: 0, y: 280, width: 80, height: 40 },
    { x: -50, y: 700, width: 120, height: 60 },
  ];

  for (const rect of rects) {
    test(`round-trips ${JSON.stringify(rect)}`, () => {
      const placement = placementFromRect(rect, VP, 1);
      const size: HudSize = { width: rect.width, height: rect.height };
      expect(rectFromPlacement(placement, size, VP)).toEqual(clampRect(rect, VP));
    });
  }

  test("keeps a fixed inset from the bottom-right corner when the viewport grows", () => {
    const rect: HudRect = { x: 880, y: 530, width: 100, height: 50 };
    const placement = placementFromRect(rect, VP, 1);
    expect(placement.anchor).toBe("bottom-right");

    const size: HudSize = { width: rect.width, height: rect.height };
    const biggerVp: HudSize = { width: 2000, height: 1200 };
    const grown = rectFromPlacement(placement, size, biggerVp);

    const originalInsetX = VP.width - (rect.x + rect.width);
    const originalInsetY = VP.height - (rect.y + rect.height);
    const grownInsetX = biggerVp.width - (grown.x + grown.width);
    const grownInsetY = biggerVp.height - (grown.y + grown.height);
    expect(grownInsetX).toBe(originalInsetX);
    expect(grownInsetY).toBe(originalInsetY);
  });
});

describe("placementFromRect snap", () => {
  test("snaps dx/dy to multiples of the snap step", () => {
    const rect: HudRect = { x: 883, y: 531, width: 100, height: 50 };
    const placement = placementFromRect(rect, VP, 8);
    expect(Number.isInteger(placement.dx / 8)).toBe(true);
    expect(Number.isInteger(placement.dy / 8)).toBe(true);
  });
});

describe("anchoredPlacement", () => {
  test("keeps positive insets at the top-left", () => {
    expect(anchoredPlacement("top-left", { x: 16, y: 16 })).toEqual({ anchor: "top-left", dx: 16, dy: 16 });
  });

  test("negates insets at the bottom-right", () => {
    expect(anchoredPlacement("bottom-right", { x: 16, y: 16 })).toEqual({ anchor: "bottom-right", dx: -16, dy: -16 });
  });

  test("negates only the x inset at the top-right", () => {
    expect(anchoredPlacement("top-right", { x: 16, y: 16 })).toEqual({ anchor: "top-right", dx: -16, dy: 16 });
  });
});

describe("isHudAnchor", () => {
  test("accepts every declared anchor", () => {
    for (const anchor of Object.keys(HUD_ANCHOR_FRACTIONS)) {
      expect(isHudAnchor(anchor)).toBe(true);
    }
  });

  test("rejects junk values", () => {
    expect(isHudAnchor("TOP-LEFT")).toBe(false);
    expect(isHudAnchor("topleft")).toBe(false);
    expect(isHudAnchor("")).toBe(false);
    expect(isHudAnchor(123)).toBe(false);
    expect(isHudAnchor(null)).toBe(false);
    expect(isHudAnchor(undefined)).toBe(false);
    expect(isHudAnchor({})).toBe(false);
    expect(isHudAnchor([])).toBe(false);
  });
});

describe("createHudLayout store", () => {
  test("register assigns increasing z in registration order", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    layout.register("b", anchoredPlacement("top-right", { x: 8, y: 8 }));
    layout.register("c", anchoredPlacement("bottom-left", { x: 8, y: 8 }));
    const { panels } = layout.getState();
    expect(panels["a"]!.z).toBe(1);
    expect(panels["b"]!.z).toBe(2);
    expect(panels["c"]!.z).toBe(3);
  });

  test("re-register is a no-op for placement but updates the reset default", () => {
    const layout = createHudLayout();
    const initial = anchoredPlacement("top-left", { x: 8, y: 8 });
    layout.register("a", initial);
    layout.move("a", { x: 900, y: 550, width: 100, height: 50 }, VP);
    const movedPlacement = layout.getState().panels["a"]!.placement;

    const updatedDefault = anchoredPlacement("bottom-left", { x: 4, y: 4 });
    layout.register("a", updatedDefault);
    expect(layout.getState().panels["a"]!.placement).toEqual(movedPlacement);

    layout.reset("a");
    expect(layout.getState().panels["a"]!.placement).toEqual(updatedDefault);
    expect(layout.getState().panels["a"]!.moved).toBe(false);
  });

  test("move updates placement, sets moved, clamps and re-anchors", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    layout.move("a", { x: 900, y: 550, width: 100, height: 50 }, VP);
    const panel = layout.getState().panels["a"]!;
    expect(panel.moved).toBe(true);
    expect(panel.placement.anchor).toBe("bottom-right");
  });

  test("move on an unregistered id is a no-op", () => {
    const layout = createHudLayout();
    layout.move("ghost", { x: 0, y: 0, width: 10, height: 10 }, VP);
    expect(layout.getState().panels["ghost"]).toBeUndefined();
  });

  test("bringToFront gives the panel the highest z and is a no-op when already on top", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    layout.register("b", anchoredPlacement("top-right", { x: 8, y: 8 }));
    layout.register("c", anchoredPlacement("bottom-left", { x: 8, y: 8 }));

    let calls = 0;
    layout.subscribe(() => {
      calls += 1;
    });

    layout.bringToFront("c");
    expect(calls).toBe(0);

    layout.bringToFront("a");
    expect(calls).toBe(1);
    const { panels } = layout.getState();
    expect(panels["a"]!.z).toBe(4);
    expect(panels["a"]!.z).toBeGreaterThan(panels["b"]!.z);
    expect(panels["a"]!.z).toBeGreaterThan(panels["c"]!.z);
  });

  test("setLocked toggles state.locked and is a no-op emit when unchanged", () => {
    const layout = createHudLayout({ locked: false });
    let calls = 0;
    layout.subscribe(() => {
      calls += 1;
    });

    layout.setLocked(true);
    expect(layout.getState().locked).toBe(true);
    expect(calls).toBe(1);

    layout.setLocked(true);
    expect(calls).toBe(1);

    layout.setLocked(false);
    expect(layout.getState().locked).toBe(false);
    expect(calls).toBe(2);
  });

  test("reset(id) restores the registered default and clears moved", () => {
    const layout = createHudLayout();
    const initial = anchoredPlacement("top-left", { x: 8, y: 8 });
    layout.register("a", initial);
    layout.move("a", { x: 900, y: 550, width: 100, height: 50 }, VP);
    layout.reset("a");
    const panel = layout.getState().panels["a"]!;
    expect(panel.placement).toEqual(initial);
    expect(panel.moved).toBe(false);
  });

  test("reset() with no id restores every moved panel", () => {
    const layout = createHudLayout();
    const initialA = anchoredPlacement("top-left", { x: 8, y: 8 });
    const initialB = anchoredPlacement("top-right", { x: 8, y: 8 });
    layout.register("a", initialA);
    layout.register("b", initialB);
    layout.move("a", { x: 900, y: 550, width: 100, height: 50 }, VP);
    layout.move("b", { x: 0, y: 550, width: 100, height: 50 }, VP);

    layout.reset();
    const { panels } = layout.getState();
    expect(panels["a"]!.placement).toEqual(initialA);
    expect(panels["a"]!.moved).toBe(false);
    expect(panels["b"]!.placement).toEqual(initialB);
    expect(panels["b"]!.moved).toBe(false);
  });

  test("reset on an unmoved panel does not emit", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    let calls = 0;
    layout.subscribe(() => {
      calls += 1;
    });
    layout.reset("a");
    expect(calls).toBe(0);
    expect(layout.getState().panels["a"]!.moved).toBe(false);
  });

  test("serialize only includes moved panels", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    layout.register("b", anchoredPlacement("top-right", { x: 8, y: 8 }));
    layout.move("b", { x: 900, y: 550, width: 100, height: 50 }, VP);

    const parsed = JSON.parse(layout.serialize());
    expect(Object.keys(parsed.panels)).toEqual(["b"]);
  });

  test("hydrate before register stashes the placement as pending, applied moved on register", () => {
    const layout = createHudLayout();
    const source = createHudLayout();
    source.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    source.move("a", { x: 900, y: 550, width: 100, height: 50 }, VP);
    const raw = source.serialize();
    const hydratedPlacement = JSON.parse(raw).panels["a"];

    layout.hydrate(raw);
    expect(layout.getState().panels["a"]).toBeUndefined();

    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    const panel = layout.getState().panels["a"]!;
    expect(panel.placement).toEqual(hydratedPlacement);
    expect(panel.moved).toBe(true);
  });

  test("hydrate after register overrides the placement immediately", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    const source = createHudLayout();
    source.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    source.move("a", { x: 900, y: 550, width: 100, height: 50 }, VP);
    const raw = source.serialize();
    const hydratedPlacement = JSON.parse(raw).panels["a"];

    layout.hydrate(raw);
    const panel = layout.getState().panels["a"]!;
    expect(panel.placement).toEqual(hydratedPlacement);
    expect(panel.moved).toBe(true);
  });

  test("hydrate tolerates garbage input without throwing", () => {
    const layout = createHudLayout();
    expect(() => layout.hydrate("not json")).not.toThrow();
    expect(() => layout.hydrate("{}")).not.toThrow();
    expect(() => layout.hydrate(null)).not.toThrow();
    expect(() => layout.hydrate(undefined)).not.toThrow();
    expect(() => layout.hydrate("")).not.toThrow();
    expect(layout.getState().panels).toEqual({});
  });

  test("hydrate ignores malformed panel entries", () => {
    const layout = createHudLayout();
    const raw = JSON.stringify({
      v: 1,
      panels: {
        a: { anchor: "bogus", dx: 1, dy: 1 },
        b: { anchor: "center", dx: "5", dy: 1 },
      },
    });
    expect(() => layout.hydrate(raw)).not.toThrow();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    layout.register("b", anchoredPlacement("top-left", { x: 8, y: 8 }));
    expect(layout.getState().panels["a"]!.moved).toBe(false);
    expect(layout.getState().panels["b"]!.moved).toBe(false);
  });

  test("subscribe returns an unsubscribe that stops notifications", () => {
    const layout = createHudLayout({ locked: false });
    let calls = 0;
    const unsubscribe = layout.subscribe(() => {
      calls += 1;
    });
    layout.setLocked(true);
    expect(calls).toBe(1);
    unsubscribe();
    layout.setLocked(false);
    expect(calls).toBe(1);
  });

  test("default state is locked=true and editing=false", () => {
    const layout = createHudLayout();
    const state = layout.getState();
    expect(state.locked).toBe(true);
    expect(state.editing).toBe(false);
  });

  test("setEditing toggles state.editing and is a no-op emit when unchanged", () => {
    const layout = createHudLayout();
    let calls = 0;
    layout.subscribe(() => {
      calls += 1;
    });

    layout.setEditing(false);
    expect(calls).toBe(0);

    layout.setEditing(true);
    expect(layout.getState().editing).toBe(true);
    expect(calls).toBe(1);

    layout.setEditing(true);
    expect(calls).toBe(1);

    layout.setEditing(false);
    expect(layout.getState().editing).toBe(false);
    expect(calls).toBe(2);
  });
});

describe("isPanelDraggable", () => {
  test("false for an unknown panel id", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    expect(isPanelDraggable(layout.getState(), "ghost")).toBe(false);
  });

  test("false when locked and not editing", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    expect(isPanelDraggable(layout.getState(), "a")).toBe(false);
  });

  test("true when editing, even if locked", () => {
    const layout = createHudLayout();
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    layout.setEditing(true);
    expect(isPanelDraggable(layout.getState(), "a")).toBe(true);
  });

  test("true when not locked", () => {
    const layout = createHudLayout({ locked: false });
    layout.register("a", anchoredPlacement("top-left", { x: 8, y: 8 }));
    expect(isPanelDraggable(layout.getState(), "a")).toBe(true);
  });
});
