import { describe, expect, test } from "bun:test";
import { createIntentBoard } from "@jgengine/core/turn/intent";
import { createSnapshotStore } from "@jgengine/core/tactics/snapshot";

describe("intent board", () => {
  test("declare then peek returns the intent, and a later declare replaces it", () => {
    const board = createIntentBoard<"attack" | "guard">();
    board.declare({ participant: "goblin", kind: "attack", magnitude: 8, target: "hero" });
    expect(board.peek("goblin")).toEqual({ participant: "goblin", kind: "attack", magnitude: 8, target: "hero" });

    board.declare({ participant: "goblin", kind: "guard" });
    expect(board.peek("goblin")).toEqual({ participant: "goblin", kind: "guard" });
    expect(board.all()).toEqual([{ participant: "goblin", kind: "guard" }]);
  });

  test("resolve returns and removes the intent", () => {
    const board = createIntentBoard();
    board.declare({ participant: "boss", kind: "slam", magnitude: 20 });
    expect(board.resolve("boss")).toEqual({ participant: "boss", kind: "slam", magnitude: 20 });
    expect(board.peek("boss")).toBeNull();
    expect(board.resolve("boss")).toBeNull();
  });

  test("clear removes one participant or every intent", () => {
    const board = createIntentBoard();
    board.declare({ participant: "a", kind: "attack" });
    board.declare({ participant: "b", kind: "attack" });
    board.clear("a");
    expect(board.peek("a")).toBeNull();
    expect(board.peek("b")).not.toBeNull();

    board.clear();
    expect(board.all()).toEqual([]);
  });

  test("snapshot store round-trips the board alongside other engine slices", () => {
    const board = createIntentBoard();
    board.declare({ participant: "goblin", kind: "attack", magnitude: 8 });

    const store = createSnapshotStore();
    store.register("intents", board);
    const snap = store.capture();

    board.declare({ participant: "goblin", kind: "guard" });
    board.declare({ participant: "boss", kind: "slam" });

    store.restore(snap);
    expect(board.peek("goblin")).toEqual({ participant: "goblin", kind: "attack", magnitude: 8 });
    expect(board.peek("boss")).toBeNull();
  });
});
