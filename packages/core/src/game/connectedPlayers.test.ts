import { describe, expect, test } from "bun:test";

import { createConnectedPlayers } from "./connectedPlayers";

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
