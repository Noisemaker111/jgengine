import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { bindFrameOwner, bindFrameSource, isPrimaryFrameOwner, joinFrameTask, observeFrameTasks, withFrameOwner, type FrameTask } from "./frameBoard.draw";

/** A frame source like the engine loop's: one attachment per priority, run in priority order. */
function fakeSource() {
  const attached: { priority: number; run: FrameTask }[] = [];
  bindFrameSource((priority, run) => {
    const entry = { priority, run };
    attached.push(entry);
    attached.sort((a, b) => a.priority - b.priority);
    return () => void attached.splice(attached.indexOf(entry), 1);
  });
  const frame = () => {
    for (const { run } of [...attached]) run({} as never, 0.016);
  };
  return { attached, frame };
}

describe("the frame board", () => {
  let source = fakeSource();
  beforeEach(() => { source = fakeSource(); });
  afterEach(() => {
    observeFrameTasks(null);
    bindFrameSource(null);
  });

  test("observation identifies every task and balances scopes on failure", () => {
    const calls: string[] = [];
    const a = () => void calls.push("a");
    const b = () => { calls.push("b"); throw new Error("failure"); };
    const leaveA = joinFrameTask(0, a);
    const leaveB = joinFrameTask(0, b);
    observeFrameTasks({ enter: (task) => calls.push(task.current === a ? "enter a" : "enter b"), leave: () => calls.push("leave") });
    try {
      expect(() => source.frame()).toThrow("failure");
      expect(calls).toEqual(["enter a", "a", "leave", "enter b", "b", "leave"]);
    } finally {
      leaveA();
      leaveB();
    }
  });

  test("a thousand tasks at one priority are one attachment, run in the order they joined", () => {
    const ran: number[] = [];
    const leaves = Array.from({ length: 1000 }, (_, index) => joinFrameTask(0.2, () => void ran.push(index)));
    const leaveFirst = joinFrameTask(0.1, () => void ran.push(-1));
    expect(source.attached).toHaveLength(2);
    source.frame();
    expect(ran[0]).toBe(-1);
    expect(ran.slice(1)).toEqual(Array.from({ length: 1000 }, (_, index) => index));
    for (const leave of leaves) leave();
    expect(source.attached).toHaveLength(1);
    leaveFirst();
  });

  test("a task that leaves stops running, and the source forgets the priority once the last one leaves", () => {
    const ran: string[] = [];
    const leaveA = joinFrameTask(0, () => void ran.push("a"));
    const leaveB = joinFrameTask(0, () => void ran.push("b"));
    leaveA();
    source.frame();
    expect(ran).toEqual(["b"]);
    leaveB();
    expect(source.attached).toHaveLength(0);
    const leaveC = joinFrameTask(0, () => void ran.push("c"));
    source.frame();
    expect(ran).toEqual(["b", "c"]);
    leaveC();
  });

  test("tasks joined before a source is bound attach when one is", () => {
    bindFrameSource(null);
    const ran: string[] = [];
    const leave = joinFrameTask(0, () => void ran.push("early"));
    const late = fakeSource();
    late.frame();
    expect(ran).toEqual(["early"]);
    leave();
    expect(late.attached).toHaveLength(0);
  });
});

/** One canvas: an owner bound as its own frame source, like `createEngineLoop` does. */
function fakeCanvas(name: string) {
  const owner = { name };
  const attached: FrameTask[] = [];
  const unbind = bindFrameOwner(owner, (_priority, run) => {
    attached.push(run);
    return () => void attached.splice(attached.indexOf(run), 1);
  });
  const frame = () => {
    for (const run of [...attached]) run({ frameOwner: owner } as never, 0.016);
  };
  return { owner, frame, unbind };
}

describe("several canvases on one page", () => {
  test("a task runs on the canvas it was joined under, and a closing preview stops nothing else", () => {
    const game = fakeCanvas("game");
    const preview = fakeCanvas("preview");
    const leaves: (() => void)[] = [];
    try {
      expect(isPrimaryFrameOwner(game.owner)).toBe(true);
      expect(isPrimaryFrameOwner(preview.owner)).toBe(false);
      const ran: string[] = [];
      const seen = (label: string): FrameTask => (state) => void ran.push(`${label}@${(state.frameOwner as { name: string }).name}`);
      leaves.push(joinFrameTask(0, seen("hud"), game.owner));
      leaves.push(joinFrameTask(0, seen("model"), preview.owner));
      // A draw mounting under the preview joins from its own code with no owner in hand.
      leaves.push(withFrameOwner(preview.owner, () => joinFrameTask(0, seen("spin"))));
      leaves.push(joinFrameTask(0, seen("ownerless")));
      game.frame();
      expect(ran).toEqual(["hud@game", "ownerless@game"]);
      ran.length = 0;
      preview.frame();
      expect(ran).toEqual(["model@preview", "spin@preview"]);
      ran.length = 0;
      preview.unbind();
      preview.frame();
      game.frame();
      expect(ran).toEqual(["hud@game", "ownerless@game"]);
    } finally {
      for (const leave of leaves) leave();
      preview.unbind();
      game.unbind();
    }
  });
});
