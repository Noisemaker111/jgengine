import { describe, expect, test } from "bun:test";
import { createLocalPlayers } from "./localPlayers";
import { createInputSnapshot } from "./inputSnapshot";

describe("createLocalPlayers", () => {
  test("the first pad claims the primary seat, later pads hot-join new seats until full", () => {
    const primaryInput = createInputSnapshot();
    const players = createLocalPlayers({ maxSlots: 3, primaryUserId: "u1", primaryInput });
    expect(players.assign("gamepad:0")).toEqual({ slot: { slotId: "slot:0", index: 0, userId: "u1", deviceId: "gamepad:0" }, joined: false });
    expect(players.assign("gamepad:0")?.joined).toBe(false);
    expect(players.assign("gamepad:1")).toEqual({ slot: { slotId: "slot:1", index: 1, userId: "u1:p2", deviceId: "gamepad:1" }, joined: true });
    expect(players.assign("gamepad:3")?.slot.userId).toBe("u1:p3");
    expect(players.assign("gamepad:2")).toBeNull();
    expect(players.local("slot:0")?.input).toBe(primaryInput);
    expect(players.local("slot:1")?.input).not.toBe(primaryInput);
    expect(players.local("slot:1")?.input).toBe(players.local("slot:1")!.input);
  });

  test("one seat routes every device to the primary player", () => {
    const players = createLocalPlayers({ maxSlots: 1, primaryUserId: "u1" });
    expect(players.assign("gamepad:0")?.slot.index).toBe(0);
    expect(players.assign("gamepad:1")).toEqual({ slot: players.slots()[0]!, joined: false });
    expect(players.slots()).toHaveLength(1);
  });

  test("claimPrimary none keeps the primary seat keyboard-only", () => {
    const players = createLocalPlayers({ maxSlots: 2, primaryUserId: "u1", claimPrimary: "none", userIdFor: (i) => `guest-${i}` });
    expect(players.assign("gamepad:0")).toEqual({ slot: { slotId: "slot:1", index: 1, userId: "guest-1", deviceId: "gamepad:0" }, joined: true });
    expect(players.slots()[0]?.deviceId).toBeNull();
  });

  test("release frees a seat for the next device and never frees the primary", () => {
    const players = createLocalPlayers({ maxSlots: 2, primaryUserId: "u1" });
    players.assign("gamepad:0");
    players.assign("gamepad:1");
    expect(players.release("slot:0")).toBe(false);
    expect(players.release("slot:1")).toBe(true);
    expect(players.slotForDevice("gamepad:1")).toBeNull();
    expect(players.assign("gamepad:2")?.slot.slotId).toBe("slot:1");
  });

  test("snapshot/restore round-trips the seat table and retune changes capacity", () => {
    const players = createLocalPlayers({ maxSlots: 2, primaryUserId: "u1" });
    let calls = 0;
    players.subscribe(() => {
      calls += 1;
    });
    players.assign("gamepad:0");
    players.assign("gamepad:1");
    const saved = players.snapshot();
    const copy = createLocalPlayers({ maxSlots: 1, primaryUserId: "u1" });
    copy.restore(saved);
    expect(copy.snapshot()).toEqual(saved);
    expect(copy.slotForDevice("gamepad:1")?.userId).toBe("u1:p2");
    players.retune({ maxSlots: 3 });
    expect(players.assign("gamepad:2")?.joined).toBe(true);
    expect(calls).toBe(4);
  });
});
