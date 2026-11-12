import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { createAgent } from "@jgengine/core/agents/agent";
import { seededRng } from "@jgengine/core/random/rng";

import { DAY_LENGTH } from "../../world";
import { game } from "../../game.config";
import { MEMBER_OPTIONS, MOOD_TIERS, memberNeeds } from "../agents";
import { registerCommands } from "../commands";
import { content } from "../content";
import { generateBodyPlan } from "../creatures/bodyPlan";
import { lowestNeed, NEEDS, type NeedId } from "../needs/needs";
import { householdStore } from "../session/store";
import type { Lifestyle, MemberState } from "../session/types";
import { chooseDesire, type Desire, type RoleAvailability } from "./ai";
import { setupWorld } from "./setup";
import { simulateHousehold } from "./simulate";

/** The hand-written rules beings followed before the utility brain, kept as the oracle the ladder must match. */
function handWrittenDesire(needs: Record<NeedId, number>, available: RoleAvailability, isWorkHours: boolean, hasIdleCompanion: boolean): Desire {
  const { need, value } = lowestNeed(needs);
  if (need === "social" && value < 60 && hasIdleCompanion) return { kind: "socialize" };
  if (value < 48 && available[need]) return { kind: "need", goal: need };
  if (isWorkHours && needs.energy > 58 && needs.hunger > 58 && available.work) return { kind: "work" };
  if (needs.social < 60 && hasIdleCompanion) return { kind: "socialize" };
  if (value < 62 && available[need]) return { kind: "need", goal: need };
  return { kind: "wander" };
}

describe("household desire ladder", () => {
  test("the utility brain picks what the hand-written rules picked, across 20,000 seeded moments", () => {
    const rng = seededRng("orbit-desire-ladder");
    const agent = createAgent({ id: "a", needs: memberNeeds(generateBodyPlan("ladder")), options: MEMBER_OPTIONS, mood: { tiers: MOOD_TIERS }, switchMargin: 0 });
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i += 1) {
      const needs = {} as Record<NeedId, number>;
      for (const need of NEEDS) {
        needs[need] = rng() * 100;
        agent.needs.refill(need, needs[need] - agent.needs.value(need));
      }
      const available: RoleAvailability = { hunger: rng() < 0.7, energy: rng() < 0.7, social: rng() < 0.5, fun: rng() < 0.7, work: rng() < 0.7 };
      const isWorkHours = rng() < 0.5;
      const companion = rng() < 0.5;
      const expected = handWrittenDesire(needs, available, isWorkHours, companion);
      expect(chooseDesire(agent, i, available, isWorkHours, companion)).toEqual(expected);
      seen.add(expected.kind === "need" ? expected.goal : expected.kind);
    }
    // Every rung was exercised.
    expect([...seen].sort()).toEqual(["energy", "fun", "hunger", "social", "socialize", "wander", "work"]);
  });
});

/**
 * A fixed-seed household run, digested per step: what every being does, where it is headed and its
 * needs. The expected digests were recorded from the hand-written desire rules before beings picked
 * through the shared utility brain, so a change here is a change in what the household does.
 */

function boot(seed: string): GameContext {
  const ctx = createGameContext({ definition: game.game, content, seed, player: { userId: "orbit-trace", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}

function build(ctx: GameContext, toolId: string, x: number, z: number): void {
  ctx.game.commands.run("build.tool", { toolId });
  ctx.game.commands.run("world.pointer", { point: { x, y: 0, z }, entity: null, object: null });
}

function actionKey(member: MemberState): string {
  const action = member.action;
  switch (action.kind) {
    case "idle": return "i";
    case "wander": return `w${action.company ?? ""}`;
    case "seek": return `s:${action.goal}:${action.objId}`;
    case "use": return `u:${action.goal}:${action.objId}`;
    case "social": return `t:${action.withId}`;
  }
}

/** FNV-1a over the per-step lines, so a long trace compares as one number. */
function hash(text: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function trace(seed: string, style: Lifestyle, days: number): { digest: number; actions: Record<string, number> } {
  const ctx = boot(seed);
  for (const id of householdStore.read(ctx).order) ctx.game.commands.run("member.lifestyle", { id, lifestyle: style });
  build(ctx, "work_console", 4, 1);
  build(ctx, "bloom_planter", -4, -2);
  let digest = 2166136261;
  const actions: Record<string, number> = {};
  const end = DAY_LENGTH * days;
  while (ctx.time.now() < end) {
    const state = householdStore.read(ctx);
    if (state.pantry <= 4 && state.credits >= 36) ctx.game.commands.run("household.rations", {});
    simulateHousehold(ctx, ctx.time.advance(0.5));
    const after = householdStore.read(ctx);
    let line = "";
    for (const id of after.order) {
      const member = after.members[id]!;
      const key = actionKey(member);
      const kind = key.split(":")[0]!.slice(0, 1) + (key.startsWith("s:") || key.startsWith("u:") ? `:${key.split(":")[1]}` : "");
      actions[kind] = (actions[kind] ?? 0) + 1;
      line += `${id}|${key}|${member.needs.hunger.toFixed(3)},${member.needs.energy.toFixed(3)},${member.needs.social.toFixed(3)},${member.needs.fun.toFixed(3)};`;
    }
    digest = hash(line, digest);
  }
  return { digest, actions };
}

describe("household desire trace", () => {
  test("a yield household's fixed-seed run is the run the hand-written rules made", () => {
    const run = trace("orbit-trace:yield", "yield", 3);
    expect(run.actions).toEqual({
      "u:work": 454, "s:work": 97, i: 283, "s:hunger": 262, "s:fun": 37, "u:hunger": 230,
      "u:fun": 213, "s:energy": 157, "u:energy": 185, t: 384, w: 2110,
    });
    expect(run.digest).toBe(2168860320);
  });

  test("a bloom household's fixed-seed run is the run the hand-written rules made", () => {
    const run = trace("orbit-trace:bloom", "bloom", 3);
    expect(run.actions).toEqual({
      w: 2149, "s:fun": 491, "u:fun": 578, i: 45, t: 360, "s:hunger": 167, "u:hunger": 221,
      "s:energy": 234, "u:energy": 167,
    });
    expect(run.digest).toBe(4162723402);
  });
});
