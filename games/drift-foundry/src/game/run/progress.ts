import { swapPart } from "../parts/build";
import { partById, type DriftFoundryPartDef } from "../parts/catalog";
import { ROW_SIX_TRACK, SPAWN_RUN, trackById } from "../tracks/catalog";
import { CORRIDOR_DRIVE_HALF_WIDTH } from "./constants";
import type { RecordStorage } from "./records";

export const PROGRESS_KEY = "drift-foundry.parked-run.v1";
export interface ParkedRun {
  version: 1;
  /** The track the run was parked on; runs parked before tracks existed are Row Six's. */
  track?: string;
  position: readonly [number, number, number];
  heading: number;
  runTime: number;
  partIds: string[];
  collectedIds: string[];
  gateIds: string[];
  armorSaveArmed: boolean;
  armorSavesUsed: number;
  nearMissCount: number;
  closestGap: number;
  wasNear: boolean;
  announcedSurge: string | null;
}

/** The track a parked run stands on; runs parked before the tracks are Row Six's. */
export function parkedTrack(run: ParkedRun) {
  return (run.track === undefined ? null : trackById(run.track)) ?? ROW_SIX_TRACK;
}

/** Run metres a parked run had covered. */
export function parkedRunMetres(run: ParkedRun): number {
  const track = parkedTrack(run);
  return Math.max(0, track.run(track.locate(run.position[0], run.position[2])));
}

export function checkpointParts(run: ParkedRun): readonly DriftFoundryPartDef[] {
  let installed: readonly DriftFoundryPartDef[] = [];
  for (const id of run.partIds) installed = swapPart(installed, partById(id)!).installed;
  return installed;
}

/** Checkpoints represent a grounded, stopped buggy, never a reconstructed moving physics state. */
export function readParkedRun(storage?: RecordStorage): ParkedRun | null {
  try {
    const run = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? "null");
    const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const ids = (value: unknown, known: ReadonlySet<string>) => Array.isArray(value) && value.every(id => typeof id === "string" && known.has(id)) && new Set(value).size === value.length;
    if (!run || run.version !== 1 || !Array.isArray(run.position) || run.position.length !== 3 || !run.position.every((value: unknown) => typeof value === "number" && Number.isFinite(value)) || !Number.isFinite(run.heading) || !nonnegative(run.runTime) || run.runTime === 0) return null;
    if (run.track !== undefined && typeof run.track !== "string") return null;
    const track = run.track === undefined ? ROW_SIX_TRACK : trackById(run.track);
    if (track === null) return null;
    // Parked on the track's road, between the spawn and the exit.
    const fix = track.locate(run.position[0], run.position[2]);
    const along = track.run(fix);
    const offRoad = track === ROW_SIX_TRACK ? Math.abs(run.position[0]) > CORRIDOR_DRIVE_HALF_WIDTH : !fix.inside;
    if (offRoad || along < SPAWN_RUN - 0.01 || along >= track.exitAt) return null;
    const gateIds = new Set(track.gates.flatMap(g => [g.id, `${g.id}:beaten`]));
    if (!ids(run.collectedIds, new Set(track.pickups.map(p => p.id))) || !ids(run.gateIds, gateIds) || !Array.isArray(run.partIds) || run.partIds.some((id: unknown) => typeof id !== "string" || !partById(id))) return null;
    const categories = run.partIds.map((id: string) => partById(id)!.slot);
    if (new Set(categories).size !== categories.length || run.partIds.some((id: string) => !track.pickups.some(p => p.partId === id && run.collectedIds.includes(p.id)))) return null;
    if (typeof run.armorSaveArmed !== "boolean" || typeof run.wasNear !== "boolean" || !nonnegative(run.armorSavesUsed) || !Number.isInteger(run.armorSavesUsed) || !nonnegative(run.nearMissCount) || !Number.isInteger(run.nearMissCount) || !nonnegative(run.closestGap) || !(run.announcedSurge === null || typeof run.announcedSurge === "string")) return null;
    if (checkpointParts(run).length !== run.partIds.length) return null;
    return run;
  } catch { return null; }
}

export function saveParkedRun(run: ParkedRun | null, storage?: RecordStorage): boolean {
  if (!storage) return false;
  try { storage.setItem(PROGRESS_KEY, JSON.stringify(run)); return true; }
  catch { return false; }
}
