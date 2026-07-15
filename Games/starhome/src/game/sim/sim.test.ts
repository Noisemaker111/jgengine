import { describe, expect, test } from "bun:test";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { onInit, onTick } from "../../loop";
import { content } from "../content";
import { generateBodyPlan, walkSpeedOf } from "../creatures/bodyPlan";
import { decayNeeds, emptyNeeds, lowestNeed, moodOf } from "../needs/needs";
import { householdStore } from "../session/store";
import { chooseDesire, type RoleAvailability } from "./ai";
import { crossedMilestone, relationLabel } from "./social";

const ALL: RoleAvailability = { hunger: true, energy: true, social: true, fun: true, work: true };

describe("body plans", () => {
  test("generation is deterministic per seed", () => {
    expect(generateBodyPlan("seed:1")).toEqual(generateBodyPlan("seed:1"));
  });
  test("walk speed is always positive", () => {
    for (let i = 0; i < 20; i++) expect(walkSpeedOf(generateBodyPlan(`s${i}`))).toBeGreaterThan(0);
  });
});

describe("needs and mood", () => {
  test("needs decay toward zero, scaled by metabolism", () => {
    const plan = { ...generateBodyPlan("x"), metabolism: 1 };
    const after = decayNeeds(emptyNeeds(), plan, 100, 10);
    expect(after.hunger).toBeLessThan(emptyNeeds().hunger);
    expect(after.hunger).toBeGreaterThanOrEqual(0);
  });
  test("lowestNeed finds the minimum", () => {
    const needs = { hunger: 90, energy: 12, social: 80, fun: 70 };
    expect(lowestNeed(needs)).toEqual({ need: "energy", value: 12 });
  });
  test("mood tiers span radiant to low", () => {
    expect(moodOf({ hunger: 95, energy: 95, social: 95, fun: 95 }).tier).toBe("radiant");
    expect(moodOf({ hunger: 5, energy: 5, social: 5, fun: 5 }).tier).toBe("low");
  });
});

describe("ai desire", () => {
  test("seeks the lowest need when a matching object exists", () => {
    const member = { needs: { hunger: 20, energy: 80, social: 80, fun: 80 } } as never;
    expect(chooseDesire(member, ALL, false, false, false)).toEqual({ kind: "need", goal: "hunger" });
  });
  test("works when rested and income is wanted", () => {
    const member = { needs: { hunger: 90, energy: 90, social: 90, fun: 90 } } as never;
    expect(chooseDesire(member, ALL, true, false, false)).toEqual({ kind: "work" });
  });
  test("socializes when lonely and a companion is idle", () => {
    const member = { needs: { hunger: 90, energy: 90, social: 55, fun: 90 } } as never;
    expect(chooseDesire(member, ALL, false, true, false)).toEqual({ kind: "socialize" });
  });
});

describe("relationships", () => {
  test("milestone crossing fires once at each threshold", () => {
    expect(crossedMilestone(30, 40)?.key).toBe("friends");
    expect(crossedMilestone(40, 50)).toBeNull();
  });
  test("labels scale with standing", () => {
    expect(relationLabel(96)).toBe("Bonded");
    expect(relationLabel(0)).toBe("Neutral");
  });
});

describe("simulation loop", () => {
  function boot(): GameContext {
    const ctx = createGameContext({
      definition: game.game,
      content,
      player: { userId: "director", isNew: true },
    });
    onInit(ctx);
    return ctx;
  }

  test("ticking keeps needs bounded and does not crash", () => {
    const ctx = boot();
    for (let i = 0; i < 120; i++) onTick(ctx, 0.5);
    const household = householdStore.read(ctx);
    for (const id of household.order) {
      const needs = household.members[id]!.needs;
      for (const value of Object.values(needs)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  test("a working member earns credits", () => {
    const ctx = boot();
    const before = householdStore.read(ctx);
    const id = before.order[0]!;
    const member = before.members[id]!;
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    householdStore.write(ctx, { ...before, members: { ...before.members } });
    const creditsBefore = householdStore.read(ctx).credits;
    onTick(ctx, 1);
    expect(householdStore.read(ctx).credits).toBeGreaterThan(creditsBefore);
  });
});
