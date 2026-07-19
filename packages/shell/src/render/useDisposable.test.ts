import { describe, expect, test } from "bun:test";

import { disposeAll, type Disposable } from "./useDisposable";

function tracked(): Disposable & { disposed: number } {
  const item = {
    disposed: 0,
    dispose() {
      item.disposed += 1;
    },
  };
  return item;
}

describe("disposeAll", () => {
  test("disposes a single resource", () => {
    const item = tracked();
    disposeAll(item);
    expect(item.disposed).toBe(1);
  });

  test("disposes every resource in a tuple", () => {
    const a = tracked();
    const b = tracked();
    const c = tracked();
    disposeAll([a, b, c]);
    expect(a.disposed).toBe(1);
    expect(b.disposed).toBe(1);
    expect(c.disposed).toBe(1);
  });
});
