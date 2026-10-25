import type { RunChange } from "@jgengine/core/run/runLoop";

import { COMPACTOR_SURGES, type CompactorPlan, type CompactorSurge } from "../compactor/schedule";
import { RIVAL_DEFS, type RivalDef } from "../race/opponents";
import { COMPACTOR_START_Z } from "./constants";

/**
 * What the next run changes. The yard is one corridor and one compactor, so a new run differs by a
 * shift somebody called in: a rival drives a tighter line, the rookie stops getting a tow, the crusher
 * starts closer, or the night crew runs the surges early. The draw itself is the engine's run loop;
 * these are the authored entries it picks from, and a results screen names the winner.
 */

export type ShiftId = "hobbs-line" | "tally-honest" | "crusher-lead" | "night-shift";

/** How one shift changes the corridor. Every field is optional, so a shift says only what it touches. */
export interface ShiftEffect {
  /** One rival's line, pace or catch-up band. */
  rival?: { id: string; paceScale?: number; lineScale?: number; band?: number };
  /** Metres added to where the crusher starts; negative starts it closer. */
  compactorStartZ?: number;
  /** Seconds earlier every surge arrives. */
  surgeShiftT?: number;
  /** Metres per second added to every surge. */
  surgeSpeed?: number;
}

export const SHIFT_LABELS: Record<ShiftId, { label: string; hint: string }> = {
  "hobbs-line": {
    label: "HOBBS SCOUTED YOUR LINE",
    hint: "HOBBS runs it tighter and 4% harder, cutting the wobble out of his outside line.",
  },
  "tally-honest": {
    label: "TALLY GOT A TALKING-TO",
    hint: "TALLY stops taking the field's tow: the rookie races his own build, so he holds whatever gap he earns.",
  },
  "crusher-lead": {
    label: "THE CRUSHER ROLLED OUT EARLY",
    hint: "The compactor starts 12 m closer to the grid, so the opening sprint is already under pressure.",
  },
  "night-shift": {
    label: "NIGHT CREW RAN THE SURGES",
    hint: "Both surges come 6 s earlier and 0.6 m/s harder. The clock, not the corridor, is different.",
  },
};

export const SHIFT_TABLE: readonly RunChange<ShiftEffect>[] = [
  // `after: 1` keeps the first run honest - every run after it differs.
  { id: "hobbs-line", value: { rival: { id: "rival_hobbs", paceScale: 1.04, lineScale: 0.55 } }, after: 1 },
  { id: "tally-honest", value: { rival: { id: "rival_tally", band: 0.15 } }, after: 1 },
  { id: "crusher-lead", value: { compactorStartZ: -12 }, after: 1 },
  { id: "night-shift", value: { surgeShiftT: 6, surgeSpeed: 0.6 }, after: 2 },
];

for (const entry of SHIFT_TABLE) {
  if (SHIFT_LABELS[entry.id as ShiftId] === undefined) throw new Error(`shifts: "${entry.id}" has no label`);
}

/** The label and hint for a shift id, or `null` for a run with no shift. */
export function shiftInfo(changeId: string | null): { id: string; label: string; hint: string } | null {
  if (changeId === null) return null;
  const entry = SHIFT_LABELS[changeId as ShiftId];
  return entry === undefined ? null : { id: changeId, ...entry };
}

function effectOf(changeId: string | null): ShiftEffect {
  if (changeId === null) return {};
  return SHIFT_TABLE.find((entry) => entry.id === changeId)?.value ?? {};
}

/** The field this run races: the authored rivals, with the shift's line and pace applied. */
export function rivalsForShift(changeId: string | null, defs: readonly RivalDef[] = RIVAL_DEFS): readonly RivalDef[] {
  const change = effectOf(changeId).rival;
  if (change === undefined) return defs;
  return defs.map((def) => {
    if (def.id !== change.id) return def;
    return {
      ...def,
      pace: def.pace * (change.paceScale ?? 1),
      band: change.band ?? def.band,
      // A scaled line keeps its sign and its gate order; it just stops wandering as far off the racing groove.
      line: change.lineScale === undefined ? def.line : def.line.map((offset) => Math.round(offset * change.lineScale! * 10) / 10),
    };
  });
}

function surgePlan(changeId: string | null): readonly CompactorSurge[] {
  const effect = effectOf(changeId);
  const shift = effect.surgeShiftT ?? 0;
  const speed = effect.surgeSpeed ?? 0;
  if (shift === 0 && speed === 0) return COMPACTOR_SURGES;
  return COMPACTOR_SURGES.map((surge) => ({
    ...surge,
    startT: Math.max(0, surge.startT - shift),
    endT: Math.max(1, surge.endT - shift),
    speed: surge.speed + speed,
  }));
}

/** The crusher this run races: start line and surge schedule with the shift applied. */
export function compactorPlanForShift(changeId: string | null): CompactorPlan {
  const effect = effectOf(changeId);
  return {
    startZ: COMPACTOR_START_Z + (effect.compactorStartZ ?? 0),
    surges: surgePlan(changeId),
  };
}
