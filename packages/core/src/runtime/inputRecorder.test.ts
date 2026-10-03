import { describe, expect, test } from "bun:test";

import { createInputRecorder } from "./inputRecorder";

test("same-tick neutral retains the accepted press and replay never repeats it on later ticks", () => {
  const recorder = createInputRecorder();
  const press = { action: "fire", seq: 42 };
  recorder.record(7, { held: ["fire"], pointer: null, presses: [press] });
  press.action = "mutated";
  recorder.record(7, { held: [], pointer: null });
  expect(recorder.frameAt(7)).toMatchObject({ held: [], presses: [{ action: "fire", seq: 42 }] });
  expect(recorder.frameAt(8)?.presses).toBeUndefined();
  const restored = createInputRecorder();
  restored.restore(recorder.snapshot());
  expect(restored.frameAt(7)).toEqual(recorder.frameAt(7));
  expect(restored.frameAt(8)?.presses).toBeUndefined();
});

describe("createInputRecorder", () => {
  test("frameAt returns the frame in force at a tick", () => {
    const recorder = createInputRecorder();
    recorder.record(3, { held: ["jump"], pointer: null });
    recorder.record(1, { held: ["moveRight"], pointer: null });
    expect(recorder.frameAt(0)).toBeNull();
    expect(recorder.frameAt(1)?.held).toEqual(["moveRight"]);
    expect(recorder.frameAt(2)?.held).toEqual(["moveRight"]);
    expect(recorder.frameAt(3)?.held).toEqual(["jump"]);
    expect(recorder.frameAt(99)?.held).toEqual(["jump"]);
    expect(recorder.lastTick()).toBe(3);
  });

  test("recording the same tick twice replaces it and frames are copied", () => {
    const recorder = createInputRecorder();
    const held = ["a"];
    recorder.record(1, { held, pointer: null });
    held.push("b");
    recorder.record(1, { held: ["c"], pointer: { x: 0.5, y: -0.5 } });
    expect(recorder.frames()).toHaveLength(1);
    expect(recorder.frameAt(1)?.held).toEqual(["c"]);
  });

  test("snapshot and restore round-trip", () => {
    const recorder = createInputRecorder();
    recorder.record(2, { held: ["x"], pointer: null, analog: { x: 0.3 } });
    const copy = createInputRecorder();
    copy.restore(recorder.snapshot());
    expect(copy.frames()).toEqual(recorder.frames());
    recorder.clear();
    expect(recorder.lastTick()).toBe(-1);
    expect(copy.lastTick()).toBe(2);
  });
});
