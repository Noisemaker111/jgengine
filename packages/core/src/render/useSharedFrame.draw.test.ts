import { describe, expect, test } from "bun:test";

import { joinFrameGroup, observeSharedFrames } from "./useSharedFrame.draw";

/** A frame loop like r3f's: subscribers by priority, run in order. */
function fakeLoop() {
  const subscribers: { task: { current(state: unknown, delta: number): void }; priority: number }[] = [];
  const subscribe = (task: { current(state: unknown, delta: number): void }, priority: number) => {
    const entry = { task, priority };
    subscribers.push(entry);
    subscribers.sort((a, b) => a.priority - b.priority);
    return () => void subscribers.splice(subscribers.indexOf(entry), 1);
  };
  const state = {};
  const frame = () => {
    for (const { task } of [...subscribers]) task.current(state, 0.016);
  };
  return { subscribers, subscribe, frame };
}

describe("shared frame callbacks", () => {
  test("optional observation identifies every member and balances scopes on failure", () => {
    const loop = fakeLoop();
    const calls: string[] = [];
    const a = { current: () => calls.push("a") };
    const b = { current: () => { calls.push("b"); throw new Error("failure"); } };
    joinFrameGroup(loop, loop.subscribe, 0, a);
    joinFrameGroup(loop, loop.subscribe, 0, b);
    observeSharedFrames({ enter: (task) => calls.push(task === a ? "enter a" : "enter b"), leave: () => calls.push("leave") });
    try {
      expect(() => loop.frame()).toThrow("failure");
      expect(calls).toEqual(["enter a", "a", "leave", "enter b", "b", "leave"]);
    } finally { observeSharedFrames(null); }
  });
  test("a thousand copies at one priority are one subscriber, run in the order they joined", () => {
    const loop = fakeLoop();
    const ran: number[] = [];
    const leaves = Array.from({ length: 1000 }, (_, index) => joinFrameGroup(loop, loop.subscribe, 0.2, { current: () => void ran.push(index) }));
    joinFrameGroup(loop, loop.subscribe, 0.1, { current: () => void ran.push(-1) });
    expect(loop.subscribers).toHaveLength(2);
    loop.frame();
    expect(ran[0]).toBe(-1);
    expect(ran.slice(1)).toEqual(Array.from({ length: 1000 }, (_, index) => index));
    for (const leave of leaves) leave();
    expect(loop.subscribers).toHaveLength(1);
  });

  test("a copy that leaves stops running, and the loop forgets the priority once the last one leaves", () => {
    const loop = fakeLoop();
    const ran: string[] = [];
    const leaveA = joinFrameGroup(loop, loop.subscribe, 0, { current: () => void ran.push("a") });
    const leaveB = joinFrameGroup(loop, loop.subscribe, 0, { current: () => void ran.push("b") });
    leaveA();
    loop.frame();
    expect(ran).toEqual(["b"]);
    leaveB();
    expect(loop.subscribers).toHaveLength(0);
    joinFrameGroup(loop, loop.subscribe, 0, { current: () => void ran.push("c") });
    loop.frame();
    expect(ran).toEqual(["b", "c"]);
  });
});
