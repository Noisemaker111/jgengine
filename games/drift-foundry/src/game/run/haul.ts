import { ROUTE_GATES } from "../route/gates";

/**
 * What an escape pays. The run carries salvage; the line decides how much of it reaches the bank.
 * A clean line - every barrier, a high finish, under par, no bent metal - pays `LINE_MAX` times what
 * was carried; a scrappy escape still pays `LINE_MIN`, so a wreck is the only way to lose the lot.
 */

/** A wrecked run keeps nothing; any escape pays at least this share of what it carried. */
export const LINE_MIN = 0.5;
/** A perfect escape cannot pay more than this, so the parts ladder stays the long goal. */
export const LINE_MAX = 1.8;
/** A clean run down the corridor takes this long; quicker than this pays the full time bonus. */
export const PAR_SECONDS = 36;
/** The clock a full time bonus means. */
export const FLYING_SECONDS = 24;

export const LINE_RULES = {
  /** Per barricade cleared. */
  barrier: 0.05,
  /** Finish place in the four-kart field, 1st to 4th. */
  place: [0.3, 0.15, 0.05, 0] as readonly number[],
  /** Best possible time bonus, at {@link FLYING_SECONDS}. */
  time: 0.2,
  /** Per stage of folded nose. */
  damageStage: -0.1,
  /** Per crusher hit an armor plate took instead of ending the run. */
  armorSave: -0.1,
} as const;

/** The run's own numbers, as the line reads them. */
export interface LineInput {
  /** Barricades cleared, 0 to the full route. */
  barriers: number;
  /** Finish place in the field, 1-based. */
  place: number;
  /** Run time in seconds. */
  time: number;
  /** Folded nose stages, 0 to 2. */
  damageStage: number;
  /** Crusher hits an armor plate absorbed. */
  armorSaves: number;
  /** Barricades on the track's main line; Row Six's eight by default. */
  gates?: number;
  /** The track's par, seconds; Row Six's {@link PAR_SECONDS} by default. */
  par?: number;
}

/** The payout multiplier and the lines a results screen shows to explain it. */
export interface LineReading {
  multiplier: number;
  notes: readonly string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** How much of an escaped run's salvage reaches the bank, and why. */
export function lineReading(run: LineInput): LineReading {
  const notes: string[] = [];
  const gates = run.gates ?? ROUTE_GATES.length;
  const par = run.par ?? PAR_SECONDS;
  const flying = par * (FLYING_SECONDS / PAR_SECONDS);
  const bars = Math.max(0, Math.min(gates, Math.floor(Number.isFinite(run.barriers) ? run.barriers : 0)));
  let multiplier = 1;

  if (bars > 0) {
    const bonus = round2(LINE_RULES.barrier * bars);
    multiplier += bonus;
    notes.push(`${bars}/${gates} barriers +${bonus.toFixed(2)}`);
  }
  const place = Math.floor(run.place);
  const placeBonus = place >= 1 && place <= LINE_RULES.place.length ? LINE_RULES.place[place - 1]! : 0;
  if (placeBonus > 0) {
    multiplier += placeBonus;
    notes.push(`P${place} +${placeBonus.toFixed(2)}`);
  }
  if (Number.isFinite(run.time) && run.time > 0 && run.time < par) {
    const share = Math.min(1, (par - run.time) / (par - flying));
    const bonus = round2(LINE_RULES.time * share);
    if (bonus > 0) {
      multiplier += bonus;
      notes.push(`${run.time.toFixed(1)}s under par +${bonus.toFixed(2)}`);
    }
  }
  const stages = Math.max(0, Math.floor(run.damageStage));
  if (stages > 0) {
    const cost = round2(LINE_RULES.damageStage * Math.min(2, stages));
    multiplier += cost;
    notes.push(`nose folded ${Math.min(2, stages)}/2 ${cost.toFixed(2)}`);
  }
  const saves = Math.max(0, Math.floor(run.armorSaves));
  if (saves > 0) {
    const cost = round2(LINE_RULES.armorSave * saves);
    multiplier += cost;
    notes.push(`${saves} armor save${saves === 1 ? "" : "s"} ${cost.toFixed(2)}`);
  }

  return { multiplier: Math.min(LINE_MAX, Math.max(LINE_MIN, round2(multiplier))), notes };
}
