import { describe, expect, test } from "bun:test";

import { isSecondaryDrag, suppressBrowserContextMenu } from "./contextMenu";

function event(closestHit: boolean) {
  let prevented = false;
  return {
    target: { closest: () => (closestHit ? {} : null) },
    preventDefault: () => {
      prevented = true;
    },
    prevented: () => prevented,
  };
}

describe("right-click over a game", () => {
  test("suppresses the browser menu on the game view", () => {
    const e = event(false);
    expect(suppressBrowserContextMenu(e)).toBe(true);
    expect(e.prevented()).toBe(true);
  });

  test("keeps the native menu inside a text field", () => {
    const e = event(true);
    expect(suppressBrowserContextMenu(e)).toBe(false);
    expect(e.prevented()).toBe(false);
  });

  test("suppresses when the target is not an element", () => {
    let prevented = false;
    expect(suppressBrowserContextMenu({ target: null, preventDefault: () => (prevented = true) })).toBe(true);
    expect(prevented).toBe(true);
  });

  test("a right-drag past the threshold is a camera drag, a still click is not", () => {
    expect(isSecondaryDrag({ x: 10, y: 10 }, { x: 40, y: 10 }, 6)).toBe(true);
    expect(isSecondaryDrag({ x: 10, y: 10 }, { x: 12, y: 11 }, 6)).toBe(false);
    expect(isSecondaryDrag(null, { x: 40, y: 10 }, 6)).toBe(false);
  });
});
