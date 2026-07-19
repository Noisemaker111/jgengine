import { describe, expect, test } from "bun:test";

import {
  DIFFICULTY_TIERS,
  advanceReactionGate,
  createReactionGate,
  difficultyProfile,
  executionError,
  pickScored,
  planLookahead,
  shouldUseAbility,
  type DifficultyProfile,
  type LookaheadDomain,
  type ScoredOption,
} from "./difficulty";

const rngOf = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

const exact = (overrides: Partial<DifficultyProfile>): DifficultyProfile =>
  difficultyProfile("expert", { decisionNoise: 0, executionJitter: 0, ...overrides });

describe("tiers and profiles", () => {
  test("tiers are ordered from sloppy to sharp", () => {
    const { easy, standard, expert } = DIFFICULTY_TIERS;
    expect(easy.reactionSeconds).toBeGreaterThan(standard.reactionSeconds);
    expect(standard.reactionSeconds).toBeGreaterThan(expert.reactionSeconds);
    expect(easy.decisionNoise).toBeGreaterThan(standard.decisionNoise);
    expect(expert.decisionNoise).toBe(0);
    expect(easy.planDepth).toBeLessThan(standard.planDepth);
    expect(standard.planDepth).toBeLessThan(expert.planDepth);
    expect(easy.abilityDiscipline).toBeLessThan(expert.abilityDiscipline);
    expect(easy.perceptionScale).toBeLessThan(expert.perceptionScale);
  });

  test("difficultyProfile copies a tier and applies overrides without mutating the canon", () => {
    const boss = difficultyProfile("easy", { reactionSeconds: 0.2 });
    expect(boss.reactionSeconds).toBe(0.2);
    expect(boss.decisionNoise).toBe(DIFFICULTY_TIERS.easy.decisionNoise);
    expect(DIFFICULTY_TIERS.easy.reactionSeconds).toBe(0.9);
    expect(() => {
      (DIFFICULTY_TIERS.easy as DifficultyProfile).reactionSeconds = 0;
    }).toThrow();
  });
});

describe("reaction gate", () => {
  test("holds the committed value until the desired value has been stable for reactionSeconds", () => {
    const profile = exact({ reactionSeconds: 0.5 });
    const gate = createReactionGate<string | null>(null);
    expect(advanceReactionGate(gate, 0.1, "player", profile)).toBeNull();
    expect(advanceReactionGate(gate, 0.3, "player", profile)).toBeNull();
    expect(advanceReactionGate(gate, 0.1, "player", profile)).toBe("player");
    expect(gate.committed).toBe("player");
  });

  test("a flickering desired value restarts the delay", () => {
    const profile = exact({ reactionSeconds: 0.5 });
    const gate = createReactionGate<string>("a");
    advanceReactionGate(gate, 0.4, "b", profile);
    advanceReactionGate(gate, 0.4, "c", profile);
    expect(gate.committed).toBe("a");
    expect(advanceReactionGate(gate, 0.1, "c", profile)).toBe("c");
  });

  test("returning to the committed value cancels the pending switch", () => {
    const profile = exact({ reactionSeconds: 0.5 });
    const gate = createReactionGate<string>("a");
    advanceReactionGate(gate, 0.4, "b", profile);
    expect(advanceReactionGate(gate, 0.4, "a", profile)).toBe("a");
    expect(gate.pendingSeconds).toBe(0);
  });

  test("zero reaction time commits immediately", () => {
    const gate = createReactionGate<string>("a");
    expect(advanceReactionGate(gate, 0, "b", exact({ reactionSeconds: 0 }))).toBe("b");
  });
});

describe("pickScored", () => {
  const options: ScoredOption<string>[] = [
    { option: "weak", score: 1 },
    { option: "best", score: 9 },
    { option: "mid", score: 5 },
  ];

  test("zero noise always takes the best score", () => {
    const profile = exact({});
    for (const roll of [0, 0.5, 0.999]) {
      expect(pickScored(options, profile, rngOf(roll))).toBe("best");
    }
  });

  test("noise sometimes blunders into a uniform pick", () => {
    const profile = exact({ decisionNoise: 0.35 });
    expect(pickScored(options, profile, rngOf(0.1, 0.99))).toBe("mid");
    expect(pickScored(options, profile, rngOf(0.1, 0))).toBe("weak");
    expect(pickScored(options, profile, rngOf(0.9))).toBe("best");
  });

  test("empty list returns null", () => {
    expect(pickScored([], exact({}), rngOf(0))).toBeNull();
  });
});

describe("executionError", () => {
  test("zero jitter is exactly zero without consuming rng", () => {
    expect(
      executionError(exact({}), () => {
        throw new Error("rng must not be drawn");
      }),
    ).toBe(0);
  });

  test("error is symmetric and scaled", () => {
    const profile = exact({ executionJitter: 0.5 });
    expect(executionError(profile, rngOf(1), 2)).toBeCloseTo(1);
    expect(executionError(profile, rngOf(0), 2)).toBeCloseTo(-1);
    expect(executionError(profile, rngOf(0.5), 2)).toBeCloseTo(0);
  });
});

describe("shouldUseAbility", () => {
  test("disciplined profile fires only on strong windows", () => {
    const profile = exact({ abilityDiscipline: 0.85 });
    expect(shouldUseAbility(0.9, profile, rngOf(0.5))).toBe(true);
    expect(shouldUseAbility(0.5, profile, rngOf(0.5))).toBe(false);
  });

  test("sloppy profile wastes cooldowns and sometimes sits on perfect windows", () => {
    const profile = exact({ abilityDiscipline: 0.2, decisionNoise: 0.35 });
    expect(shouldUseAbility(0.1, profile, rngOf(1))).toBe(true);
    expect(shouldUseAbility(0.5, profile, rngOf(0))).toBe(false);
  });
});

describe("planLookahead", () => {
  // A tiny adversarial bait: "grab" scores best now but hands the opponent a winning reply;
  // "solid" scores worse immediately and is safe. Greedy (depth 1) takes the bait, depth ≥ 2
  // sees the refutation.
  type State = "root" | "afterGrab" | "afterSolid" | "punished" | "quiet";
  const bait: LookaheadDomain<State, string> = {
    moves(state) {
      if (state === "root") {
        return [
          { option: "grab", score: 5 },
          { option: "solid", score: 2 },
        ];
      }
      if (state === "afterGrab") return [{ option: "punish", score: 9 }];
      if (state === "afterSolid") return [{ option: "shuffle", score: 1 }];
      return [];
    },
    apply(state, move) {
      if (state === "root") return move === "grab" ? "afterGrab" : "afterSolid";
      return move === "punish" ? "punished" : "quiet";
    },
    evaluate(state) {
      // Static, material-style eval from the player to move: it sees the grabbed material
      // (afterGrab is -5 for the opponent) but not the tactic — only search finds "punish".
      if (state === "afterGrab") return -5;
      if (state === "afterSolid") return -1;
      if (state === "punished") return -9;
      if (state === "quiet") return 1;
      return 0;
    },
  };

  test("greedy depth falls for the bait; deeper search refuses it", () => {
    expect(planLookahead("root", bait, exact({ planDepth: 1, planWidth: 8 }), rngOf(0.9))).toBe(
      "grab",
    );
    expect(planLookahead("root", bait, exact({ planDepth: 2, planWidth: 8 }), rngOf(0.9))).toBe(
      "solid",
    );
  });

  test("planWidth bounds how many root moves are explored", () => {
    // Width 1 only explores the immediately-best move, so the safe reply is never even valued.
    expect(planLookahead("root", bait, exact({ planDepth: 2, planWidth: 1 }), rngOf(0.9))).toBe(
      "grab",
    );
  });

  test("decision noise can still blunder at the root", () => {
    const noisy = exact({ planDepth: 2, planWidth: 8, decisionNoise: 0.35 });
    expect(planLookahead("root", bait, noisy, rngOf(0.1, 0))).toBe("grab");
  });

  test("non-adversarial sequence planning keeps one perspective", () => {
    // Two-step corridor: "detour" looks worse now but leads to a high-value state for the
    // same agent; adversarial negation would wrongly flip that payoff.
    type Seq = "start" | "rush" | "detour" | "rushed" | "payoff";
    const corridor: LookaheadDomain<Seq, string> = {
      adversarial: false,
      moves(state) {
        if (state === "start") {
          return [
            { option: "rush", score: 3 },
            { option: "detour", score: 1 },
          ];
        }
        if (state === "rush") return [{ option: "finish", score: 1 }];
        if (state === "detour") return [{ option: "cash-in", score: 8 }];
        return [];
      },
      apply(state, move) {
        if (state === "start") return move === "rush" ? "rush" : "detour";
        return move === "cash-in" ? "payoff" : "rushed";
      },
      evaluate(state) {
        if (state === "payoff") return 10;
        if (state === "rushed") return 3;
        if (state === "rush") return 3;
        if (state === "detour") return 1;
        return 0;
      },
    };
    expect(
      planLookahead("start", corridor, exact({ planDepth: 2, planWidth: 8 }), rngOf(0.9)),
    ).toBe("detour");
    expect(
      planLookahead("start", corridor, exact({ planDepth: 1, planWidth: 8 }), rngOf(0.9)),
    ).toBe("rush");
  });

  test("bounded work: domain calls stay within width ** depth", () => {
    let moveCalls = 0;
    const wide: LookaheadDomain<number, number> = {
      moves(state) {
        moveCalls++;
        if (state >= 3) return [];
        const out: ScoredOption<number>[] = [];
        for (let i = 0; i < 10; i++) out.push({ option: i, score: i });
        return out;
      },
      apply: (state) => state + 1,
      evaluate: (state) => state,
    };
    planLookahead(0, wide, exact({ planDepth: 2, planWidth: 3 }), rngOf(0.9));
    // 1 root expansion + at most width children expanded one ply deeper.
    expect(moveCalls).toBeLessThanOrEqual(1 + 3);
  });

  test("no legal moves returns null", () => {
    expect(planLookahead("punished", bait, exact({}), rngOf(0))).toBeNull();
  });
});
