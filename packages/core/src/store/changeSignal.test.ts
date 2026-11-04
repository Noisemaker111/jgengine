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

describe("batch", () => {
  test("a frame of writes notifies once, and readers inside see each version", () => {
    const signal = createChangeSignal();
    let fired = 0;
    signal.subscribe(() => {
      fired += 1;
    });
    const seen: number[] = [];
    signal.batch(() => {
      for (let write = 0; write < 500; write += 1) {
        signal.notify();
        seen.push(signal.version());
      }
      signal.batch(() => signal.notify());
      expect(fired).toBe(0);
    });
    expect(fired).toBe(1);
    expect(seen.at(-1)).toBe(500);
    expect(signal.version()).toBe(501);
  });

  test("a batch with no writes does not notify, and a throw still releases the listeners", () => {
    const signal = createChangeSignal();
    let fired = 0;
    signal.subscribe(() => {
      fired += 1;
    });
    signal.batch(() => undefined);
    expect(fired).toBe(0);
    expect(() =>
      signal.batch(() => {
        signal.notify();
        throw new Error("tick failed");
      }),
    ).toThrow("tick failed");
    expect(fired).toBe(1);
    signal.notify();
    expect(fired).toBe(2);
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
