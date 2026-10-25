import { describe, expect, test } from "bun:test";
import { shouldReclaimPlayFocus, shouldReturnPlayFocus } from "./playSurfaceFocus";

const el = (isConnected: boolean) => ({ isConnected }) as Element;
const body = el(true);

describe("shouldReclaimPlayFocus", () => {
  test("reclaims when the focused button unmounted and focus fell to the body", () => {
    expect(shouldReclaimPlayFocus(el(false), body, body)).toBe(true);
    expect(shouldReclaimPlayFocus(el(false), null, body)).toBe(true);
  });

  test("leaves focus alone when the old element still exists (a deliberate blur)", () => {
    expect(shouldReclaimPlayFocus(el(true), body, body)).toBe(false);
  });

  test("leaves focus alone when something else already took it", () => {
    expect(shouldReclaimPlayFocus(el(false), el(true), body)).toBe(false);
  });

  test("ignores focusout events without an element target", () => {
    expect(shouldReclaimPlayFocus(null, body, body)).toBe(false);
  });
});

/** A fake element: `inside` lists the selectors its ancestors (or itself) match. */
function node(inside: string[], connected = true) {
  const self = {
    isConnected: connected,
    closest: (selector: string) => (selector.startsWith("button") ? self : inside.some((entry) => selector.includes(entry)) ? self : null),
  };
  return self as unknown as Element;
}
const surface = { contains: () => true } as unknown as Element;

describe("shouldReturnPlayFocus", () => {
  test("a mouse click on a HUD button hands focus back to the play surface", () => {
    const button = node([]);
    expect(shouldReturnPlayFocus(button, button, surface, true)).toBe(true);
  });

  test("keyboard activation, dialogs, menus and forms keep their focus", () => {
    const button = node([]);
    expect(shouldReturnPlayFocus(button, button, surface, false)).toBe(false);
    for (const inside of ['[role="dialog"]', '[role="menu"]', "form", "[data-jg-keep-focus]"]) {
      const held = node([inside]);
      expect({ inside, back: shouldReturnPlayFocus(held, held, surface, true) }).toEqual({ inside, back: false });
    }
  });

  test("leaves focus alone when the click moved it somewhere else or the control is outside the surface", () => {
    const button = node([]);
    expect(shouldReturnPlayFocus(button, node([]), surface, true)).toBe(false);
    expect(shouldReturnPlayFocus(button, button, { contains: () => false } as unknown as Element, true)).toBe(false);
    expect(shouldReturnPlayFocus(null, button, surface, true)).toBe(false);
  });
});