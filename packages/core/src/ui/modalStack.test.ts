import { describe, expect, test } from "bun:test";

import {
  MODAL_CANCEL,
  MODAL_CONFIRM,
  createModalStack,
  type ModalResolution,
} from "@jgengine/core/ui/modalStack";

describe("createModalStack push / query", () => {
  test("starts empty", () => {
    const stack = createModalStack();
    expect(stack.isOpen()).toBe(false);
    expect(stack.depth()).toBe(0);
    expect(stack.top()).toBeNull();
  });

  test("push opens a modal on top and auto-assigns ids", () => {
    const stack = createModalStack();
    const a = stack.push({ kind: "confirm", payload: { title: "Quit?" } });
    const b = stack.push({ kind: "pause" });
    expect(a.id).not.toBe(b.id);
    expect(stack.depth()).toBe(2);
    expect(stack.isOpen()).toBe(true);
    expect(stack.top()?.id).toBe(b.id);
    expect(stack.stack().map((m) => m.kind)).toEqual(["confirm", "pause"]);
    expect(stack.has(a.id)).toBe(true);
  });

  test("honours an explicit id", () => {
    const stack = createModalStack();
    stack.push({ id: "pause", kind: "pause" });
    expect(stack.has("pause")).toBe(true);
    expect(stack.top()?.id).toBe("pause");
  });

  test("initial modals open bottom-first at construction", () => {
    const stack = createModalStack({ initial: [{ id: "a", kind: "x" }, { id: "b", kind: "y" }] });
    expect(stack.stack().map((m) => m.id)).toEqual(["a", "b"]);
    expect(stack.top()?.id).toBe("b");
  });
});

describe("resolve / pop / clear", () => {
  test("resolve closes the top and reports the result", () => {
    const resolutions: ModalResolution[] = [];
    const stack = createModalStack({ now: () => 1000, onResolve: (r) => resolutions.push(r) });
    stack.push({ id: "quit", kind: "confirm", payload: { n: 3 } });
    const res = stack.resolve(MODAL_CONFIRM);
    expect(res).toEqual({ id: "quit", kind: "confirm", result: "confirm", payload: { n: 3 }, at: 1000 });
    expect(resolutions).toEqual([res!]);
    expect(stack.isOpen()).toBe(false);
    expect(stack.lastResolution()).toEqual(res!);
  });

  test("resolve targets a specific id from within the stack", () => {
    const stack = createModalStack();
    stack.push({ id: "a", kind: "x" });
    stack.push({ id: "b", kind: "y" });
    stack.resolve("done", { id: "a" });
    expect(stack.has("a")).toBe(false);
    expect(stack.top()?.id).toBe("b");
  });

  test("resolve on an empty stack or unknown id returns null", () => {
    const stack = createModalStack();
    expect(stack.resolve(MODAL_CONFIRM)).toBeNull();
    stack.push({ id: "a", kind: "x" });
    expect(stack.resolve("x", { id: "missing" })).toBeNull();
  });

  test("pop resolves the top with cancel", () => {
    const stack = createModalStack();
    stack.push({ id: "a", kind: "x" });
    const popped = stack.pop();
    expect(popped?.id).toBe("a");
    expect(stack.lastResolution()?.result).toBe(MODAL_CANCEL);
    expect(stack.pop()).toBeNull();
  });

  test("clear cancels every open modal top-first", () => {
    const order: string[] = [];
    const stack = createModalStack({ onResolve: (r) => order.push(r.id) });
    stack.push({ id: "a", kind: "x" });
    stack.push({ id: "b", kind: "y" });
    stack.clear();
    expect(order).toEqual(["b", "a"]);
    expect(stack.depth()).toBe(0);
  });
});

describe("auto-dismiss timers", () => {
  test("tick resolves an elapsed modal with its timeoutResult", () => {
    let clock = 0;
    const stack = createModalStack({ now: () => clock });
    stack.push({ id: "toast", kind: "toast", timeoutMs: 500, timeoutResult: "dismissed" });
    clock = 300;
    expect(stack.tick()).toEqual([]);
    expect(stack.isOpen()).toBe(true);
    clock = 500;
    const fired = stack.tick();
    expect(fired.map((r) => r.result)).toEqual(["dismissed"]);
    expect(stack.isOpen()).toBe(false);
  });

  test("timeRemaining counts down and clamps at 0", () => {
    let clock = 0;
    const stack = createModalStack({ now: () => clock });
    stack.push({ id: "toast", kind: "toast", timeoutMs: 1000 });
    expect(stack.timeRemaining()).toBe(1000);
    clock = 400;
    expect(stack.timeRemaining("toast")).toBe(600);
    clock = 5000;
    expect(stack.timeRemaining()).toBe(0);
  });

  test("timeRemaining is null without a timer", () => {
    const stack = createModalStack();
    stack.push({ id: "a", kind: "x" });
    expect(stack.timeRemaining()).toBeNull();
    expect(stack.timeRemaining("missing")).toBeNull();
  });
});

describe("subscribe / snapshot / restore", () => {
  test("subscribe fires on every mutation and unsubscribes", () => {
    const stack = createModalStack();
    let count = 0;
    const off = stack.subscribe(() => (count += 1));
    stack.push({ id: "a", kind: "x" });
    stack.resolve(MODAL_CONFIRM);
    expect(count).toBe(2);
    off();
    stack.push({ id: "b", kind: "y" });
    expect(count).toBe(2);
  });

  test("snapshot is plain serializable JSON", () => {
    const stack = createModalStack({ now: () => 42 });
    stack.push({ id: "a", kind: "confirm", payload: { q: "?" } });
    const snap = stack.snapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.entries[0]?.openedAt).toBe(42);
  });

  test("restore replaces the stack and keeps ids unique", () => {
    const stack = createModalStack();
    stack.push({ kind: "x" });
    const snap = stack.snapshot();
    const other = createModalStack();
    other.restore(snap);
    expect(other.stack().map((m) => m.id)).toEqual(snap.entries.map((e) => e.record.id));
    // next auto id continues past the restored seq (no collision with restored ids)
    const pushed = other.push({ kind: "y" });
    expect(other.has(pushed.id)).toBe(true);
    expect(snap.entries.some((e) => e.record.id === pushed.id)).toBe(false);
  });
});
