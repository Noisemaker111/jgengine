import { describe, expect, test } from "bun:test";
import { requestRawPointerLock } from "./pointerLock";

function lockable(behavior: (options?: { unadjustedMovement?: boolean }) => Promise<void> | void) {
  const calls: ({ unadjustedMovement?: boolean } | undefined)[] = [];
  return {
    calls,
    element: {
      requestPointerLock(options?: { unadjustedMovement?: boolean }) {
        calls.push(options);
        return behavior(options);
      },
    },
  };
}

describe("requestRawPointerLock", () => {
  test("asks for unadjusted movement first", async () => {
    const { calls, element } = lockable(() => Promise.resolve());
    requestRawPointerLock(element);
    await Promise.resolve();
    expect(calls).toEqual([{ unadjustedMovement: true }]);
  });

  test("falls back to a plain lock when the raw request rejects", async () => {
    const { calls, element } = lockable((options) =>
      options?.unadjustedMovement ? Promise.reject(new Error("NotSupportedError")) : Promise.resolve(),
    );
    requestRawPointerLock(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined]);
  });

  test("falls back when the raw request throws synchronously", () => {
    const { calls, element } = lockable((options) => {
      if (options?.unadjustedMovement) throw new Error("bad options");
    });
    requestRawPointerLock(element);
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined]);
  });

  test("does nothing without pointer lock support", () => {
    expect(() => requestRawPointerLock({})).not.toThrow();
  });
});
