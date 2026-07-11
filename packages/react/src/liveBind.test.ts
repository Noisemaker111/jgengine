import { describe, expect, test } from "bun:test";

import { frameBindSubscriberCount, subscribeFrameBind } from "./liveBind";

describe("shared frame bind ticker", () => {
  test("multiple subscribers share one registry", () => {
    const calls: string[] = [];
    const unsubA = subscribeFrameBind(() => calls.push("a"));
    const unsubB = subscribeFrameBind(() => calls.push("b"));
    expect(frameBindSubscriberCount()).toBe(2);
    unsubA();
    expect(frameBindSubscriberCount()).toBe(1);
    unsubB();
    expect(frameBindSubscriberCount()).toBe(0);
  });

  test("unsubscribe removes only the target subscriber", () => {
    let a = 0;
    let b = 0;
    const unsubA = subscribeFrameBind(() => {
      a += 1;
    });
    const unsubB = subscribeFrameBind(() => {
      b += 1;
    });
    unsubA();
    expect(frameBindSubscriberCount()).toBe(1);
    unsubB();
    expect(a).toBe(0);
    expect(b).toBe(0);
  });
});
