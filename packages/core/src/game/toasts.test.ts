import { describe, expect, test } from "bun:test";

import { appendToast, createToastQueue, pruneToasts, type Toast } from "./toasts";

describe("pure toast helpers", () => {
  test("appendToast keeps only the newest cap entries", () => {
    let toasts: readonly Toast[] = [];
    for (let i = 0; i < 5; i += 1) toasts = appendToast(toasts, { id: `t${i}`, body: `m${i}`, expiresAt: 0 }, 3);
    expect(toasts.map((t) => t.id)).toEqual(["t2", "t3", "t4"]);
  });

  test("pruneToasts drops expired and preserves identity when nothing expired", () => {
    const toasts: readonly Toast[] = [
      { id: "a", body: "a", expiresAt: 5 },
      { id: "b", body: "b", expiresAt: 10 },
    ];
    expect(pruneToasts(toasts, 7).map((t) => t.id)).toEqual(["b"]);
    expect(pruneToasts(toasts, 1)).toBe(toasts);
  });
});

describe("createToastQueue", () => {
  test("raises, caps, and expires toasts by game time", () => {
    const queue = createToastQueue<string>({ cap: 2, ttlSeconds: 3 });
    queue.push("first", 0);
    queue.push("second", 1);
    queue.push("third", 2);
    expect(queue.list().map((t) => t.body)).toEqual(["second", "third"]);

    queue.prune(4);
    expect(queue.list().map((t) => t.body)).toEqual(["third"]);
    queue.prune(6);
    expect(queue.list()).toEqual([]);
  });

  test("push honours a per-toast ttl and returns the toast", () => {
    const queue = createToastQueue<string>();
    const toast = queue.push("quick", 10, 0.5);
    expect(toast.expiresAt).toBeCloseTo(10.5);
    queue.prune(10.4);
    expect(queue.list()).toHaveLength(1);
    queue.prune(11);
    expect(queue.list()).toHaveLength(0);
  });

  test("clear empties the queue", () => {
    const queue = createToastQueue();
    queue.push("x", 0);
    queue.clear();
    expect(queue.list()).toEqual([]);
  });
});
