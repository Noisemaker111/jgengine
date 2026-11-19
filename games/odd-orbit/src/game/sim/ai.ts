import type { Agent, AgentTarget } from "@jgengine/core/agents/agent";

import { NEEDS, type NeedId } from "../needs/needs";
import type { MemberState } from "../session/types";

export const USE_FULL = 98;
export const SOCIAL_RANGE = 6;
export const SOCIAL_SECONDS = 6;

export interface RoleAvailability {
  hunger: boolean;
  energy: boolean;
  social: boolean;
  fun: boolean;
  work: boolean;
}

export type Desire =
  | { kind: "need"; goal: NeedId }
  | { kind: "work" }
  | { kind: "socialize" }
  | { kind: "wander" };

export function desireTargets(available: RoleAvailability, isWorkHours: boolean, hasIdleCompanion: boolean): AgentTarget[] {
  const targets: AgentTarget[] = [];
  for (const need of NEEDS) if (available[need]) targets.push({ option: need, target: need });
  if (isWorkHours && available.work) targets.push({ option: "work", target: "work" });
  if (hasIdleCompanion) targets.push({ option: "socialize", target: "companion" });
  targets.push({ option: "wander", target: "habitat" });
  return targets;
}

export function chooseDesire(agent: Agent, now: number, available: RoleAvailability, isWorkHours: boolean, hasIdleCompanion: boolean): Desire {
  const option = agent.update({ dt: 0, now, targets: desireTargets(available, isWorkHours, hasIdleCompanion) }).action.option;
  switch (option) {
    case "work": return { kind: "work" };
    case "socialize": return { kind: "socialize" };
    case "hunger":
    case "energy":
    case "social":
    case "fun": return { kind: "need", goal: option };
    default: return { kind: "wander" };
  }
}

export function isIdleish(member: MemberState): boolean {
  return member.action.kind === "idle" || member.action.kind === "wander";
}
