import { beforeEach, describe, expect, test } from "bun:test";
import { createBossState } from "@jgengine/core/ai/director/boss";
import { expandWave } from "@jgengine/core/ai/director/encounter";
import type { FighterState } from "@jgengine/core/ai/director/roles";

import { assignFrontDuties, frontPressure, stageFrontBoss, stepForeman } from "./front";
import { createShotHunt } from "./noise";
import { roleFor } from "./roles";
import {
  FOREMAN_PHASES,
  FRONT_PRESSURE,
  FRONT_WAVES,
  FOREMAN_TELL_TEXT,
} from "./waves";

function fighter(id: string, x: number, z: number, health = 1): FighterState {
  return { id, position: [x, 0, z], health };
}

describe("the front hands out duties from squad state", () => {
  test("a squad under contact retreats the hurt, holds one anchor and flanks from the outside", () => {
    const fighters = [
      fighter("hurt", 4, 4, 0.1),
      fighter("centre", 0.5, 0.5, 1),
      fighter("east", 8, 0),
      fighter("west", -8, 0),
      fighter("north", 0, 9),
      fighter("south", 0, -9),
    ];
    const orders = assignFrontDuties("scrapjack", fighters, [0, 0, 0]);

    expect(orders.intents.get("hurt")).toBe("retreat");
    expect(orders.counts.retreat).toBe(1);
    expect(orders.counts.hold).toBe(1);
    expect(orders.counts.flank).toBeGreaterThanOrEqual(1);
    expect(orders.counts.cover).toBeGreaterThanOrEqual(1);
    // Every fighter is accounted for exactly once.
    expect(orders.roles.size).toBe(fighters.length);
    expect([...orders.intents.keys()].sort()).toEqual(fighters.map((entry) => entry.id).sort());
  });

  test("the same duties mean different fights for the two crews", () => {
    const fighters = [fighter("a", 6, 0), fighter("b", 0, 6), fighter("c", -6, 0, 0.5)];
    const scrapjack = assignFrontDuties("scrapjack", fighters, [0, 0, 0]);
    const ripper = assignFrontDuties("ripper", fighters, [0, 0, 0]);

    // The engine's duties are the same for both squads...
    expect([...scrapjack.intents.entries()].sort()).toEqual([...ripper.intents.entries()].sort());
    // ...but the cover role that executes them is each crew's own.
    const coverId = [...scrapjack.intents].find(([, intent]) => intent === "cover")?.[0];
    if (coverId !== undefined) {
      expect(scrapjack.roles.get(coverId)?.id).toBe(roleFor("scrapjack")("cover").id);
      expect(ripper.roles.get(coverId)?.id).toBe(roleFor("ripper")("cover").id);
      expect(scrapjack.roles.get(coverId)?.preferredRange).toBeGreaterThan(
        ripper.roles.get(coverId)?.preferredRange ?? 0,
      );
    }
    const flankId = [...scrapjack.intents].find(([, intent]) => intent === "flank")?.[0];
    if (flankId !== undefined) {
      expect(roleFor("ripper")("flank").flankAngle ?? 0).toBeGreaterThan(
        roleFor("scrapjack")("flank").flankAngle ?? 0,
      );
      expect(ripper.roles.get(flankId)?.id).toBe(roleFor("ripper")("flank").id);
    }
  });

  test("with no known enemy the squad advances instead of taking cover", () => {
    const orders = assignFrontDuties(
      "ripper",
      [fighter("a", 3, 0), fighter("b", -3, 0)],
      null,
    );
    expect(orders.counts.assault).toBe(2);
    expect(orders.counts.cover).toBe(0);
  });
});

describe("the pressure cap", () => {
  test("a healthy player late in the run tops out at the authored tier, never above it", () => {
    const plan = frontPressure({ health: 1, progress: 1, elapsed: 100000 });
    expect(plan.tier).toBe(FRONT_PRESSURE.maxTier);
    expect(plan.atCap).toBe(true);
    expect(plan.countBonus).toBeLessThanOrEqual(FRONT_PRESSURE.maxTier!);
    expect(plan.eliteSlots).toBeLessThanOrEqual(FRONT_PRESSURE.maxTier!);
  });

  test("a hurt player is leaned on less than a healthy one", () => {
    const hurt = frontPressure({ health: 0.1, progress: 0.5, elapsed: 120 });
    const healthy = frontPressure({ health: 1, progress: 0.5, elapsed: 120 });
    expect(hurt.tier).toBeLessThanOrEqual(healthy.tier);
    expect(hurt.countBonus).toBeLessThanOrEqual(healthy.countBonus);
  });

  test("a wave takes only the extra copies pressure allows", () => {
    const plain = expandWave({ definition: FRONT_WAVES, seed: 7 }, 1);
    const pressed = expandWave({ definition: FRONT_WAVES, seed: 7 }, 1, { countBonus: 99 });
    expect(plain.every((order) => !order.pressureAdded)).toBe(true);
    expect(pressed.length).toBeGreaterThan(plain.length);
    // The default group cap is 4, so even an absurd plan cannot thicken one group past that.
    const perGroup = new Map<number, number>();
    for (const order of pressed.filter((entry) => entry.pressureAdded)) {
      perGroup.set(order.group, (perGroup.get(order.group) ?? 0) + 1);
    }
    for (const added of perGroup.values()) expect(added).toBeLessThanOrEqual(4);
    expect(pressed.filter((order) => order.pressureAdded)).toHaveLength(8);
  });
});

describe("the Foreman's phases", () => {
  test("health thresholds change the phase, fire each tell once, and never rewind", () => {
    const opening = createBossState(FOREMAN_PHASES);
    expect(opening.phaseId).toBe("stoke");

    const steady = stepForeman(opening, 1, 0.2);
    expect(steady.changed).toBe(false);
    expect(steady.tell).toBeNull();

    const second = stepForeman(opening, 0.55, 0.2);
    expect(second.changed).toBe(true);
    expect(second.phase.id).toBe("stampede");
    expect(second.tell?.id).toBe("lunge");
    expect(FOREMAN_TELL_TEXT.lunge).toBeTruthy();
    // The phase changed the fight, not just the label.
    expect(second.phase.behaviour.discipline?.fireInterval).toBeLessThan(
      FOREMAN_PHASES[0]!.behaviour.discipline?.fireInterval ?? 0,
    );

    const held = stepForeman(second.state, 0.5, 0.2);
    expect(held.changed).toBe(false);
    expect(held.tell).toBeNull();

    // A heal does not rewind, and it cannot re-fire the tell.
    const healed = stepForeman(second.state, 0.95, 0.2);
    expect(healed.phase.id).toBe("stampede");
    expect(healed.tell).toBeNull();

    const last = stepForeman(second.state, 0.2, 0.2);
    expect(last.phase.id).toBe("starving");
    expect(last.tell?.id).toBe("starve");
  });
});

describe("sound hunting", () => {
  let hunt: ReturnType<typeof createShotHunt>;

  beforeEach(() => {
    hunt = createShotHunt(
      () => [{ id: "listener", position: [12, 0, 0] as const }],
      { hearingRange: 30, memorySeconds: 4, maxInvestigators: 2, giveUpConfidence: 0.2 },
    );
  });

  test("a loud shot sends a nearby enemy, and the memory fading sends it back", () => {
    hunt.noise({ sourceId: "player", position: [0, 0, 0], at: 0, loudness: 1 });
    const investigating = hunt.heard(0);
    expect(investigating).toHaveLength(1);
    expect(investigating[0]?.hunterId).toBe("listener");
    expect(investigating[0]?.position).toEqual([0, 0, 0]);

    // A fresh shot refreshes the same memory, so the hunt keeps going.
    hunt.noise({ sourceId: "player", position: [2, 0, 0], at: 1000, loudness: 1 });
    expect(hunt.heard(1000).length).toBe(1);

    // Half the memory later it is still working; once it fades past the give-up threshold it is not.
    expect(hunt.heard(1800).length).toBe(1);
    // The memory has to be re-read at the later clock to see the fade; `investigations` alone
    // reports the confidence as of the last observe.
    expect(hunt.heard(4200).length).toBe(0);
  });

  test("the bound keeps one shot from emptying the map", () => {
    const many = createShotHunt(
      () => [
        { id: "a", position: [3, 0, 0] as const },
        { id: "b", position: [4, 0, 0] as const },
        { id: "c", position: [5, 0, 0] as const },
        { id: "d", position: [6, 0, 0] as const },
      ],
      { hearingRange: 30, memorySeconds: 4, maxInvestigators: 2 },
    );
    const admitted = many.noise({ sourceId: "player", position: [0, 0, 0], at: 0, loudness: 1 });
    expect(admitted).toEqual(["a", "b"]);
    expect(many.heard(0)).toHaveLength(2);
  });

  test("a quiet shot reaches less far than a loud one", () => {
    hunt.noise({ sourceId: "player", position: [0, 0, 0], at: 0, loudness: 0.3 });
    // 30 * 0.3 = 9 m, and the listener stands at 12 m.
    expect(hunt.heard(0)).toHaveLength(0);
  });
});
