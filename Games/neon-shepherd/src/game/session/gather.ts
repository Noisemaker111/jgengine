export const WHISTLE_COOLDOWN_SECONDS = 3;
export const WHISTLE_ACTIVE_SECONDS = 1.4;

export interface WhistleState {
  lastTriggeredAt: number | null;
}

export function createWhistleState(): WhistleState {
  return { lastTriggeredAt: null };
}

export function canTriggerWhistle(state: WhistleState, now: number): boolean {
  return state.lastTriggeredAt === null || now - state.lastTriggeredAt >= WHISTLE_COOLDOWN_SECONDS;
}

export function triggerWhistle(state: WhistleState, now: number): WhistleState {
  return canTriggerWhistle(state, now) ? { lastTriggeredAt: now } : state;
}

export function isGatherActive(state: WhistleState, now: number): boolean {
  return state.lastTriggeredAt !== null && now - state.lastTriggeredAt <= WHISTLE_ACTIVE_SECONDS;
}

export function whistleCooldownFraction(state: WhistleState, now: number): number {
  if (state.lastTriggeredAt === null) return 0;
  const elapsed = now - state.lastTriggeredAt;
  if (elapsed >= WHISTLE_COOLDOWN_SECONDS) return 0;
  return 1 - elapsed / WHISTLE_COOLDOWN_SECONDS;
}

export interface HoldState {
  holding: boolean;
  anchor: { x: number; z: number } | null;
}

export function createHoldState(): HoldState {
  return { holding: false, anchor: null };
}

export function advanceHold(
  prev: HoldState,
  held: boolean,
  shepherd: { x: number; z: number },
): HoldState {
  if (held && !prev.holding) return { holding: true, anchor: { x: shepherd.x, z: shepherd.z } };
  if (!held && prev.holding) return { holding: false, anchor: null };
  return prev;
}
