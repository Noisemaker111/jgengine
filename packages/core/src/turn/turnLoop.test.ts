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

describe("turnLoop lifecycle hooks", () => {
  type Event =
    | { kind: "turnEnd"; participant: string }
    | { kind: "roundStart"; round: number }
    | { kind: "turnStart"; participant: string }
    | { kind: "poolChange"; participant: string; poolId: string; current: number };

  function recorder() {
    const events: Event[] = [];
    return {
      events,
      hooks: {
        onTurnEnd: (participant: string) => events.push({ kind: "turnEnd", participant }),
        onRoundStart: (round: number) => events.push({ kind: "roundStart", round }),
        onTurnStart: (participant: string) => events.push({ kind: "turnStart", participant }),
        onPoolChange: (participant: string, pool: { id: string; current: number }) =>
          events.push({ kind: "poolChange", participant, poolId: pool.id, current: pool.current }),
      },
    };
  }

  test("first activation from activeIndex<0 fires onTurnStart with no preceding onTurnEnd", () => {
    const { events, hooks } = recorder();
    const loop = createTurnLoop({ order: ["a", "b"], hooks });
    loop.restore({ round: 1, order: ["a", "b"], activeIndex: -1, phaseIndex: 0, pools: {} });
    loop.advanceTurn();
    expect(events).toEqual([{ kind: "turnStart", participant: "a" }]);
  });

  test("advanceTurn fires onTurnEnd, then onRoundStart on wrap, then onTurnStart", () => {
    const { events, hooks } = recorder();
    const loop = createTurnLoop({ order: ["a", "b"], pools: [{ id: "ap", max: 1 }], hooks });
    loop.advanceTurn();
    events.length = 0;
    loop.advanceTurn();
    expect(events).toEqual([
      { kind: "turnEnd", participant: "b" },
      { kind: "roundStart", round: 2 },
      { kind: "poolChange", participant: "a", poolId: "ap", current: 1 },
      { kind: "turnStart", participant: "a" },
    ]);
  });

  test("advanceTurn without a wrap fires no onRoundStart", () => {
    const { events, hooks } = recorder();
    const loop = createTurnLoop({ order: ["a", "b", "c"], hooks });
    loop.advanceTurn();
    expect(events).toEqual([
      { kind: "turnEnd", participant: "a" },
      { kind: "turnStart", participant: "b" },
    ]);
  });

  test("advanceRound fires onTurnEnd, onRoundStart, pool resets, then onTurnStart", () => {
    const { events, hooks } = recorder();
    const loop = createTurnLoop({ order: ["a", "b"], pools: [{ id: "ap", max: 2 }], hooks });
    loop.spend("a", "ap");
    loop.advanceTurn();
    events.length = 0;
    loop.advanceRound();
    expect(events).toEqual([
      { kind: "turnEnd", participant: "b" },
      { kind: "roundStart", round: 2 },
      { kind: "poolChange", participant: "a", poolId: "ap", current: 2 },
      { kind: "poolChange", participant: "b", poolId: "ap", current: 2 },
      { kind: "turnStart", participant: "a" },
    ]);
  });

  test("onPoolChange fires for spend, gain, and refill", () => {
    const { events, hooks } = recorder();
    const loop = createTurnLoop({ order: ["a"], pools: [{ id: "hp", max: 10 }], hooks });
    events.length = 0;
    loop.spend("a", "hp", 3);
    loop.gain("a", "hp", 1);
    loop.refill("a", "hp");
    expect(events).toEqual([
      { kind: "poolChange", participant: "a", poolId: "hp", current: 7 },
      { kind: "poolChange", participant: "a", poolId: "hp", current: 8 },
      { kind: "poolChange", participant: "a", poolId: "hp", current: 10 },
    ]);
  });

  test("lazy ensurePools auto-vivification does not fire onPoolChange", () => {
    const { events, hooks } = recorder();
    const loop = createTurnLoop({ order: [], pools: [{ id: "hp", max: 10 }], hooks });
    loop.pool("ghost", "hp");
    expect(events).toEqual([]);
  });

  test("no hooks configured still works exactly as before", () => {
    const loop = createTurnLoop({ order: ["a", "b"], pools: [{ id: "ap", max: 1 }] });
    expect(loop.advanceTurn().active).toBe("b");
    expect(loop.spend("b", "ap")).toBe(true);
  });

  test("onChange fires on every state mutation and not on reads", () => {
    let changes = 0;
    const loop = createTurnLoop({
      order: ["a", "b"],
      phases: ["main", "end"],
      pools: [{ id: "ap", max: 2 }],
      hooks: { onChange: () => (changes += 1) },
    });
    expect(changes).toBe(0);
    loop.advancePhase();
    expect(changes).toBe(1);
    loop.advanceTurn();
    expect(changes).toBe(2);
    loop.spend("b", "ap");
    expect(changes).toBe(3);
    loop.spend("b", "ap", 5);
    expect(changes).toBe(3);
    loop.gain("b", "ap", 1);
    expect(changes).toBe(4);
    loop.refill("b");
    expect(changes).toBe(5);
    loop.addParticipant("c");
    expect(changes).toBe(6);
    loop.removeParticipant("c");
    expect(changes).toBe(7);
    loop.setOrder(["b", "a"], true);
    expect(changes).toBe(8);
    const snap = loop.capture();
    expect(changes).toBe(8);
    loop.restore(snap);
    expect(changes).toBe(9);
    loop.state();
    loop.pools("a");
    loop.pool("a", "ap");
    loop.canSpend("a", "ap");
    expect(changes).toBe(9);
    loop.advanceRound();
    expect(changes).toBe(10);
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
