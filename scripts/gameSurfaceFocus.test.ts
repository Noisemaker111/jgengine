import { describe, expect, test } from "bun:test";
import { focusGameSurface, holdComplete, type FocusableDocument, type FocusableElement } from "./gameSurfaceFocus";

function el(overrides: Partial<FocusableElement> & { ancestor?: FocusableElement | null } = {}): FocusableElement {
  const self: FocusableElement & { focused: boolean } = {
    focused: false,
    focus() {
      self.focused = true;
    },
    closest: overrides.ancestor === undefined ? undefined : () => overrides.ancestor ?? null,
    ...overrides,
  };
  return self;
}

function doc(map: Record<string, FocusableElement | null>): FocusableDocument & { active: FocusableElement | null } {
  const d = {
    active: null as FocusableElement | null,
    querySelector: (sel: string) => map[sel] ?? null,
    get activeElement() {
      return d.active;
    },
  };
  return d;
}

describe("focusGameSurface", () => {
  test("focuses the canvas's focusable ancestor (3D game)", () => {
    const wrapper = el();
    const canvas = el({ ancestor: wrapper });
    const d = doc({ canvas, "[tabindex]": el() });
    // focus() should mark the wrapper active
    (wrapper as { focus: () => void }).focus = () => {
      d.active = wrapper;
    };
    expect(focusGameSurface(d)).toBe(true);
    expect(d.active).toBe(wrapper);
  });

  test("falls back to the first [tabindex] when there is no canvas (HUD game)", () => {
    const wrapper = el();
    const d = doc({ canvas: null, "[tabindex]": wrapper });
    (wrapper as { focus: () => void }).focus = () => {
      d.active = wrapper;
    };
    expect(focusGameSurface(d)).toBe(true);
    expect(d.active).toBe(wrapper);
  });

  test("uses the [tabindex] fallback when the canvas has no focusable ancestor", () => {
    const canvas = el({ ancestor: null });
    const wrapper = el();
    const d = doc({ canvas, "[tabindex]": wrapper });
    (wrapper as { focus: () => void }).focus = () => {
      d.active = wrapper;
    };
    expect(focusGameSurface(d)).toBe(true);
    expect(d.active).toBe(wrapper);
  });

  test("returns false when there is no focusable surface", () => {
    const d = doc({ canvas: null, "[tabindex]": null });
    expect(focusGameSurface(d)).toBe(false);
  });

  test("is self-contained so it survives .toString() serialization into the page", () => {
    const src = focusGameSurface.toString();
    // no module-scope identifiers the page would not have
    expect(src).not.toContain("pickGameSurface");
    expect(src).toContain("querySelector");
    expect(src).toContain("[tabindex]");
  });
});

describe("holdComplete", () => {
  const base = { deadlineMs: 1000, hardCapMs: 21_000 };

  test("stays held before the wall-clock budget elapses", () => {
    expect(holdComplete({ ...base, nowMs: 500, framesElapsed: 5 })).toBe(false);
  });

  test("stays held after the budget until a frame renders (frame-starved page)", () => {
    expect(holdComplete({ ...base, nowMs: 1500, framesElapsed: 0 })).toBe(false);
  });

  test("releases once the budget elapsed and at least one frame rendered", () => {
    expect(holdComplete({ ...base, nowMs: 1500, framesElapsed: 1 })).toBe(true);
  });

  test("releases at the hard cap even if no frame ever rendered (never hangs)", () => {
    expect(holdComplete({ ...base, nowMs: 21_000, framesElapsed: 0 })).toBe(true);
  });
});
