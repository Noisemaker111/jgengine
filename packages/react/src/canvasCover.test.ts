import { describe, expect, test } from "bun:test";

import { canvasCover } from "./canvasCover";

function releaseAll(): void {
  while (canvasCover.holders() > 0) canvasCover.hold()();
}

describe("canvas cover", () => {
  test("one hold covers the canvas until its release runs", () => {
    releaseAll();
    expect(canvasCover.covered()).toBe(false);
    const release = canvasCover.hold();
    expect(canvasCover.covered()).toBe(true);
    expect(canvasCover.holders()).toBe(1);
    release();
    expect(canvasCover.covered()).toBe(false);
    expect(canvasCover.holders()).toBe(0);
  });

  test("two surfaces cover together and the last release lifts it", () => {
    releaseAll();
    const first = canvasCover.hold();
    const second = canvasCover.hold();
    expect(canvasCover.holders()).toBe(2);
    first();
    expect(canvasCover.covered(), "a surface left holding must keep the canvas covered").toBe(true);
    second();
    expect(canvasCover.covered()).toBe(false);
  });

  test("releasing twice is one release", () => {
    releaseAll();
    const other = canvasCover.hold();
    const release = canvasCover.hold();
    release();
    release();
    expect(canvasCover.holders()).toBe(1);
    expect(canvasCover.covered()).toBe(true);
    other();
    expect(canvasCover.covered()).toBe(false);
  });

  test("subscribers hear presence changes only, not every hold", () => {
    releaseAll();
    let notified = 0;
    const unsubscribe = canvasCover.subscribe(() => {
      notified += 1;
    });
    const first = canvasCover.hold();
    const second = canvasCover.hold();
    expect(notified, "a second surface on an already covered canvas is not a change").toBe(1);
    first();
    expect(notified, "the cover is still held").toBe(1);
    second();
    expect(notified).toBe(2);
    unsubscribe();
    canvasCover.hold()();
    expect(notified, "an unsubscribed listener is not called").toBe(2);
  });
});
