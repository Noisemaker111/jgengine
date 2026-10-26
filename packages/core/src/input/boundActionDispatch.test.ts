import { describe, expect, test } from "bun:test";

import { dispatchBoundAction } from "./boundActionDispatch";

function capture() {
  const runs: { name: string; input: unknown }[] = [];
  const ctx = { game: { commands: { has: (name: string) => name === "fire" } } } as never;
  const sink = { run: (name: string, input: unknown) => void runs.push({ name, input }) } as never;
  return { ctx, sink, runs };
}

describe("dispatchBoundAction", () => {
  test("the press runs the command with held:false", () => {
    const { ctx, sink, runs } = capture();
    dispatchBoundAction(ctx, "fire", 0.5, 0, { yaw: 0.5, pitch: 0 }, new Set(), sink);
    expect(runs).toEqual([{ name: "fire", input: { yaw: 0.5, pitch: 0, aim: { yaw: 0.5, pitch: 0 }, held: false } }]);
  });

  test("a repeat while the trigger stays down says held:true", () => {
    const { ctx, sink, runs } = capture();
    dispatchBoundAction(ctx, "fire", 0, 0, { yaw: 0, pitch: 0 }, new Set(), sink, true);
    expect((runs[0]!.input as { held: boolean }).held).toBe(true);
  });
});
