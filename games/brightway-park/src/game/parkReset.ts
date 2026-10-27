import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { editorMarkerXZ } from "@jgengine/core/editor/index";

import { editorLayers } from "../editorLayers";
import { buildableDef } from "./objects/catalog";
import { cellFor, freshWorld, park, placeFree } from "./park";
import { spawnAll } from "./parkScene";
import { seedGuests, resetGuestAgents } from "./sim/guests";
import { resetRides } from "./rides";
import { resetSession, session } from "./session";
import { scenarioDef, scenarioLock, scenarioSeconds } from "./scenarios";
import { syncAmbience } from "./audio";
import { savePark } from "./persistence";
import { DAY_START } from "./catalog";
import { resetDayLoop } from "./daySession";
import { restartHints } from "./onboarding";
import { armMidnight } from "./midnight";

const TRACK_PATH_ID = "coaster-track";

export interface SeedPlacement {
  catalogId: string;
  x: number;
  z: number;
}

function markerCatalogId(meta: Record<string, unknown> | undefined): string {
  const id = meta?.["catalogId"];
  if (typeof id !== "string") throw new Error("brightway-park: scene marker missing meta.catalogId");
  return id;
}

/**
 * The starter-park placement order, derived from `editor.scene.json`. Rides and stalls seed first,
 * then the coaster's `route` path becomes track pieces, then the remaining scenery and path markers.
 * Coordinates live only in the authored document — this reads them back in that order.
 */
export function seedPlacements(): SeedPlacement[] {
  const rides: SeedPlacement[] = [];
  const rest: SeedPlacement[] = [];
  for (const marker of editorLayers.markers) {
    const catalogId = markerCatalogId(marker.meta);
    const category = buildableDef(catalogId).category;
    const target = category === "ride" || category === "stall" ? rides : rest;
    const [x, z] = editorMarkerXZ(marker);
    target.push({ catalogId, x, z });
  }
  const track = editorLayers.paths.find((path) => path.id === TRACK_PATH_ID);
  const trackPieces: SeedPlacement[] = (track?.points ?? []).map((point) => ({ catalogId: "track_piece", x: point.x, z: point.z }));
  return [...rides, ...trackPieces, ...rest];
}

/** The paved plaza inside the gate a new park opens with: two path cells the player builds out from. */
export const GATE_PLAZA: readonly (readonly [number, number])[] = [[14, 27], [14, 28]];

/**
 * What a reset lays down:
 * - `lot`: a new game - the empty lot, the gate plaza, the gate shut and nobody inside;
 * - `starter`: the authored starter park from `editor.scene.json` with a crowd already in it (the
 *   capture staging and the screenshots of a running park);
 * - `blank`: nothing at all, for a save to be restored into.
 */
export type ResetLayout = "lot" | "starter" | "blank";

export interface ResetOptions {
  /** Cash the fresh park opens with; the catalog default when omitted. */
  cash?: number;
  /** Default `lot`. */
  layout?: ResetLayout;
  /** The crowd a `starter` park opens with. */
  guests?: number;
}

/**
 * Empty the live park and start again: every structure and body leaves the scene, the world store
 * starts over from its declaration, and the ride sim and agents are rebuilt. A new park, a scenario
 * start and a scenario replay all come through here, so they cannot drift apart.
 */
export function resetPark(ctx: GameContext, options: ResetOptions = {}): void {
  for (const instance of park.of(ctx).instances()) ctx.scene.object.remove(instance.id);
  for (const guest of session.guests.values()) ctx.scene.entity.despawn(guest.id);
  for (const staff of session.staff.values()) ctx.scene.entity.despawn(staff.id);
  ctx.scene.entity.selection.clear();
  resetSession();
  resetRides();
  resetGuestAgents();
  const w = freshWorld(ctx, options.cash);
  // A fresh park's calendar starts again: 09:00 on 1 March, day one, the next midnight from there.
  ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_START });
  resetDayLoop(ctx);
  armMidnight(ctx);
  const layout = options.layout ?? "lot";
  if (layout === "lot") {
    for (const cell of GATE_PLAZA) placeFree(w, "path_walk", cell);
  } else if (layout === "starter") {
    for (const placement of seedPlacements()) placeFree(w, placement.catalogId, cellFor(placement.catalogId, placement.x, placement.z));
    w.set("park.gate", true);
    seedGuests(ctx, options.guests ?? 24);
  }
  spawnAll(ctx);
}

/** Begin a scenario from a fresh park: the world starts over and its job's mission starts the clock. */
export function beginScenario(ctx: GameContext, id: string): boolean {
  const scenario = scenarioDef(id);
  if (scenario === null || scenarioLock(id) !== null) return false;
  resetPark(ctx, { cash: scenario.cash });
  restartHints(ctx);
  const w = park.of(ctx);
  w.set("scenario.id", id);
  if (w.startJob(id) === null) return false;
  session.started = true;
  setGamePhase(ctx, "playing");
  ctx.time.play();
  syncAmbience(ctx);
  savePark(ctx);
  return true;
}

/** Leave the scenario and keep the park as a free-play sandbox. */
export function endScenario(ctx: GameContext): void {
  const w = park.of(ctx);
  if (w.fact("scenario.id") === "") return;
  if (w.missionView() !== null) w.abandonJob();
  w.set("scenario.id", "");
  w.set("scenario.result", "");
  w.set("scenario.reason", "");
  w.change({ "park.scenario_visitors": -w.num("park.scenario_visitors"), "park.scenario_revenue": -w.num("park.scenario_revenue") });
  session.started = true;
  setGamePhase(ctx, "playing");
  ctx.time.play();
  syncAmbience(ctx);
  savePark(ctx);
}

/** Replay the current scenario from a fresh park. */
export function replayScenario(ctx: GameContext): boolean {
  const id = park.of(ctx).fact("scenario.id");
  return typeof id === "string" && id !== "" && beginScenario(ctx, id);
}

/** The HUD's read of the active run: goal, countdown and result, all from the world. */
export function scenarioView(ctx: GameContext): {
  title: string;
  goal: string;
  remaining: number | null;
  duration: number | null;
  result: "won" | "failed" | null;
  reason: string | null;
  revenue: number;
  visitors: number;
  cash: number;
} | null {
  const w = park.of(ctx);
  const id = w.fact("scenario.id");
  const def = typeof id === "string" ? scenarioDef(id) : null;
  if (def === null) return null;
  const result = w.fact("scenario.result");
  const reason = w.fact("scenario.reason");
  return {
    title: def.title,
    goal: def.goal,
    remaining: w.missionView()?.remaining ?? null,
    duration: scenarioSeconds(def.months),
    result: result === "won" || result === "failed" ? result : null,
    reason: typeof reason === "string" && reason !== "" ? reason : null,
    revenue: w.num("park.scenario_revenue"),
    visitors: w.num("park.scenario_visitors"),
    cash: w.num("park.cash"),
  };
}
