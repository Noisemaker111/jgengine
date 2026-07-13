import { describe, expect, test } from "bun:test";

import {
  createSnapshotHistory,
  emptyHistory,
  recordSnapshot,
  redoSnapshot,
  undoSnapshot,
} from "./snapshotHistory";

describe("pure snapshot stacks", () => {
  test("record pushes onto past and clears the redo future", () => {
    let stacks = emptyHistory<number>();
    stacks = recordSnapshot(stacks, 1);
    stacks = recordSnapshot(stacks, 2);
    expect(stacks.past).toEqual([1, 2]);
    expect(stacks.future).toEqual([]);
  });

  test("record enforces the limit by dropping the oldest", () => {
    let stacks = emptyHistory<number>();
    for (let i = 0; i < 5; i += 1) stacks = recordSnapshot(stacks, i, 3);
    expect(stacks.past).toEqual([2, 3, 4]);
  });

  test("undo restores the prior state and banks the present for redo", () => {
    let stacks = recordSnapshot(emptyHistory<string>(), "a");
    const step = undoSnapshot(stacks, "b")!;
    expect(step.snapshot).toBe("a");
    expect(step.stacks.past).toEqual([]);
    expect(step.stacks.future).toEqual(["b"]);
    stacks = step.stacks;
    const redo = redoSnapshot(stacks, "a")!;
    expect(redo.snapshot).toBe("b");
    expect(redo.stacks.past).toEqual(["a"]);
    expect(redo.stacks.future).toEqual([]);
  });

  test("undo/redo return null at the ends", () => {
    expect(undoSnapshot(emptyHistory<number>(), 0)).toBeNull();
    expect(redoSnapshot(emptyHistory<number>(), 0)).toBeNull();
  });
});

describe("createSnapshotHistory", () => {
  test("drives an undo/redo round trip over a live present", () => {
    const history = createSnapshotHistory<string>();
    let present = "v0";
    history.record(present);
    present = "v1";
    history.record(present);
    present = "v2";

    expect(history.canUndo()).toBe(true);
    present = history.undo(present)!;
    expect(present).toBe("v1");
    present = history.undo(present)!;
    expect(present).toBe("v0");
    expect(history.canUndo()).toBe(false);

    present = history.redo(present)!;
    expect(present).toBe("v1");
    expect(history.canRedo()).toBe(true);
  });

  test("recording forks the redo future", () => {
    const history = createSnapshotHistory<number>();
    history.record(1);
    const undone = history.undo(2);
    expect(undone).toBe(1);
    expect(history.canRedo()).toBe(true);
    history.record(1);
    expect(history.canRedo()).toBe(false);
  });

  test("clear drops all history", () => {
    const history = createSnapshotHistory<number>();
    history.record(1);
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.stacks()).toEqual({ past: [], future: [] });
  });
});
