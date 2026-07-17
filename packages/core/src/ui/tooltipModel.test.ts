import { describe, expect, test } from "bun:test";

import { actionCooldown, actionCost, resolveAction } from "@jgengine/core/ui/actionModel";
import { actionTooltip, placePopover, type UiRect } from "@jgengine/core/ui/tooltipModel";

describe("actionTooltip", () => {
  test("assembles title/body/hotkey/costs from a resolved action", () => {
    const resolved = resolveAction({
      id: "fireball",
      label: "Fireball",
      description: "Hurls a fiery bolt.",
      group: "Offense",
      hotkey: "Q",
      costs: [actionCost("mana", 40, 100)],
    });
    const tip = actionTooltip(resolved);
    expect(tip.title).toBe("Fireball");
    expect(tip.subtitle).toBe("Offense");
    expect(tip.body).toBe("Hurls a fiery bolt.");
    expect(tip.hotkey).toBe("Q");
    expect(tip.costs).toHaveLength(1);
    expect(tip.cooldown).toBeUndefined();
    expect(tip.notes).toBeUndefined();
  });

  test("surfaces an active cooldown and blocking notes", () => {
    const resolved = resolveAction({
      id: "fireball",
      label: "Fireball",
      cooldown: actionCooldown(2000, 4000),
      costs: [actionCost("mana", 40, 10)],
    });
    const tip = actionTooltip(resolved);
    expect(tip.cooldown?.remainingMs).toBe(2000);
    expect(tip.notes).toEqual(["Ready in 2.0s", "Needs 40 mana"]);
  });

  test("a ready cooldown is not shown", () => {
    const resolved = resolveAction({ id: "x", cooldown: actionCooldown(0, 4000) });
    expect(actionTooltip(resolved).cooldown).toBeUndefined();
  });
});

describe("placePopover", () => {
  const anchor: UiRect = { x: 500, y: 400, width: 40, height: 40 };
  const content = { width: 200, height: 100 };
  const viewport = { width: 1024, height: 768 };

  test("opens on the preferred side, centered, when there is room", () => {
    const placement = placePopover(anchor, content, viewport, { preferred: "top" });
    expect(placement.side).toBe("top");
    expect(placement.top).toBe(400 - 8 - 100);
    expect(placement.left).toBe(500 + 20 - 100);
  });

  test("flips to the opposite side when the preferred side overflows", () => {
    const topAnchor: UiRect = { x: 500, y: 10, width: 40, height: 40 };
    const placement = placePopover(topAnchor, content, viewport, { preferred: "top" });
    expect(placement.side).toBe("bottom");
    expect(placement.top).toBe(10 + 40 + 8);
  });

  test("clamps the box within the viewport margins", () => {
    const edgeAnchor: UiRect = { x: 1000, y: 400, width: 40, height: 40 };
    const placement = placePopover(edgeAnchor, content, viewport, { preferred: "top", margin: 8 });
    expect(placement.left).toBe(viewport.width - content.width - 8);
    expect(placement.left).toBeGreaterThanOrEqual(8);
  });

  test("keeps the preferred side when the opposite is no roomier", () => {
    const tightViewport = { width: 1024, height: 130 };
    const placement = placePopover(anchor, content, tightViewport, { preferred: "top" });
    expect(placement.side).toBe("top");
  });
});
