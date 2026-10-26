import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createAbilityKit } from "@jgengine/core/combat/abilityKit";
import { resolveActionCollection } from "@jgengine/core/ui/actionModel";

import { ActionBar, ActionButton, actionBarKeyAction, actionFromAbilitySlot } from "./actionHud";

describe("actionFromAbilitySlot", () => {
  const kit = createAbilityKit([{ id: "fireball", cooldownMs: 4000, resourceCost: 40 }]);

  test("maps a ready slot to a plain action with a cost line", () => {
    const slot = kit.state("fireball", 100)!;
    const def = actionFromAbilitySlot(slot, { label: "Fireball", resourceId: "mana", hotkey: "Q" });
    expect(def.id).toBe("fireball");
    expect(def.label).toBe("Fireball");
    expect(def.hotkey).toBe("Q");
    expect(def.costs).toEqual([{ resourceId: "mana", amount: 40, available: 40, met: true }]);
    expect(def.cooldown).toBeUndefined();
  });

  test("maps a no-resource slot to an unmet cost", () => {
    const slot = kit.state("fireball", 0)!;
    const def = actionFromAbilitySlot(slot, { resourceId: "mana" });
    expect(def.costs?.[0]?.met).toBe(false);
    expect(resolveActionCollection([def])[0]?.enabled).toBe(false);
  });

  test("maps an on-cooldown slot to a cooldown", () => {
    kit.cast("fireball", 100);
    kit.tick(1); // 1s elapsed of 4s cooldown
    const slot = kit.state("fireball", 100)!;
    const def = actionFromAbilitySlot(slot);
    expect(def.cooldown).toBeDefined();
    expect(def.cooldown!.ready).toBe(false);
  });
});

describe("actionBarKeyAction", () => {
  const actions = resolveActionCollection([
    { id: "a", hotkey: "Q" },
    { id: "b", hotkey: "W" },
    { id: "c", hotkey: "E" },
  ]);

  test("arrow keys move focus", () => {
    expect(actionBarKeyAction(actions, "a", 3, "ArrowRight")).toEqual({ handled: true, focusId: "b" });
    expect(actionBarKeyAction(actions, null, 3, "ArrowRight")).toEqual({ handled: true, focusId: "a" });
  });

  test("Enter and Space activate the focused action", () => {
    expect(actionBarKeyAction(actions, "b", 3, "Enter")).toEqual({ handled: true, activateId: "b" });
    expect(actionBarKeyAction(actions, "b", 3, " ")).toEqual({ handled: true, activateId: "b" });
    expect(actionBarKeyAction(actions, null, 3, "Enter")).toEqual({ handled: false });
  });

  test("a hotkey focuses and activates", () => {
    expect(actionBarKeyAction(actions, "a", 3, "e")).toEqual({ handled: true, focusId: "c", activateId: "c" });
  });

  test("an unbound key is not handled", () => {
    expect(actionBarKeyAction(actions, "a", 3, "z")).toEqual({ handled: false });
  });
});

describe("action renderers (SSR)", () => {
  test("ActionButton renders an accessible button reflecting disabled/active state", () => {
    const [resolved] = resolveActionCollection([
      { id: "hold", label: "Hold", hotkey: "H", active: true, disabled: true },
    ]);
    const html = renderToStaticMarkup(createElement(ActionButton, { action: resolved! }));
    expect(html).toContain('data-action-id="hold"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Hold");
  });

  test("ActionBar renders a labeled toolbar of its actions", () => {
    const html = renderToStaticMarkup(
      createElement(ActionBar, {
        defs: [
          { id: "move", label: "Move", hotkey: "M" },
          { id: "stop", label: "Stop", hotkey: "S" },
        ],
        ariaLabel: "Commands",
      }),
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Commands"');
    expect(html).toContain('data-action-id="move"');
    expect(html).toContain('data-action-id="stop"');
  });
});
