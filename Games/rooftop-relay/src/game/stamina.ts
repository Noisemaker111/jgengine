import { STAMINA_JUMP_COST, STAMINA_REGEN_PER_SECOND, STAMINA_SPRINT_DRAIN_PER_SECOND } from "./tuning";

export interface StaminaStepInput {
  current: number;
  max: number;
  sprinting: boolean;
  moving: boolean;
  jumped: boolean;
  dt: number;
}

export function stepStamina(input: StaminaStepInput): number {
  let next = input.current;
  if (input.jumped) next -= STAMINA_JUMP_COST;
  if (input.sprinting && input.moving) {
    next -= STAMINA_SPRINT_DRAIN_PER_SECOND * input.dt;
  } else {
    next += STAMINA_REGEN_PER_SECOND * input.dt;
  }
  return Math.max(0, Math.min(input.max, next));
}

export function isExhausted(current: number): boolean {
  return current <= 0;
}
