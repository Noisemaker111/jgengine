import { describe, expect, test } from "bun:test";
import { createTurnLoop } from "@jgengine/core/turn/turnLoop";

describe("turnLoop initiative + phases", () => {
  test("advanceTurn walks initiative order and increments round on wrap", () => {
    const loop = createTurnLoop({ order: ["a", "b", "c"] });
    expect(loop.active()).toBe("a");
    expect(loop.round()).toBe(1);
    expect(loop.advanceTurn().active).toBe("b");
    expect(loop.advanceTurn().active).toBe("c");
    const wrapped = loop.advanceTurn();
    expect(wrapped.active).toBe("a");
    expect(wrapped.round).toBe(2);
  });

  test("advancePhase steps phases then rolls into the next turn", () => {
    const loop = createTurnLoop({ order: ["a", "b"], phases: ["upkeep", "main", "end"] });
    expect(loop.phase()).toBe("upkeep");
    expect(loop.advancePhase().phase).toBe("main");
    expect(loop.advancePhase().phase).toBe("end");
    const rolled = loop.advancePhase();
    expect(rolled.active).toBe("b");
    expect(rolled.phase).toBe("upkeep");
  });
});

describe("action-economy pools", () => {
  const pools = [
    { id: "action", max: 1 },
    { id: "bonus", max: 1 },
    { id: "movement", max: 30 },
    { id: "reaction", max: 1 },
  ];

  test("pools seed to max and spend independently", () => {
    const loop = createTurnLoop({ order: ["hero"], pools });
    expect(loop.canSpend("hero", "action")).toBe(true);
    expect(loop.spend("hero", "action")).toBe(true);
    expect(loop.canSpend("hero", "action")).toBe(false);
    expect(loop.spend("hero", "action")).toBe(false);
    expect(loop.spend("hero", "movement", 25)).toBe(true);
    expect(loop.pool("hero", "movement")!.current).toBe(5);
    expect(loop.pool("hero", "bonus")!.current).toBe(1);
  });

  test("pools reset when a participant re-enters their turn", () => {
    const loop = createTurnLoop({ order: ["a", "b"], pools });
    loop.spend("a", "action");
    loop.spend("a", "movement", 30);
    expect(loop.pool("a", "action")!.current).toBe(0);
    loop.advanceTurn();
    loop.advanceTurn();
    expect(loop.active()).toBe("a");
    expect(loop.pool("a", "action")!.current).toBe(1);
    expect(loop.pool("a", "movement")!.current).toBe(30);
  });

  test("start overrides seed value and gain clamps to max", () => {
    const loop = createTurnLoop({ order: ["mage"], pools: [{ id: "energy", max: 3, start: 3 }] });
    expect(loop.spend("mage", "energy", 3)).toBe(true);
    loop.gain("mage", "energy", 10);
    expect(loop.pool("mage", "energy")!.current).toBe(3);
  });
});

describe("initiative roster edits", () => {
  test("addParticipant and removeParticipant keep the active pointer stable", () => {
    const loop = createTurnLoop({ order: ["a", "b", "c"] });
    loop.advanceTurn();
    expect(loop.active()).toBe("b");
    loop.addParticipant("z", 0);
    expect(loop.active()).toBe("b");
    expect(loop.order()).toEqual(["z", "a", "b", "c"]);
    loop.removeParticipant("a");
    expect(loop.active()).toBe("b");
    expect(loop.order()).toEqual(["z", "b", "c"]);
  });

  test("removing the active participant does not skip a slot", () => {
    const loop = createTurnLoop({ order: ["a", "b", "c"] });
    loop.advanceTurn();
    loop.removeParticipant("b");
    expect(loop.active()).toBe("c");
  });
});

describe("turnLoop snapshot", () => {
  test("capture and restore round-trips state and pools", () => {
    const loop = createTurnLoop({ order: ["a", "b"], phases: ["main", "end"], pools: [{ id: "ap", max: 2 }] });
    loop.advanceTurn();
    loop.advancePhase();
    loop.spend("b", "ap");
    const snap = loop.capture();
    loop.advanceTurn();
    loop.spend("a", "ap", 2);
    loop.restore(snap);
    expect(loop.active()).toBe("b");
    expect(loop.phase()).toBe("end");
    expect(loop.pool("b", "ap")!.current).toBe(1);
    expect(loop.pool("a", "ap")!.current).toBe(2);
  });
});
