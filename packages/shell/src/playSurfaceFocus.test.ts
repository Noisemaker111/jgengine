import { describe, expect, test } from "bun:test";
import { shouldReclaimPlayFocus } from "./playSurfaceFocus";

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
