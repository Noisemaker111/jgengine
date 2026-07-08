import { describe, expect, test } from "bun:test";
import { createIntentBoard } from "@jgengine/core/turn/intent";

type MoveIntent = "attack" | "defend" | "flee";

describe("intent board", () => {
  test("declare/peek/consume lifecycle", () => {
    const board = createIntentBoard<MoveIntent>();
    expect(board.peek("hero")).toBeNull();
    board.declare("hero", { kind: "attack", targetId: "goblin", magnitude: 3 });
    expect(board.peek("hero")).toEqual({ kind: "attack", targetId: "goblin", magnitude: 3 });
    expect(board.peek("hero")).toEqual({ kind: "attack", targetId: "goblin", magnitude: 3 });
    expect(board.consume("hero")).toEqual({ kind: "attack", targetId: "goblin", magnitude: 3 });
    expect(board.peek("hero")).toBeNull();
    expect(board.consume("hero")).toBeNull();
  });

  test("redeclaring overwrites the pending intent", () => {
    const board = createIntentBoard<MoveIntent>();
    board.declare("hero", { kind: "attack", targetId: "goblin" });
    board.declare("hero", { kind: "defend" });
    expect(board.peek("hero")).toEqual({ kind: "defend" });
  });

  test("all() lists every declared intent as [participantId, intent] pairs", () => {
    const board = createIntentBoard<MoveIntent>();
    board.declare("hero", { kind: "attack", targetId: "goblin" });
    board.declare("mage", { kind: "flee" });
    expect(board.all()).toEqual([
      ["hero", { kind: "attack", targetId: "goblin" }],
      ["mage", { kind: "flee" }],
    ]);
  });

  test("clear(participantId) removes only that participant", () => {
    const board = createIntentBoard<MoveIntent>();
    board.declare("hero", { kind: "attack" });
    board.declare("mage", { kind: "flee" });
    board.clear("hero");
    expect(board.peek("hero")).toBeNull();
    expect(board.peek("mage")).toEqual({ kind: "flee" });
  });

  test("clear() with no argument wipes every declared intent", () => {
    const board = createIntentBoard<MoveIntent>();
    board.declare("hero", { kind: "attack" });
    board.declare("mage", { kind: "flee" });
    board.clear();
    expect(board.all()).toEqual([]);
  });

  test("mutating a returned intent does not affect board state", () => {
    const board = createIntentBoard<MoveIntent>();
    board.declare("hero", { kind: "attack", note: "opening" });
    const peeked = board.peek("hero")!;
    peeked.note = "tampered";
    expect(board.peek("hero")).toEqual({ kind: "attack", note: "opening" });
  });
});
