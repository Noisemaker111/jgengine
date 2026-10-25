import { describe, expect, test } from "bun:test";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAgent } from "@jgengine/core/agents/agent";
import { createRelationshipBook } from "@jgengine/core/agents/relationships";

import { game } from "../../game.config";
import { onInit, onTick } from "../../loop";
import { content } from "../content";
import { generateBodyPlan, walkSpeedOf } from "../creatures/bodyPlan";
import { emptyNeeds, type NeedId } from "../needs/needs";
import { householdStore } from "../session/store";
import { MEMBER_OPTIONS, memberNeeds, moodOfNeeds, relationLabel } from "../agents";

const NEEDS: readonly NeedId[] = ["hunger", "energy", "social", "fun"];

describe("body plans", () => {
  test("generation is deterministic per seed", () => {
    expect(generateBodyPlan("seed:1")).toEqual(generateBodyPlan("seed:1"));
  });
  test("walk speed is always positive", () => {
    for (let i = 0; i < 20; i++) expect(walkSpeedOf(generateBodyPlan(`s${i}`))).toBeGreaterThan(0);
  });
});

describe("needs and mood", () => {
  test("the shared meter drains a being's needs over the household day", () => {
    const agent = createAgent({ id: "a", needs: memberNeeds({ ...generateBodyPlan("x"), metabolism: 1 }), options: MEMBER_OPTIONS });
    agent.update({ dt: 10, now: 10 });
    expect(agent.needs.value("hunger")).toBeLessThan(emptyNeeds().hunger);
    expect(agent.needs.value("hunger")).toBeGreaterThanOrEqual(0);
  });

  test("mood reads from the need record and spans radiant to low", () => {
    expect(moodOfNeeds({ hunger: 95, energy: 95, social: 95, fun: 95 }).tier).toBe("radiant");
    expect(moodOfNeeds({ hunger: 5, energy: 5, social: 5, fun: 5 }).tier).toBe("low");
    expect(moodOfNeeds(emptyNeeds()).label).toBe("Content");
  });
});

describe("agent desire", () => {
  function agentWith(needs: Record<NeedId, number>) {
    const agent = createAgent({
      id: "a",
      needs: memberNeeds(generateBodyPlan("desire")),
      options: MEMBER_OPTIONS,
      switchMargin: 0,
    });
    for (const need of NEEDS) agent.needs.refill(need, needs[need] - agent.needs.value(need));
    return agent;
  }

  test("a hungry being heads for the station that fills hunger", () => {
    const agent = agentWith({ hunger: 10, energy: 90, social: 90, fun: 90 });
    const frame = agent.update({
      dt: 0,
      now: 0,
      targets: [
        { option: "hunger", target: "font:1" },
        { option: "energy", target: "pod:1" },
        { option: "fun", target: "arcade:1" },
      ],
    });
    expect(frame.action.option).toBe("hunger");
    expect(frame.action.target).toBe("font:1");
  });

  test("a rested being takes a paid shift when one is offered", () => {
    const agent = agentWith({ hunger: 95, energy: 95, social: 95, fun: 95 });
    const frame = agent.update({
      dt: 0,
      now: 0,
      targets: [
        { option: "work", target: "console:1" },
        { option: "fun", target: "arcade:1" },
      ],
    });
    expect(frame.action.option).toBe("work");
  });

  test("a lonely being with an idle companion goes to talk", () => {
    const agent = agentWith({ hunger: 90, energy: 90, social: 20, fun: 90 });
    const frame = agent.update({
      dt: 0,
      now: 0,
      targets: [
        { option: "social", target: "alien:1" },
        { option: "fun", target: "arcade:1" },
      ],
    });
    expect(frame.action.option).toBe("social");
    expect(frame.action.target).toBe("alien:1");
  });
});

describe("relationships", () => {
  test("a friendship starts at the shared milestone and labels scale with standing", () => {
    const book = createRelationshipBook();
    const outcome = book.socialise("a", "b", { familiarity: 0.4, opinion: 36 });
    expect(outcome.crossed.map((milestone) => milestone.id)).toEqual(["friends"]);
    expect(book.prefersCompanyOf("a", "b")).toBe(true);
    expect(relationLabel(96)).toBe("Bonded");
    expect(relationLabel(0)).toBe("Neutral");
  });

  test("a bond needs opinion and time shared before the pair refuses to split", () => {
    const book = createRelationshipBook();
    book.socialise("a", "b", { opinion: 96, familiarity: 0.4 });
    expect(book.refusesToSplit("a", "b")).toBe(false);
    book.socialise("a", "b", { familiarity: 0.2 });
    expect(book.refusesToSplit("a", "b")).toBe(true);
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
    ctx.game.commands.run("orbit.new", {});
    return ctx;
  }

  test("ticking keeps needs bounded and does not crash", () => {
    const ctx = boot();
    for (let i = 0; i < 120; i++) onTick(ctx, ctx.time.advance(0.5));
    const household = householdStore.read(ctx);
    for (const id of household.order) {
      const needs = household.members[id]!.needs;
      for (const value of Object.values(needs)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  test("a completed directed shift earns its bounded daily pay", () => {
    const ctx = boot();
    const before = householdStore.read(ctx);
    const id = before.order[0]!;
    const member = before.members[id]!;
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    householdStore.write(ctx, { ...before, members: { ...before.members } });
    const creditsBefore = householdStore.read(ctx).credits;
    for (let i = 0; i < 40; i++) onTick(ctx, ctx.time.advance(0.5));
    expect(householdStore.read(ctx).credits - creditsBefore).toBe(100);
    expect(member.workToday).toBe(20);
    expect(member.completedShifts).toBe(1);
  });
});

