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
    { id: "first", cost: { seal: 1, sigil: 1 }, requirement: levelAtLeast(30) },
    { id: "second", cost: { seal: 1, sigil: 1, shard: 5 }, requirement: levelAtLeast(50) },
  ],
  portalSeconds: 25,
  partyCaps: { lead: 2, escort: 2 },
  lead: "lead",
  victorySeconds: 60,
};

function bag(items: Record<string, number>) {
  const held = { ...items };
  return { held, count: (item: string) => held[item] ?? 0, take: (item: string, count: number) => void (held[item] = (held[item] ?? 0) - count) };
}

const AT = [10, 2, 20] as const;
const me: SummonCandidate = { id: "me", kind: "lead", at: AT };

describe("summoned encounter", () => {
  test("a short cost or requirement summons nothing and takes nothing", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    const items = bag({ seal: 1 });
    const result = encounter.summon("first", items, { level: 40 }, 0);
    expect(result).toEqual({ ok: false, reason: "requirement", check: { ok: false, missing: [{ item: "sigil", need: 1, have: 0 }], requirementMet: true } });
    expect(items.held).toEqual({ seal: 1 });
    expect(encounter.check("first", bag({ seal: 1, sigil: 1 }).count, { level: 25 })).toEqual({ ok: false, missing: [], requirementMet: false });
    expect(encounter.state().phase).toBe("idle");
  });

  test("the portal takes the cost, counts down, then takes everyone in range up to each kind's cap", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    const items = bag({ seal: 2, sigil: 1 });
    expect(encounter.summon("first", items, { level: 30 }, 100)).toEqual({ ok: true });
    expect(items.held).toEqual({ seal: 1, sigil: 0 });
    expect(encounter.summon("first", bag({ seal: 1, sigil: 1 }), { level: 30 }, 101).ok).toBe(false);
    const hooks = {
      targetAlive: () => true,
      gather: () => [
        me,
        { id: "friend", kind: "lead", at: AT },
        { id: "third", kind: "lead", at: AT },
        { id: "escort-a", kind: "escort", at: AT },
        { id: "escort-b", kind: "escort", at: AT },
        { id: "escort-c", kind: "escort", at: AT },
      ] satisfies SummonCandidate[],
    };
    expect(encounter.tick(124, hooks)).toEqual([]);
    expect(encounter.secondsLeft(124)).toBe(1);
    const [entered] = encounter.tick(125, hooks);
    expect(entered).toMatchObject({ type: "entered", tier: "first", refused: [{ id: "third", reason: "full" }, { id: "escort-c", reason: "full" }] });
    expect(encounter.state()).toMatchObject({ phase: "fight", party: { lead: ["me", "friend"], escort: ["escort-a", "escort-b"] } });
    expect(encounter.inside("escort-a")).toBe(true);
    expect(encounter.inside("escort-c")).toBe(false);
  });

  test("a kind left out of the caps is never taken", () => {
    const encounter = createSummonedEncounter<SummonCandidate>({ ...OPTIONS, partyCaps: { lead: 2 } });
    encounter.summon("first", bag({ seal: 1, sigil: 1 }), { level: 30 }, 0);
    const [entered] = encounter.tick(25, { targetAlive: () => true, gather: () => [me, { id: "escort-a", kind: "escort", at: AT }] });
    expect(entered).toMatchObject({ type: "entered", refused: [{ id: "escort-a", reason: "full" }] });
    expect(encounter.state().party["escort"]).toBeUndefined();
  });

  test("a portal with no lead in range closes and the cost is spent", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("first", bag({ seal: 1, sigil: 1 }), { level: 30 }, 0);
    expect(encounter.tick(25, { targetAlive: () => true, gather: () => [{ id: "escort-a", kind: "escort", at: AT }] })).toEqual([{ type: "closed", tier: "first" }]);
    expect(encounter.state().phase).toBe("idle");
  });

  test("a win holds the winners a minute, then sends each back where they stood", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("first", bag({ seal: 1, sigil: 1 }), { level: 30 }, 0);
    let alive = true;
    const hooks = { targetAlive: () => alive, gather: () => [me, { id: "escort-a", kind: "escort" as const, at: [1, 1, 1] as const }] };
    encounter.tick(25, hooks);
    expect(encounter.tick(40, hooks)).toEqual([]);
    alive = false;
    expect(encounter.tick(41, hooks)).toEqual([{ type: "won", tier: "first", party: { lead: ["me"], escort: ["escort-a"] } }]);
    expect(encounter.secondsLeft(41)).toBe(60);
    expect(encounter.tick(100, hooks)).toEqual([]);
    expect(encounter.tick(101, hooks)).toEqual([{ type: "returned", tier: "first", returns: [{ id: "me", kind: "lead", to: AT }, { id: "escort-a", kind: "escort", to: [1, 1, 1] }] }]);
    expect(encounter.state().phase).toBe("idle");
  });

  test("when the last lead falls the fight is lost with the party inside", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("first", bag({ seal: 1, sigil: 1 }), { level: 30 }, 0);
    const hooks = { targetAlive: () => true, gather: () => [me, { id: "escort-a", kind: "escort" as const, at: AT }] };
    encounter.tick(25, hooks);
    encounter.leave("me");
    expect(encounter.tick(26, hooks)).toEqual([{ type: "lost", tier: "first", reason: "wiped", party: { lead: [], escort: ["escort-a"] } }]);
  });

  test("a time limit loses an unfinished fight", () => {
    const encounter = createSummonedEncounter<SummonCandidate>({ ...OPTIONS, timeLimitSeconds: 600 });
    encounter.summon("first", bag({ seal: 1, sigil: 1 }), { level: 30 }, 0);
    const hooks = { targetAlive: () => true, gather: () => [me] };
    encounter.tick(25, hooks);
    expect(encounter.secondsLeft(325)).toBe(300);
    expect(encounter.tick(625, hooks)).toEqual([{ type: "lost", tier: "first", reason: "time", party: { lead: ["me"] } }]);
  });

  test("a saved fight resumes where it stood", () => {
    const encounter = createSummonedEncounter<SummonCandidate>(OPTIONS);
    encounter.summon("first", bag({ seal: 1, sigil: 1 }), { level: 30 }, 0);
    encounter.tick(25, { targetAlive: () => true, gather: () => [me] });
    const saved = encounter.snapshot();
    const again = createSummonedEncounter<SummonCandidate>(OPTIONS);
    again.restore(saved);
    expect(again.inside("me")).toBe(true);
    expect(again.tick(30, { targetAlive: () => false, gather: () => [] })[0]?.type).toBe("won");
  });
});
