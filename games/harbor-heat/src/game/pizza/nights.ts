import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { SET_PIECES, type SetPiece } from "../city";
import { shiftOpen } from "../tide/tide";

/**
 * The set-piece nights of the story: the Lantern Festival, the storm surge and the blackout. Each is a
 * world-model job (`city.ts`); while that job is live and the shop is open, its night runs and changes
 * the city's rules. The shift, the tide and the night look read the modifiers here, and the story's
 * objective reads the night's score. Midnight closing the shop before the score is reached rains the
 * night out, and its giver offers it again.
 */

export interface NightState {
  /** The set piece running tonight, or null on an ordinary night. */
  running: SetPiece | null;
  /** Boxes delivered since it started. */
  score: number;
  /** Midnight came before the score: the job fails and can be retried. */
  failed: boolean;
}

export const nightStore = defineStore<NightState>("harbor.night", () => ({ running: null, score: 0, failed: false }));

export interface NightRules {
  label: string;
  /** One line for the pager and the notice. */
  blurb: string;
  /** Extra metres on the tide all night. */
  surge: number;
  /** Multiplier on the seconds between calls. */
  callScale: number;
  /** Multiplier on every tip, with the slip line that explains it. */
  tipScale: number;
  tipLine: string;
  /** Multiplier on the seconds before a Crust rider comes for a stacked bag. */
  rivalScale: number;
  /** Streetlights and neon out: only the beacons and the oven glow. */
  dark: boolean;
}

export const NIGHT_RULES: Readonly<Record<SetPiece, NightRules>> = {
  festival: {
    label: "Night of Lanterns",
    blurb: "Lantern night! Calls come twice as fast and the crowd tips 30% more.",
    surge: 0,
    callScale: 0.5,
    tipScale: 1.3,
    tipLine: "Festival crowd",
    rivalScale: 1,
    dark: false,
  },
  storm: {
    label: "The Storm Surge",
    blurb: "Storm surge: the water runs half a metre higher all night. Every drop pays storm money.",
    surge: 0.5,
    callScale: 0.85,
    tipScale: 1.25,
    tipLine: "Storm money",
    rivalScale: 1.5,
    dark: false,
  },
  blackout: {
    label: "Blackout on the Strip",
    blurb: "Blackout: no streetlights, no neon. Follow the beacons; Crust riders love the dark.",
    surge: 0,
    callScale: 0.8,
    tipScale: 1.2,
    tipLine: "Candlelight thanks",
    rivalScale: 0.5,
    dark: true,
  },
};

/** Tonight's rules, or null on an ordinary night. */
export function nightRules(ctx: GameContext): NightRules | null {
  const running = nightStore.read(ctx).running;
  return running === null ? null : NIGHT_RULES[running];
}

function hourOf(ctx: GameContext): number {
  const calendar = ctx.time.calendar();
  return calendar.hour + calendar.minute / 60;
}

/**
 * Start, keep or end tonight's set piece from the live story job. `missionId` is the world model's
 * active job, or null.
 */
export function tickNights(ctx: GameContext, missionId: string | null): void {
  const state = nightStore.read(ctx);
  const piece = missionId !== null && missionId in SET_PIECES ? SET_PIECES[missionId as keyof typeof SET_PIECES] : null;
  const open = shiftOpen(hourOf(ctx));
  if (piece === null) {
    if (state.running !== null || state.failed) nightStore.write(ctx, { running: null, score: 0, failed: false });
    return;
  }
  if (state.running === null && open && !state.failed) {
    nightStore.write(ctx, { running: piece, score: 0, failed: false });
    ctx.game.notices.push({ text: NIGHT_RULES[piece].blurb, tone: "warn" });
    return;
  }
  if (state.running !== null && !open) nightStore.write(ctx, { ...state, running: null, failed: true });
}

/** Count delivered boxes toward tonight's set piece. */
export function scoreNight(ctx: GameContext, boxes: number): void {
  const state = nightStore.read(ctx);
  if (state.running === null || boxes <= 0) return;
  nightStore.write(ctx, { ...state, score: state.score + boxes });
}

/** A retried set piece starts clean. */
export function resetNight(ctx: GameContext): void {
  nightStore.write(ctx, { running: null, score: 0, failed: false });
}
