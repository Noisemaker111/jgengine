import { describe, expect, test } from "bun:test";

import type { Predicate } from "../rules/predicate";
import {
  createSummonedEncounter,
  type SummonCandidate,
  type SummonedEncounterOptions,
} from "./summonedEncounter";

const levelAtLeast = (level: number): Predicate => ({ gte: ["level", level] });

const OPTIONS: SummonedEncounterOptions = {
  tiers: [
    { id: "gamma", at: 0, cost: { clever: 1, hunter: 1 }, requirement: levelAtLeast(30) },
    { id: "beta", at: 1, cost: { clever: 1, hunter: 1, talon: 5 }, requirement: levelAtLeast(50) },
  ],
  portalSeconds: 25,
  partyCaps: { survivor: 2, companion: 2 },
  lead: "survivor",
  victorySeconds: 60,
};

function bag(items: Record<string, number>) {
  const held = { ...items };
  return { held, count: (item: string) => held[item] ?? 0, take: (item: string, count: number) => void (held[item] = (held[item] ?? 0) - count) };
}

const AT = [10, 2, 20] as const;
const me: SummonCandidate = { id: "me", kind: "survivor", at: AT };

describe("summoned encounter", () => {
  test("a short cost or requirement summons nothing and takes nothing", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    const items = bag({ clever: 1 });
    const result = encounter.summon("gamma", items, { level: 40 }, 0);
    expect(result).toEqual({ ok: false, reason: "requirement", check: { ok: false, missing: [{ item: "hunter", need: 1, have: 0 }], requirementMet: true } });
    expect(items.held).toEqual({ clever: 1 });
    expect(encounter.check("gamma", bag({ clever: 1, hunter: 1 }).count, { level: 25 })).toEqual({ ok: false, missing: [], requirementMet: false });
    expect(encounter.state().phase).toBe("idle");
  });

  test("the portal takes the cost, counts down, then takes everyone in range up to each kind's cap", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    const items = bag({ clever: 2, hunter: 1 });
    expect(encounter.summon("gamma", items, { level: 30 }, 100)).toEqual({ ok: true });
    expect(items.held).toEqual({ clever: 1, hunter: 0 });
    expect(encounter.summon("gamma", bag({ clever: 1, hunter: 1 }), { level: 30 }, 101).ok).toBe(false);
    const hooks = {
      targetAlive: () => true,
      gather: () => [
        me,
        { id: "friend", kind: "survivor", at: AT },
        { id: "third", kind: "survivor", at: AT },
        { id: "rex", kind: "companion", at: AT },
        { id: "raptor", kind: "companion", at: AT },
        { id: "wolf", kind: "companion", at: AT },
      ] satisfies SummonCandidate[],
    };
    expect(encounter.tick(124, hooks)).toEqual([]);
    expect(encounter.secondsLeft(124)).toBe(1);
    const [entered] = encounter.tick(125, hooks);
    expect(entered).toMatchObject({ type: "entered", tier: "gamma", refused: [{ id: "third", reason: "full" }, { id: "wolf", reason: "full" }] });
    expect(encounter.state()).toMatchObject({ phase: "fight", party: { survivor: ["me", "friend"], companion: ["rex", "raptor"] } });
    expect(encounter.inside("rex")).toBe(true);
    expect(encounter.inside("wolf")).toBe(false);
  });

  test("a kind left out of the caps is never taken", () => {
    const encounter = createSummonedEncounter<SummonCandidate>({ ...OPTIONS, partyCaps: { survivor: 2 } });
    encounter.summon("gamma", bag({ clever: 1, hunter: 1 }), { level: 30 }, 0);
    const [entered] = encounter.tick(25, { targetAlive: () => true, gather: () => [me, { id: "rex", kind: "companion", at: AT }] });
    expect(entered).toMatchObject({ type: "entered", refused: [{ id: "rex", reason: "full" }] });
    expect(encounter.state().party["companion"]).toBeUndefined();
  });

  test("a portal with no lead in range closes and the cost is spent", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("gamma", bag({ clever: 1, hunter: 1 }), { level: 30 }, 0);
    expect(encounter.tick(25, { targetAlive: () => true, gather: () => [{ id: "rex", kind: "companion", at: AT }] })).toEqual([{ type: "closed", tier: "gamma" }]);
    expect(encounter.state().phase).toBe("idle");
  });

  test("a win holds the winners a minute, then sends each back where they stood", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("gamma", bag({ clever: 1, hunter: 1 }), { level: 30 }, 0);
    let alive = true;
    const hooks = { targetAlive: () => alive, gather: () => [me, { id: "rex", kind: "companion" as const, at: [1, 1, 1] as const }] };
    encounter.tick(25, hooks);
    expect(encounter.tick(40, hooks)).toEqual([]);
    alive = false;
    expect(encounter.tick(41, hooks)).toEqual([{ type: "won", tier: "gamma", party: { survivor: ["me"], companion: ["rex"] } }]);
    expect(encounter.secondsLeft(41)).toBe(60);
    expect(encounter.tick(100, hooks)).toEqual([]);
    expect(encounter.tick(101, hooks)).toEqual([{ type: "returned", tier: "gamma", returns: [{ id: "me", kind: "survivor", to: AT }, { id: "rex", kind: "companion", to: [1, 1, 1] }] }]);
    expect(encounter.state().phase).toBe("idle");
  });

  test("when the last lead falls the fight is lost with the party inside", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("gamma", bag({ clever: 1, hunter: 1 }), { level: 30 }, 0);
    const hooks = { targetAlive: () => true, gather: () => [me, { id: "rex", kind: "companion" as const, at: AT }] };
    encounter.tick(25, hooks);
    encounter.leave("me");
    expect(encounter.tick(26, hooks)).toEqual([{ type: "lost", tier: "gamma", reason: "wiped", party: { survivor: [], companion: ["rex"] } }]);
  });

  test("a time limit loses an unfinished fight", () => {
    const encounter = createSummonedEncounter<SummonCandidate>({ ...OPTIONS, timeLimitSeconds: 600 });
    encounter.summon("gamma", bag({ clever: 1, hunter: 1 }), { level: 30 }, 0);
    const hooks = { targetAlive: () => true, gather: () => [me] };
    encounter.tick(25, hooks);
    expect(encounter.secondsLeft(325)).toBe(300);
    expect(encounter.tick(625, hooks)).toEqual([{ type: "lost", tier: "gamma", reason: "time", party: { survivor: ["me"] } }]);
  });

  test("a saved fight resumes where it stood", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("gamma", bag({ clever: 1, hunter: 1 }), { level: 30 }, 0);
    encounter.tick(25, { targetAlive: () => true, gather: () => [me] });
    const saved = encounter.snapshot();
    const again = createSummonedEncounter<SummonCandidate>(OPTIONS);
    again.restore(saved);
    expect(again.inside("me")).toBe(true);
    expect(again.tick(30, { targetAlive: () => false, gather: () => [] })[0]?.type).toBe("won");
  });
});
