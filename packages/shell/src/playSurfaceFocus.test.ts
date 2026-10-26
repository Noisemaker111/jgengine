import { describe, expect, test } from "bun:test";
import { installPlayFocusReclaim, shouldReclaimPlayFocus, shouldReturnPlayFocus } from "./playSurfaceFocus";

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
describe("installPlayFocusReclaim", () => {
  test("a key that unmounts the focused menu (Escape closing pause) returns focus to the play surface", async () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const body = { isConnected: true } as Element;
    const button = { isConnected: true } as { isConnected: boolean } & Element;
    let focused = 0;
    const surface = { isConnected: true, focus: () => (focused += 1) } as unknown as HTMLElement;
    const doc = {
      body,
      activeElement: button as Element | null,
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const dispose = installPlayFocusReclaim(doc as unknown as Document, () => surface);
    listeners.get("keydown")!({ code: "Escape" });
    button.isConnected = false;
    doc.activeElement = body;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(focused).toBe(1);
    dispose();
    expect(listeners.size).toBe(0);
  });
});
