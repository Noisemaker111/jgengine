import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { DAY_LENGTH } from "../../world";
import { FURNITURE_BY_ID, WORK_EARN_PER_SECOND, type FurnitureRole } from "../objects/catalog";
import { clamp, decayNeeds, type NeedId } from "../needs/needs";
import { householdStore } from "../session/store";
import { pairKey, pruneEvents, pushEvent, type HouseholdState, type MemberState } from "../session/types";
import {
  chooseDesire,
  isIdleish,
  SOCIAL_RANGE,
  SOCIAL_SECONDS,
  USE_FULL,
  type RoleAvailability,
} from "./ai";
import { addValue, driftValue, getValue } from "@jgengine/core/relation/keyedValues";
import { crossedMilestones, REL_BOUNDS } from "./social";

const EVENT_TTL = 7;
const LOW_CREDITS = 200;
const REL_GAIN_PER_SECOND = 6;
const REL_DRIFT_PER_DAY = 5;

function positionOf(ctx: GameContext, id: string): [number, number, number] | null {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return null;
  const p = entity.position;
  return [p[0], p[1], p[2]];
}

function availabilityFrom(objects: readonly SceneObject[]): RoleAvailability {
  const avail: RoleAvailability = { hunger: false, energy: false, social: false, fun: false, work: false };
  for (const obj of objects) {
    const def = FURNITURE_BY_ID[obj.catalogId];
    if (def !== undefined) avail[def.role] = true;
  }
  return avail;
}

function nearestForRole(
  ctx: GameContext,
  objects: readonly SceneObject[],
  from: [number, number, number],
  role: FurnitureRole,
): SceneObject | null {
  let best: SceneObject | null = null;
  let bestD = Infinity;
  for (const obj of objects) {
    const def = FURNITURE_BY_ID[obj.catalogId];
    if (def === undefined || def.role !== role) continue;
    const dx = obj.position[0] - from[0];
    const dz = obj.position[2] - from[2];
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = obj;
    }
  }
  return best;
}

function objectById(objects: readonly SceneObject[], id: string): SceneObject | null {
  return objects.find((obj) => obj.instanceId === id) ?? null;
}

function moveMember(ctx: GameContext, id: string, target: [number, number, number], speed: number, dt: number): number {
  const from = positionOf(ctx, id);
  if (from === null) return Infinity;
  const dx = target[0] - from[0];
  const dz = target[2] - from[2];
  const dist = Math.hypot(dx, dz);
  const next = ctx.scene.entity.moveToward(id, target, { speed, dt, stopDistance: 0 });
  if (next !== null) {
    const rotationY = Math.atan2(dx, dz);
    ctx.scene.entity.setPose(id, { position: next, rotationY, dt });
  }
  return dist;
}

function idleWanderTarget(member: MemberState): [number, number, number] {
  const angle = (hashId(member.id) % 360) * (Math.PI / 180) + member.actionUntil;
  const r = 6 + (hashId(member.id) % 9);
  return [Math.cos(angle) * r, 0, Math.sin(angle) * r];
}

function hashId(id: string): number {
  let a = 0;
  for (let i = 0; i < id.length; i++) a = (a * 31 + id.charCodeAt(i)) >>> 0;
  return a;
}

export function simulateHousehold(ctx: GameContext, dt: number): void {
  const state = householdStore.read(ctx);
  if (state.order.length === 0) return;
  const now = ctx.time.now();
  const hour = ctx.time.calendar().dayFraction * 24;
  const isWorkHours = hour >= 8 && hour < 18;
  const objects = ctx.scene.object.list();
  const availability = availabilityFrom(objects);
  const lowCredits = state.credits < LOW_CREDITS;

  for (const id of state.order) {
    const member = state.members[id];
    if (member === undefined) continue;
    member.needs = decayNeeds(member.needs, member.bodyPlan, DAY_LENGTH, dt);
  }

  for (const id of state.order) {
    const member = state.members[id];
    if (member === undefined) continue;
    stepMember(ctx, state, member, objects, availability, isWorkHours, lowCredits, now, dt);
  }

  driftRelationships(state, dt);
  pruneEvents(state, now, EVENT_TTL);
  householdStore.write(ctx, { ...state, members: { ...state.members } });
}

function stepMember(
  ctx: GameContext,
  state: HouseholdState,
  member: MemberState,
  objects: readonly SceneObject[],
  availability: RoleAvailability,
  isWorkHours: boolean,
  lowCredits: boolean,
  now: number,
  dt: number,
): void {
  const speed = walkSpeed(member);
  const action = member.action;

  if (action.kind === "use" || action.kind === "seek") {
    const obj = objectById(objects, action.objId);
    if (obj === null) {
      member.action = { kind: "idle" };
      member.assignedByPlayer = false;
      return;
    }
    const def = FURNITURE_BY_ID[obj.catalogId];
    if (def === undefined) {
      member.action = { kind: "idle" };
      return;
    }
    const target: [number, number, number] = [obj.position[0], obj.position[1], obj.position[2]];
    if (action.kind === "seek") {
      const dist = moveMember(ctx, member.id, target, speed, dt);
      if (dist <= def.useRadius) member.action = { kind: "use", goal: action.goal, objId: action.objId };
      return;
    }
    if (action.goal === "work") {
      state.credits += WORK_EARN_PER_SECOND * dt;
      member.needs.energy = clamp(member.needs.energy - 2 * dt);
      if (!isWorkHours && !member.assignedByPlayer) member.action = { kind: "idle" };
      return;
    }
    const goal = action.goal;
    member.needs[goal] = clamp(member.needs[goal] + def.satisfyPerSecond * dt);
    if (member.needs[goal] >= USE_FULL) {
      member.action = { kind: "idle" };
      member.assignedByPlayer = false;
    }
    return;
  }

  if (action.kind === "social") {
    const partner = state.members[action.withId];
    const mine = positionOf(ctx, member.id);
    const theirs = positionOf(ctx, action.withId);
    if (partner === undefined || mine === null || theirs === null) {
      member.action = { kind: "idle" };
      return;
    }
    const dist = Math.hypot(mine[0] - theirs[0], mine[2] - theirs[2]);
    if (dist > SOCIAL_RANGE + 2) {
      moveMember(ctx, member.id, theirs, speed, dt);
      return;
    }
    ctx.scene.entity.setPose(member.id, { position: mine, rotationY: Math.atan2(theirs[0] - mine[0], theirs[2] - mine[2]) });
    member.needs.social = clamp(member.needs.social + 12 * dt);
    member.needs.fun = clamp(member.needs.fun + 5 * dt);
    if (member.id < action.withId) bumpRelationship(state, member.id, action.withId, REL_GAIN_PER_SECOND * dt, now);
    if (now >= member.actionUntil) {
      member.action = { kind: "idle" };
      member.assignedByPlayer = false;
    }
    return;
  }

  const desire = chooseDesire(
    member,
    availability,
    isWorkHours,
    hasIdleCompanion(ctx, state, member),
    lowCredits,
  );
  const from = positionOf(ctx, member.id) ?? [0, 0, 0];
  if (desire.kind === "need") {
    const obj = nearestForRole(ctx, objects, from, desire.goal);
    if (obj !== null) member.action = { kind: "seek", goal: desire.goal, objId: obj.instanceId };
  } else if (desire.kind === "work") {
    const obj = nearestForRole(ctx, objects, from, "work");
    if (obj !== null) member.action = { kind: "seek", goal: "work", objId: obj.instanceId };
  } else if (desire.kind === "socialize") {
    const companion = findIdleCompanion(ctx, state, member);
    if (companion !== null) {
      const until = now + SOCIAL_SECONDS;
      member.action = { kind: "social", withId: companion.id };
      member.actionUntil = until;
      companion.action = { kind: "social", withId: member.id };
      companion.actionUntil = until;
    }
  } else {
    if (action.kind !== "wander" || now >= member.actionUntil) {
      const target = idleWanderTarget(member);
      member.action = { kind: "wander", x: target[0], z: target[2] };
      member.actionUntil = now + 4 + (hashId(member.id) % 4);
    }
    if (member.action.kind === "wander") {
      moveMember(ctx, member.id, [member.action.x, 0, member.action.z], speed * 0.6, dt);
    }
  }
}

function walkSpeed(member: MemberState): number {
  const legFactor = 0.7 + member.bodyPlan.limbCount * 0.06;
  return (2.1 * legFactor) / member.bodyPlan.size;
}

function hasIdleCompanion(ctx: GameContext, state: HouseholdState, member: MemberState): boolean {
  return findIdleCompanion(ctx, state, member) !== null;
}

function findIdleCompanion(ctx: GameContext, state: HouseholdState, member: MemberState): MemberState | null {
  const mine = positionOf(ctx, member.id);
  if (mine === null) return null;
  for (const id of state.order) {
    if (id === member.id) continue;
    const other = state.members[id];
    if (other === undefined || !isIdleish(other) || other.assignedByPlayer) continue;
    const theirs = positionOf(ctx, id);
    if (theirs === null) continue;
    if (Math.hypot(mine[0] - theirs[0], mine[2] - theirs[2]) <= SOCIAL_RANGE * 2) return other;
  }
  return null;
}

function bumpRelationship(state: HouseholdState, a: string, b: string, delta: number, now: number): void {
  const key = pairKey(a, b);
  const before = getValue(state.relationships, key);
  const after = addValue(state.relationships, key, delta, REL_BOUNDS);
  for (const milestone of crossedMilestones(before, after)) {
    if (state.milestones[key] === milestone.key) continue;
    state.milestones[key] = milestone.key;
    const nameA = state.members[a]?.name ?? "?";
    const nameB = state.members[b]?.name ?? "?";
    pushEvent(state, `${nameA} & ${nameB} ${milestone.label}.`, now, "milestone");
  }
}

function driftRelationships(state: HouseholdState, dt: number): void {
  const rate = (REL_DRIFT_PER_DAY / DAY_LENGTH) * dt * 0.4;
  for (const key of Object.keys(state.relationships)) {
    if (getValue(state.relationships, key) > 0) driftValue(state.relationships, key, rate, 0, REL_BOUNDS);
  }
}

export function activeGoalLabel(member: MemberState): string {
  const action = member.action;
  switch (action.kind) {
    case "idle":
      return "Idling";
    case "wander":
      return "Strolling the habitat";
    case "seek":
      return action.goal === "work" ? "Heading to work" : `Seeking ${goalWord(action.goal)}`;
    case "use":
      return action.goal === "work" ? "Working a shift" : `${goalWord(action.goal)}`;
    case "social":
      return "Socializing";
  }
}

function goalWord(goal: NeedId): string {
  switch (goal) {
    case "hunger":
      return "Nourishing";
    case "energy":
      return "Resting";
    case "social":
      return "Bonding";
    case "fun":
      return "Playing";
  }
}
