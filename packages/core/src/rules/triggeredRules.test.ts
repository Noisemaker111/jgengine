import { afterEach, describe, expect, test } from "bun:test";
import {
  createTriggeredRuleEngine,
  type RuleFiring,
  type TriggeredRule,
} from "@jgengine/core/rules/triggeredRules";
import {
  clearRuleEffects,
  getRuleEffect,
  listRuleEffects,
  registerRuleEffect,
} from "@jgengine/core/rules/ruleEffects";

function applied(firings: readonly RuleFiring[]): RuleFiring[] {
  return firings.filter((firing) => firing.blocked === undefined);
}

describe("triggered rule matching and target resolution", () => {
  test("only rules subscribed to the event type are evaluated", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", effect: { id: "burn" } },
      { id: "b", event: "kill", effect: { id: "heal" } },
    ]);
    const firings = engine.dispatch({ type: "hit", subject: "enemy1" }, 0);
    expect(firings).toHaveLength(1);
    expect(firings[0]!.ruleId).toBe("a");
    expect(firings[0]!.target).toBe("enemy1");
  });

  test("predicate gates the firing and reports why it was blocked", () => {
    const engine = createTriggeredRuleEngine([
      { id: "crit-burn", event: "hit", when: { eq: ["crit", true] }, effect: { id: "burn" } },
    ]);
    const miss = engine.dispatch({ type: "hit", subject: "e", facts: { crit: false } }, 0);
    expect(miss[0]!.blocked).toBe("predicate");
    const hit = engine.dispatch({ type: "hit", subject: "e", facts: { crit: true } }, 0);
    expect(hit[0]!.blocked).toBeUndefined();
  });

  test("target selectors resolve role, path, and literal", () => {
    const engine = createTriggeredRuleEngine([
      { id: "obj", event: "hit", target: { role: "object" }, effect: { id: "x" } },
      { id: "own", event: "hit", owner: "sword1", target: { role: "owner" }, effect: { id: "x" } },
      { id: "path", event: "hit", target: { path: "victim" }, effect: { id: "x" } },
      { id: "lit", event: "hit", target: { literal: "boss" }, effect: { id: "x" } },
    ]);
    const firings = engine.dispatch(
      { type: "hit", subject: "s", object: "o", facts: { victim: "v" } },
      0,
    );
    const byId = Object.fromEntries(firings.map((f) => [f.ruleId, f.target]));
    expect(byId).toEqual({ obj: "o", own: "sword1", path: "v", lit: "boss" });
  });

  test("an unresolvable target blocks with no-target", () => {
    const engine = createTriggeredRuleEngine([{ id: "a", event: "hit", effect: { id: "x" } }]);
    expect(engine.dispatch({ type: "hit" }, 0)[0]!.blocked).toBe("no-target");
  });

  test("firing carries provenance", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", owner: "ring1", effect: { id: "burn", params: { power: 3 } } },
    ]);
    const firing = engine.dispatch({ type: "hit", subject: "e" }, 120)[0]!;
    expect(firing).toMatchObject({
      ruleId: "a",
      event: "hit",
      owner: "ring1",
      target: "e",
      effect: { id: "burn", params: { power: 3 } },
      at: 120,
    });
  });
});

describe("gating: cooldown, rate limit, charges", () => {
  test("cooldown blocks re-fire within the window, per target", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", cooldownMs: 1000, effect: { id: "x" } },
    ]);
    expect(engine.dispatch({ type: "hit", subject: "e1" }, 0)[0]!.blocked).toBeUndefined();
    expect(engine.dispatch({ type: "hit", subject: "e1" }, 500)[0]!.blocked).toBe("cooldown");
    // different target is independent
    expect(engine.dispatch({ type: "hit", subject: "e2" }, 500)[0]!.blocked).toBeUndefined();
    // window elapsed
    expect(engine.dispatch({ type: "hit", subject: "e1" }, 1000)[0]!.blocked).toBeUndefined();
  });

  test("rate limit caps fires within a sliding window across targets", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", rateLimit: { count: 2, windowMs: 1000 }, effect: { id: "x" } },
    ]);
    expect(engine.dispatch({ type: "hit", subject: "e1" }, 0)[0]!.blocked).toBeUndefined();
    expect(engine.dispatch({ type: "hit", subject: "e2" }, 100)[0]!.blocked).toBeUndefined();
    expect(engine.dispatch({ type: "hit", subject: "e3" }, 200)[0]!.blocked).toBe("rate-limit");
    // first fire ages out of the window
    expect(engine.dispatch({ type: "hit", subject: "e4" }, 1100)[0]!.blocked).toBeUndefined();
  });

  test("charges spend down and then block", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", charges: 2, effect: { id: "x" } },
    ]);
    expect(engine.dispatch({ type: "hit", subject: "e" }, 0)[0]!.blocked).toBeUndefined();
    expect(engine.dispatch({ type: "hit", subject: "e" }, 1)[0]!.blocked).toBeUndefined();
    expect(engine.dispatch({ type: "hit", subject: "e" }, 2)[0]!.blocked).toBe("no-charges");
  });
});

describe("effect lifetimes", () => {
  test("timed effects become active and expire on tick", () => {
    const engine = createTriggeredRuleEngine([
      { id: "poison", event: "hit", durationMs: 3000, effect: { id: "poison" } },
    ]);
    const firing = engine.dispatch({ type: "hit", subject: "e" }, 0)[0]!;
    expect(firing.instanceId).toBeDefined();
    expect(firing.stacks).toBe(1);
    expect(engine.active()).toHaveLength(1);
    expect(engine.activeFor("e")).toHaveLength(1);

    expect(engine.tick(2999)).toHaveLength(0);
    expect(engine.active()).toHaveLength(1);
    const expired = engine.tick(3000);
    expect(expired.map((e) => e.instanceId)).toEqual([firing.instanceId!]);
    expect(engine.active()).toHaveLength(0);
  });

  test("instantaneous effects keep no active instance", () => {
    const engine = createTriggeredRuleEngine([{ id: "a", event: "hit", effect: { id: "spark" } }]);
    const firing = engine.dispatch({ type: "hit", subject: "e" }, 0)[0]!;
    expect(firing.instanceId).toBeUndefined();
    expect(engine.active()).toHaveLength(0);
  });
});

describe("stacking policies", () => {
  function fireTwice(stacking: TriggeredRule["stacking"], maxStacks?: number) {
    const engine = createTriggeredRuleEngine([
      { id: "s", event: "hit", durationMs: 1000, stacking, maxStacks, effect: { id: "dot" } },
    ]);
    const first = engine.dispatch({ type: "hit", subject: "e" }, 0)[0]!;
    const second = engine.dispatch({ type: "hit", subject: "e" }, 400)[0]!;
    return { engine, first, second };
  }

  test("refresh keeps one instance and re-arms the timer at one stack", () => {
    const { engine, first, second } = fireTwice("refresh");
    expect(engine.active()).toHaveLength(1);
    expect(second.instanceId).toBe(first.instanceId!);
    expect(second.stacks).toBe(1);
    // re-armed to 400 + 1000; original would have died at 1000
    expect(engine.tick(1000)).toHaveLength(0);
    expect(engine.tick(1400)).toHaveLength(1);
  });

  test("stack adds stacks up to the cap and re-arms", () => {
    const { engine, second } = fireTwice("stack", 3);
    expect(engine.active()).toHaveLength(1);
    expect(second.stacks).toBe(2);
    const third = engine.dispatch({ type: "hit", subject: "e" }, 500)[0]!;
    const fourth = engine.dispatch({ type: "hit", subject: "e" }, 600)[0]!;
    expect(third.stacks).toBe(3);
    expect(fourth.stacks).toBe(3); // capped
  });

  test("independent spawns a separate instance per application", () => {
    const { engine, first, second } = fireTwice("independent");
    expect(engine.active()).toHaveLength(2);
    expect(second.instanceId).not.toBe(first.instanceId!);
    // they expire on their own timelines
    expect(engine.tick(1000)).toHaveLength(1);
    expect(engine.tick(1400)).toHaveLength(1);
  });

  test("ignore drops the new application while one is live", () => {
    const { engine, second } = fireTwice("ignore");
    expect(second.blocked).toBe("stack-ignored");
    expect(engine.active()).toHaveLength(1);
  });
});

describe("cleanup", () => {
  test("remove drops the rule and its active effects", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", durationMs: 1000, effect: { id: "x" } },
    ]);
    engine.dispatch({ type: "hit", subject: "e" }, 0);
    engine.remove("a");
    expect(engine.rules()).toHaveLength(0);
    expect(engine.active()).toHaveLength(0);
    expect(engine.dispatch({ type: "hit", subject: "e" }, 1)).toHaveLength(0);
  });

  test("removeByOwner clears an owner's rules and active effects (unequip)", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", owner: "sword1", durationMs: 1000, effect: { id: "x" } },
      { id: "b", event: "hit", owner: "boots1", durationMs: 1000, effect: { id: "y" } },
    ]);
    engine.dispatch({ type: "hit", subject: "e" }, 0);
    expect(engine.active()).toHaveLength(2);
    engine.removeByOwner("sword1");
    expect(engine.rules().map((r) => r.id)).toEqual(["b"]);
    expect(engine.active().map((a) => a.effectId)).toEqual(["y"]);
  });

  test("reset clears gate state and active effects but keeps rules (respec)", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", charges: 1, durationMs: 1000, effect: { id: "x" } },
    ]);
    engine.dispatch({ type: "hit", subject: "e" }, 0);
    expect(engine.dispatch({ type: "hit", subject: "e" }, 1)[0]!.blocked).toBe("no-charges");
    engine.reset();
    expect(engine.active()).toHaveLength(0);
    expect(engine.rules()).toHaveLength(1);
    expect(engine.dispatch({ type: "hit", subject: "e" }, 2)[0]!.blocked).toBeUndefined();
  });

  test("clearActive drops timed effects but keeps rules and gate state", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", cooldownMs: 1000, durationMs: 1000, effect: { id: "x" } },
    ]);
    engine.dispatch({ type: "hit", subject: "e" }, 0);
    engine.clearActive();
    expect(engine.active()).toHaveLength(0);
    expect(engine.dispatch({ type: "hit", subject: "e" }, 1)[0]!.blocked).toBe("cooldown");
  });
});

describe("serialization", () => {
  test("snapshot/hydrate round-trips rules, gate state, and active effects through JSON", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", cooldownMs: 1000, charges: 3, durationMs: 5000, stacking: "stack", maxStacks: 4, effect: { id: "dot", params: { power: 2 } } },
    ]);
    engine.dispatch({ type: "hit", subject: "e" }, 100);
    engine.dispatch({ type: "hit", subject: "e" }, 1200);
    const snapshot = JSON.parse(JSON.stringify(engine.snapshot()));

    const restored = createTriggeredRuleEngine();
    restored.hydrate(snapshot);
    expect(restored.rules()).toEqual(engine.rules());
    expect(restored.active()).toEqual(engine.active());
    // cooldown state survived: a fire at 1500 is still within the 1000ms window of the 1200 fire
    expect(restored.dispatch({ type: "hit", subject: "e" }, 1500)[0]!.blocked).toBe("cooldown");
    // stacks and expiry survived: the live instance carries 2 stacks
    expect(restored.activeFor("e")[0]!.stacks).toBe(2);
    // charges survived: 1 charge left after two fires
    expect(restored.dispatch({ type: "hit", subject: "e" }, 3000)[0]!.blocked).toBeUndefined();
    expect(restored.dispatch({ type: "hit", subject: "e" }, 6000)[0]!.blocked).toBe("no-charges");
  });

  test("hydrated instance ids do not collide with new ones", () => {
    const engine = createTriggeredRuleEngine([
      { id: "a", event: "hit", durationMs: 1000, stacking: "independent", effect: { id: "x" } },
    ]);
    engine.dispatch({ type: "hit", subject: "e" }, 0);
    const restored = createTriggeredRuleEngine();
    restored.hydrate(engine.snapshot());
    const next = restored.dispatch({ type: "hit", subject: "e" }, 10)[0]!;
    const ids = restored.active().map((a) => a.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(next.instanceId!);
  });
});

describe("rule effect registry seam", () => {
  afterEach(() => clearRuleEffects());

  test("declared effects are retrievable and listable", () => {
    registerRuleEffect({ id: "burn", label: "Burning", defaults: { power: 1 } });
    registerRuleEffect({ id: "chill" });
    expect(getRuleEffect("burn")).toEqual({ id: "burn", label: "Burning", defaults: { power: 1 } });
    expect(getRuleEffect("unknown")).toBeUndefined();
    expect(listRuleEffects().map((d) => d.id).sort()).toEqual(["burn", "chill"]);
  });

  test("last registration wins per id", () => {
    registerRuleEffect({ id: "burn", label: "One" });
    registerRuleEffect({ id: "burn", label: "Two" });
    expect(getRuleEffect("burn")?.label).toBe("Two");
    expect(listRuleEffects()).toHaveLength(1);
  });
});

// --- Adoption scenario 1: a combat-event equipment effect ---------------------------------------
// A ring that, when its wearer lands a critical hit, applies a 4s bleed to the struck enemy — but
// no more than once every 2s. Modeled purely as data + firings the game routes to its effect system.
describe("adoption: combat-event equipment effect", () => {
  test("a crit-triggered bleed ring drives a mock combat effect system", () => {
    const bleedApplied: { target: string; power: number }[] = [];
    const engine = createTriggeredRuleEngine([
      {
        id: "ring-of-embers",
        event: "damage-dealt",
        owner: "ring1",
        when: { eq: ["crit", true] },
        target: { role: "object" },
        cooldownMs: 2000,
        durationMs: 4000,
        stacking: "refresh",
        effect: { id: "bleed", params: { power: 5 } },
      },
    ]);

    function routeToCombat(firing: RuleFiring): void {
      if (firing.blocked !== undefined) return;
      const power = typeof firing.effect.params?.power === "number" ? firing.effect.params.power : 0;
      bleedApplied.push({ target: firing.target, power });
    }

    // non-crit hit: no bleed
    applied(engine.dispatch({ type: "damage-dealt", subject: "hero", object: "orc", facts: { crit: false } }, 0)).forEach(routeToCombat);
    // crit hit: bleed lands on the struck enemy
    engine.dispatch({ type: "damage-dealt", subject: "hero", object: "orc", facts: { crit: true } }, 100).forEach(routeToCombat);
    // second crit within cooldown: suppressed
    engine.dispatch({ type: "damage-dealt", subject: "hero", object: "orc", facts: { crit: true } }, 1000).forEach(routeToCombat);

    expect(bleedApplied).toEqual([{ target: "orc", power: 5 }]);
    expect(engine.activeFor("orc")).toHaveLength(1);

    // unequipping the ring cleans up its rule and the live bleed
    engine.removeByOwner("ring1");
    expect(engine.active()).toHaveLength(0);
    expect(engine.rules()).toHaveLength(0);
  });
});

// --- Adoption scenario 2: a non-combat triggered rule -------------------------------------------
// A quest rule: the first time the player enters the "frostpeak" region they gain a persistent
// "cold-adapted" buff, and never again. No combat concepts involved — proves the seam is genre-agnostic.
describe("adoption: non-combat triggered rule", () => {
  test("region-entry rule grants a one-time buff on the matching region", () => {
    const grants: string[] = [];
    const engine = createTriggeredRuleEngine([
      {
        id: "frostpeak-acclimation",
        event: "region-entered",
        when: { eq: ["region", "frostpeak"] },
        target: { role: "subject" },
        charges: 1,
        effect: { id: "grant-buff", params: { buff: "cold-adapted" } },
      },
    ]);

    function route(firing: RuleFiring): void {
      if (firing.blocked !== undefined) return;
      const buff = firing.effect.params?.buff;
      if (typeof buff === "string") grants.push(`${firing.target}:${buff}`);
    }

    // wrong region: predicate blocks
    engine.dispatch({ type: "region-entered", subject: "player", facts: { region: "meadow" } }, 0).forEach(route);
    engine.dispatch({ type: "region-entered", subject: "player", facts: { region: "frostpeak" } }, 10).forEach(route);
    // charge spent — a later visit does nothing
    engine.dispatch({ type: "region-entered", subject: "player", facts: { region: "frostpeak" } }, 5000).forEach(route);

    expect(grants).toEqual(["player:cold-adapted"]);
  });
});
