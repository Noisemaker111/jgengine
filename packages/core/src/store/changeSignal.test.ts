import { describe, expect, test } from "bun:test";

import { createChangeSignal, notifyAfter } from "./changeSignal";

describe("createChangeSignal", () => {
  test("notify bumps version and fires listeners", () => {
    const signal = createChangeSignal();
    expect(signal.version()).toBe(0);
    let fired = 0;
    const unsubscribe = signal.subscribe(() => {
      fired += 1;
    });
    signal.notify();
    signal.notify();
    expect(fired).toBe(2);
    expect(signal.version()).toBe(2);
    unsubscribe();
    signal.notify();
    expect(fired).toBe(2);
    expect(signal.version()).toBe(3);
  });

  test("supports multiple listeners with independent unsubscribe", () => {
    const signal = createChangeSignal();
    let a = 0;
    let b = 0;
    const offA = signal.subscribe(() => {
      a += 1;
    });
    signal.subscribe(() => {
      b += 1;
    });
    signal.notify();
    offA();
    signal.notify();
    expect(a).toBe(1);
    expect(b).toBe(2);
  });
});

describe("notifyAfter", () => {
  test("wraps only the listed methods and preserves results", () => {
    const signal = createChangeSignal();
    const target = {
      add(x: number, y: number) {
        return x + y;
      },
      read() {
        return "value";
      },
    };
    const wrapped = notifyAfter(target, ["add"], signal.notify);
    expect(wrapped.add(2, 3)).toBe(5);
    expect(signal.version()).toBe(1);
    expect(wrapped.read()).toBe("value");
    expect(signal.version()).toBe(1);
  });
});
