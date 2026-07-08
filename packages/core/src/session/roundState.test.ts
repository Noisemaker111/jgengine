import { describe, expect, test } from "bun:test";

import { createRoundState, lossBonusFor } from "./roundState";

function config(overrides: Partial<Parameters<typeof createRoundState>[0]> = {}) {
  return createRoundState({
    phases: { buy: 2, live: 5, end: 3 },
    teams: ["t1", "t2"],
    winReward: 3000,
    lossBonus: { base: 1400, step: 500, max: 3400 },
    ...overrides,
  });
}

describe("round state machine", () => {
  test("buy → live transition fires on the timer", () => {
    const round = config();
    expect(round.phase()).toBe("buy");
    const events = round.tick(2);
    expect(events.map((e) => e.kind)).toEqual(["phase.end", "phase.start"]);
    expect(round.phase()).toBe("live");
    expect(round.timeLeft()).toBeCloseTo(5, 5);
  });

  test("concludeRound records the win, pays economy, and enters end", () => {
    const round = config();
    round.tick(2);
    const events = round.concludeRound("t1");
    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual(["round.win", "round.economy", "phase.end", "phase.start"]);
    expect(round.score("t1")).toBe(1);
    expect(round.phase()).toBe("end");
    const economy = events.find((e) => e.kind === "round.economy")!.economy!;
    expect(economy.find((r) => r.team === "t1")).toEqual({ team: "t1", reward: 3000, won: true, lossStreak: 0 });
    expect(economy.find((r) => r.team === "t2")).toEqual({ team: "t2", reward: 1400, won: false, lossStreak: 0 });
  });

  test("loss bonus escalates with the loss streak", () => {
    const round = config();
    round.tick(2);
    round.concludeRound("t1");
    round.tick(3);
    round.tick(2);
    const events = round.concludeRound("t1");
    const economy = events.find((e) => e.kind === "round.economy")!.economy!;
    expect(economy.find((r) => r.team === "t2")!.reward).toBe(1900);
  });

  test("a live timeout advances to end without crediting a win", () => {
    const round = config();
    round.tick(2);
    const events = round.tick(5);
    expect(round.phase()).toBe("end");
    expect(round.score("t1")).toBe(0);
    expect(round.score("t2")).toBe(0);
    expect(events.some((e) => e.kind === "round.win")).toBe(false);
  });

  test("end phase rolls into the next round's buy phase", () => {
    const round = config();
    round.tick(2);
    round.concludeRound("t1");
    expect(round.round()).toBe(1);
    round.tick(3);
    expect(round.round()).toBe(2);
    expect(round.phase()).toBe("buy");
  });

  test("maxRounds ends the match", () => {
    const round = config({ maxRounds: 1 });
    round.tick(2);
    round.concludeRound("t1");
    const events = round.tick(3);
    expect(events.some((e) => e.kind === "match.end")).toBe(true);
    expect(round.snapshot().matchOver).toBe(true);
    expect(round.tick(10)).toEqual([]);
  });

  test("onPhaseEnd hooks fire with the ending and next phase", () => {
    const round = config();
    const seen: string[] = [];
    round.onPhaseEnd((ending, next) => seen.push(`${ending}->${next}`));
    round.tick(2);
    expect(seen).toEqual(["buy->live"]);
  });

  test("lossBonusFor clamps to the max", () => {
    const rule = { base: 1400, step: 500, max: 3400 };
    expect(lossBonusFor(rule, 0)).toBe(1400);
    expect(lossBonusFor(rule, 4)).toBe(3400);
    expect(lossBonusFor(undefined, 3)).toBe(0);
  });

  test("team roles are retrievable and default string teams have no role", () => {
    const round = config({ teams: [{ id: "t1", role: "attack" }, { id: "t2", role: "defend" }] });
    expect(round.roleOf("t1")).toBe("attack");
    expect(round.roleOf("t2")).toBe("defend");
    expect(round.roleOf("nope")).toBeUndefined();

    const plain = config();
    expect(plain.roleOf("t1")).toBeUndefined();
  });

  test("custom phaseOrder cycles through extra phases and only settles on the last one", () => {
    const round = createRoundState({
      phases: { prep: 1, live: 2, overtime: 1, end: 1 },
      teams: ["t1", "t2"],
      phaseOrder: ["prep", "live", "overtime", "end"],
    });
    expect(round.phase()).toBe("prep");
    expect(round.concludeRound("t1")).toEqual([]);

    round.tick(1);
    expect(round.phase()).toBe("live");

    const liveConclude = round.concludeRound("t1");
    expect(liveConclude.map((e) => e.kind)).toEqual(["round.win", "round.economy", "phase.end", "phase.start"]);
    expect(round.phase()).toBe("overtime");
    expect(round.round()).toBe(1);
    expect(round.score("t1")).toBe(1);

    const overtimeConclude = round.concludeRound("t1");
    expect(overtimeConclude.map((e) => e.kind)).toEqual(["round.win", "round.economy", "phase.end", "phase.start"]);
    expect(round.phase()).toBe("end");
    expect(round.round()).toBe(1);
    expect(round.score("t1")).toBe(2);

    expect(round.concludeRound("t1")).toEqual([]);
    round.tick(1);
    expect(round.phase()).toBe("prep");
    expect(round.round()).toBe(2);
  });

  test("winCondition auto-concludes the round via evaluate", () => {
    const round = config({
      winCondition: (state) => (state.scores["t1"]! >= 0 && state.phase === "live" ? "t1" : null),
    });
    round.tick(2);
    expect(round.phase()).toBe("live");
    const events = round.evaluate();
    expect(events.map((e) => e.kind)).toEqual(["round.win", "round.economy", "phase.end", "phase.start"]);
    expect(round.phase()).toBe("end");
    expect(round.score("t1")).toBe(1);
  });

  test("evaluate is a no-op without a configured winCondition", () => {
    const round = config();
    round.tick(2);
    expect(round.evaluate()).toEqual([]);
    expect(round.phase()).toBe("live");
  });
});
