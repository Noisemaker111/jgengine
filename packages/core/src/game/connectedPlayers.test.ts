import { describe, expect, test } from "bun:test";

import { createConnectedPlayers, type ConnectedPlayer } from "./connectedPlayers";

describe("connectedPlayers input", () => {
  test("records a joined player's input, ignores unknown players, and clears on leave", () => {
    const players = createConnectedPlayers();
    const frame = { held: ["moveForward"], pointer: null };

    players.setInput("alice", frame);
    expect(players.input("alice")).toBeNull();

    players.join("alice", true);
    expect(players.input("alice")).toBeNull();

    players.setInput("alice", frame);
    expect(players.input("alice")).toEqual(frame);
    expect(players.get("alice")?.input).toEqual(frame);

    players.leave("alice");
    expect(players.input("alice")).toBeNull();
  });
});

describe("connectedPlayers snapshot immutability", () => {
  test("get() returns a frozen player; mutating it never reaches the registry", () => {
    const players = createConnectedPlayers();
    players.join("alice", true);
    const snapshot = players.get("alice") as ConnectedPlayer;

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => {
      (snapshot as { isNew: boolean }).isNew = false;
    }).toThrow();

    expect(players.get("alice")?.isNew).toBe(true);
  });

  test("list() entries are frozen and stale after setInput publishes a new one", () => {
    const players = createConnectedPlayers();
    players.join("alice", true);
    const stale = players.list()[0] as ConnectedPlayer;
    expect(Object.isFrozen(stale)).toBe(true);

    const frame = { held: ["jump"], pointer: null };
    players.setInput("alice", frame);

    expect(stale.input).toBeNull();
    expect(players.get("alice")?.input).toEqual(frame);
  });
});
