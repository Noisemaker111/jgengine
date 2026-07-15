import { lowestNeed, type NeedId } from "../needs/needs";
import type { MemberState } from "../session/types";

export const SEEK_THRESHOLD = 48;
export const SOCIAL_WANT = 60;
export const WORK_READY = 58;
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

export function chooseDesire(
  member: MemberState,
  available: RoleAvailability,
  isWorkHours: boolean,
  hasIdleCompanion: boolean,
  lowCredits: boolean,
): Desire {
  const { need, value } = lowestNeed(member.needs);
  if (value < SEEK_THRESHOLD && available[need]) return { kind: "need", goal: need };

  const needsIncome = lowCredits || isWorkHours;
  const restEnough = member.needs.energy > WORK_READY && member.needs.hunger > WORK_READY;
  if (needsIncome && restEnough && available.work) return { kind: "work" };

  if (member.needs.social < SOCIAL_WANT && hasIdleCompanion) return { kind: "socialize" };
  if (value < SEEK_THRESHOLD + 14 && available[need]) return { kind: "need", goal: need };
  return { kind: "wander" };
}

export function isIdleish(member: MemberState): boolean {
  return member.action.kind === "idle" || member.action.kind === "wander";
}
