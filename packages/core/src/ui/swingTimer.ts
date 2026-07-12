/** The local player's auto-attack state for one frame. `swingTimer` counts DOWN in seconds to 0 (= a swing lands). */
export interface SwingPlayerInput {
  autoAttack: boolean;
  swingTimer: number;
  weapon: { speed: number };
}

/** The current target, or the fields the bar needs from it. */
export interface SwingTargetInput {
  dead: boolean;
  /** Entity kind; an `"object"` target (a node/chest) never shows a swing bar. */
  kind: string;
}

/** Whether the bar shows a "ready" label or the seconds-remaining countdown. */
export type SwingLabelKind = "ready" | "seconds";

/** One frame of swing-bar state plus the cursor (`nextPeriod`/`nextTimer`) the caller carries back into the next call. */
export interface SwingTimerState {
  /** Whether the bar should render at all. */
  visible: boolean;
  /** Fill 0..1, growing toward 1 as the next swing nears. */
  frac: number;
  /** True the moment the swing is ready to land. */
  ready: boolean;
  labelKind: SwingLabelKind;
  /** Seconds remaining until the next swing (0 when ready). */
  seconds: number;
  /** Recovered swing period this frame — pass back as `prevPeriod` next call. */
  nextPeriod: number;
  /** This frame's timer — pass back as `prevTimer` next call to detect the reset edge. */
  nextTimer: number;
}

/** Threshold above which a timer jump is treated as a fresh swing (period reset). */
export const SWING_EDGE_EPSILON = 1e-4;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const HIDDEN: Omit<SwingTimerState, "nextPeriod" | "nextTimer"> = {
  visible: false,
  frac: 0,
  ready: false,
  labelKind: "seconds",
  seconds: 0,
};

/**
 * Pure swing-timer bar state — no hidden state, no clock, no DOM. The caller
 * threads `prevPeriod`/`prevTimer` back each frame. The period is recovered on
 * the reset edge (when `swingTimer` jumps up = a new swing began) as
 * `max(swingTimer, weapon.speed)`, so the fill is correct even without knowing
 * the weapon's exact cadence. Hidden unless auto-attacking a live, non-object target.
 */
export function swingTimerState(
  player: SwingPlayerInput,
  target: SwingTargetInput | null,
  prevPeriod: number,
  prevTimer: number,
): SwingTimerState {
  const swingTimer = player.swingTimer;
  if (!player.autoAttack || target === null || target.dead || target.kind === "object") {
    return { ...HIDDEN, nextPeriod: prevPeriod, nextTimer: swingTimer };
  }
  const isResetEdge = swingTimer > prevTimer + SWING_EDGE_EPSILON || prevPeriod <= 0;
  const period = isResetEdge ? Math.max(swingTimer, player.weapon.speed) : prevPeriod;
  const frac = period <= 0 ? 1 : clamp01(1 - swingTimer / period);
  const ready = swingTimer <= 0;
  return {
    visible: true,
    frac,
    ready,
    labelKind: ready ? "ready" : "seconds",
    seconds: Math.max(0, swingTimer),
    nextPeriod: period,
    nextTimer: swingTimer,
  };
}
