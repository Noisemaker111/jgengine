import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { activeMap, chooseMap, type MapId } from "../maps";
import { campaign, setDifficulty, setRunModeChoice, type DifficultyId } from "./campaign";
import type { RunMode } from "./waves/mode";
import { beginRun, enterRun } from "./menu";
import { beaconSave, loadSlot, prepareKeep, refreshBeaconSlots, saveToSlot } from "./save";
import { districtOpen } from "./season";
import { keepProfile } from "./thumbs";

/**
 * Moving between districts. A map is a scene in the engine's scene set, and switching it rebuilds the
 * game in place with a fresh context, so the trip is a hand-off: save the career, switch the map, and
 * the new context picks the career back up in `arrive`. The arrival lives in this module, which
 * outlives the rebuild (same page, same module instance).
 */
type Arrival =
  | { kind: "fresh"; slot: string }
  | { kind: "resume"; slot: string }
  | { kind: "new"; slot: string; difficulty: DifficultyId; commander: string | null; mode: RunMode };

let arrival: Arrival | null = null;

/** The arrival waiting for the rebuilt game, if any (a test reads it). @internal */
export function pendingArrival(): Arrival | null {
  return arrival;
}

function go(map: MapId, next: Arrival): boolean {
  arrival = next;
  if (activeMap() === map || !chooseMap(map)) {
    arrival = null;
    return false;
  }
  return true;
}

/**
 * Take the career to another open district for its next day: the day just chosen is saved, the map
 * switches, and the next day opens there. Refused (false) for a locked district or the current one.
 */
export async function travelTo(ctx: GameContext, map: MapId): Promise<boolean> {
  if (map === activeMap() || !districtOpen(campaign.read(ctx), map)) return false;
  const slot = beaconSave(ctx).slot();
  await saveToSlot(ctx, slot);
  return go(map, { kind: "fresh", slot });
}

/** Return to a kept day saved on another map: switch to it, then load the day where it was left. */
export function resumeOnMap(map: MapId, slot: string): boolean {
  return go(map, { kind: "resume", slot });
}

/** Open a new career, which always starts on the first district. */
export function newCareerOnMap(map: MapId, slot: string, difficulty: DifficultyId, commander: string | null, mode: RunMode = "day"): boolean {
  return go(map, { kind: "new", slot, difficulty, commander, mode });
}

/** Called once a rebuilt game has booted: finish the trip that rebuilt it. Returns whether there was one. */
export async function arrive(ctx: GameContext): Promise<boolean> {
  const next = arrival;
  if (next === null) return false;
  arrival = null;
  await refreshBeaconSlots(ctx);
  if (next.kind === "new") {
    keepProfile.commander = next.commander;
    await prepareKeep(ctx, next.slot);
    setDifficulty(ctx, next.difficulty);
    setRunModeChoice(ctx, next.mode);
    beginRun(ctx);
    return true;
  }
  await loadSlot(ctx, next.slot);
  if (next.kind === "fresh") beginRun(ctx);
  else enterRun(ctx);
  return true;
}
