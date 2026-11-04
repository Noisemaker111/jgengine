import { expect, test } from "bun:test";

import { joinFrameGroup } from "../render/useSharedFrame.draw";
import { installFrameBreakdown } from "./frameBreakdown.draw";

test("records real shared members and repeated render calls through the frame loop", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "?frameMembers=1" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = {
    subscribers,
    subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
      const entry = { ref, priority };
      subscribers.push(entry);
      subscribers.sort((a, b) => a.priority - b.priority);
      return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
    },
  };
  const store = { getState: () => ({ internal }) };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
  const renderTwice = () => { renderer.render(); renderer.render(); };
  let groundReads = 0;
  const ground = () => { groundReads += 1; };
  const leaveA = joinFrameGroup(store, internal.subscribe, 0, { current: renderTwice });
  const leaveB = joinFrameGroup(store, internal.subscribe, 0, { current: ground });
  const breakdown = installFrameBreakdown(renderer as never, store as never);
  try {
    for (let i = 0; i < 2; i += 1) for (const { ref } of subscribers) ref.current({}, 0.016);
    const record = breakdown.records()[0];
    expect(record?.calls?.["render:main"]).toBe(2);
    const labels = Object.entries(breakdown.callbacks()).filter(([name]) => name.includes("sharedMember"));
    expect(labels.map(([, callback]) => callback)).toEqual([renderTwice, ground]);
    for (const [label] of labels) expect(record?.calls?.[label]).toBe(1);
    expect(groundReads).toBe(2);
    expect(record?.gpu).toBeNull();
  } finally {
    breakdown.dispose();
    leaveA();
    leaveB();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", prior);
  }
});
