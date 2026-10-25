import { findEditorMarker } from "@jgengine/core/editor/document";
import {
  applyMissionRewards,
  createMissionRuntime,
  type MissionDef,
  type MissionEvent,
  type MissionRuntimeSnapshot,
  type MissionWorldEvent,
} from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { rememberHome } from "./entities/enemies/ai";
import { earn } from "./cash";
import { reservePhase } from "./handroll";
import { grantXp } from "./progression/curves";
import { authoredScene } from "./world/level";

/** Authored sites the contract reads: the board the player accepts at and the mast it defends. */
export const MAST_BOARD = "signal_mast_board";
export const MAST_SITE = "signal_mast_rustflat";
export const MAST_WATCH_ID = "mast_watch";
export const MAST_HOLD_SECONDS = 60;
const GUARD_SECONDS = 45;
const START_RADIUS = 5;

export const MAST_WATCH: MissionDef = {
  id: MAST_WATCH_ID,
  title: "Mast Watch",
  description: "Rustflat's signal mast is dark and something is nesting in the dish.",
  start: "reach_mast",
  objectives: [
    {
      id: "reach_mast",
      kind: "reach",
      actor: "player",
      marker: MAST_SITE,
      radius: 6,
      label: "Reach the signal mast west of the crash site",
      next: "clear_guard",
    },
    {
      id: "clear_guard",
      kind: "kill",
      count: 2,
      match: { kind: "kill", target: "ripper_pup", tags: ["pistol"] },
      label: "Drop 2 mast guards with a sidearm",
      timeout: GUARD_SECONDS,
      onTimeout: "mast_cold",
      failOn: [{ kind: "fact", fact: "chassis", is: "down", to: "mast_lost", message: "Your chassis went down at the mast." }],
      next: "hold_mast",
    },
    {
      id: "hold_mast",
      kind: "survive",
      duration: MAST_HOLD_SECONDS,
      label: "Hold the mast for 60s",
      failOn: [
        { kind: "left-area", actor: "player", marker: MAST_SITE, radius: 16, to: "mast_lost", message: "You left the mast ring and the uplink dropped." },
        { kind: "fact", fact: "chassis", is: "down", to: "mast_lost", message: "Your chassis went down at the mast." },
      ],
      next: "done",
    },
  ],
  fail: [
    { id: "mast_cold", message: "The mast went cold: its guards were still standing when the window closed." },
    { id: "mast_lost", message: "The uplink dropped before the carrier locked." },
  ],
  rewards: { economy: { cash: 450, cores: 2 } },
};

/** Plain read-model the HUD renders — a copy of the runtime's pooled view, never the view itself. */
export interface MastReadout {
  title: string;
  status: "active" | "completed" | "failed";
  label: string;
  remaining: number | null;
  counted: number;
  count: number;
  step: number;
  steps: number;
  outcome: string | null;
  reason: string | null;
}

export const mastSnapshotStore = defineStore<MissionRuntimeSnapshot | null>("mast.watch", null);
export const mastReadoutStore = defineStore<MastReadout | null>("mast.watch.readout", null);

/** Markers are authored at y=0; the machine measures proximity in 3D, so each one is lifted to the live ground it sits on. */
function groundedMarkers(ctx: GameContext): Record<string, { x: number; y: number; z: number }> {
  const out = missionMarkers(authoredScene);
  for (const marker of Object.values(out)) marker.y = ctx.world.groundHeightAt(marker.x, marker.z);
  return out;
}

const runtimes = perContext((ctx: GameContext) =>
  createMissionRuntime({
    missions: [MAST_WATCH],
    markers: groundedMarkers(ctx),
    devtoolsName: "scrap-signal mast",
  }),
);

/** Kills reported this frame, handed to the mission machine next tick. */
const pendingKills = perContext(() => [] as MissionWorldEvent[]);

export function mastRuntime(ctx: GameContext) {
  return runtimes(ctx);
}

function sitePosition(id: string): { x: number; z: number } | null {
  const marker = findEditorMarker(authoredScene, id);
  return marker === undefined ? null : { x: marker.position.x, z: marker.position.z };
}

function syncReadout(ctx: GameContext): void {
  const view = mastRuntime(ctx).view();
  if (view === null) {
    mastReadoutStore.write(ctx, null);
    return;
  }
  mastReadoutStore.write(ctx, {
    title: view.title,
    status: view.status,
    label: view.label,
    remaining: view.remaining,
    counted: view.counted,
    count: view.count,
    step: view.step,
    steps: view.steps,
    outcome: view.outcome,
    reason: view.reason,
  });
}

function commit(ctx: GameContext): void {
  mastSnapshotStore.write(ctx, mastRuntime(ctx).snapshot());
  syncReadout(ctx);
}

/**
 * Record a player kill for the mission's constrained objective: only a sidearm kill on a mast guard
 * counts, so the tag the contract filters on is the weapon family that dealt it.
 */
export function noteMastKill(ctx: GameContext, target: string, userId: string, weaponFamily: string): void {
  pendingKills(ctx).push({ kind: "kill", target, by: userId, tags: [weaponFamily] });
}

function spawnGuard(ctx: GameContext, site: { x: number; z: number }, index: number): void {
  const angle = (index / 2) * Math.PI + Math.PI / 4;
  const x = site.x + Math.cos(angle) * 6;
  const z = site.z + Math.sin(angle) * 6;
  const position: [number, number, number] = [x, ctx.world.groundHeightAt(x, z), z];
  const id = `mast_guard_${index}`;
  if (ctx.scene.entity.get(id) !== null) return;
  ctx.scene.entity.spawn("ripper_pup", { id, position });
  rememberHome(ctx, id, position);
}

function spawnHoldWave(ctx: GameContext, site: { x: number; z: number }): void {
  const wave = ["ripper_pup", "bruiser_brat", "ripper_pup"] as const;
  wave.forEach((catalogId, index) => {
    const angle = (index / wave.length) * Math.PI * 2 - Math.PI / 2;
    const x = site.x + Math.cos(angle) * 13;
    const z = site.z + Math.sin(angle) * 13;
    const id = `mast_hold_${index}`;
    if (ctx.scene.entity.get(id) !== null) return;
    const position: [number, number, number] = [x, ctx.world.groundHeightAt(x, z), z];
    ctx.scene.entity.spawn(catalogId, { id, position });
    rememberHome(ctx, id, position);
  });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "MAST AWAKE — HOLD THE RING", kind: "warn" });
}

function clearMastActors(ctx: GameContext): void {
  for (const entity of ctx.scene.entity.list()) {
    if (entity.id.startsWith("mast_guard_") || entity.id.startsWith("mast_hold_")) ctx.scene.entity.despawn(entity.id);
  }
}

function handleEvents(ctx: GameContext, events: readonly MissionEvent[]): void {
  const site = sitePosition(MAST_SITE);
  for (const event of events) {
    if (event.kind === "objective") {
      if (event.objectiveId === "clear_guard" && site !== null) {
        spawnGuard(ctx, site, 0);
        spawnGuard(ctx, site, 1);
      }
      if (event.objectiveId === "hold_mast" && site !== null) spawnHoldWave(ctx, site);
    } else if (event.kind === "reward") {
      applyMissionRewards(event.rewards, {
        grantEconomy: (currencyId, amount) => earn(ctx, currencyId, amount, "mast-reward", "mast-watch"),
        grantXp: (amount) => grantXp(ctx, ctx.player.userId, amount),
      });
    } else if (event.kind === "completed") {
      clearMastActors(ctx);
      ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "MAST WATCH COMPLETE", kind: "pickup" });
      void ctx.game.save?.checkpoint();
    } else if (event.kind === "failed") {
      clearMastActors(ctx);
      ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "MAST WATCH FAILED", kind: "warn" });
      void ctx.game.save?.checkpoint();
    }
  }
}

export function tickMastWatch(ctx: GameContext, dt: number): void {
  const runtime = mastRuntime(ctx);
  const events = pendingKills(ctx).splice(0);
  const state = runtime.state();
  if (state === null) return;
  if (state.status !== "active") return;
  const position = ctx.scene.entity.get(ctx.player.userId)?.position;
  if (position === undefined) return;
  const fired = runtime.tick(dt, {
    actors: {
      player: { position: { x: position[0], y: position[1], z: position[2] }, alive: reservePhase(ctx) !== "dead" },
    },
    facts: { chassis: reservePhase(ctx) === "alive" ? "up" : "down" },
    events,
  });
  handleEvents(ctx, fired);
  commit(ctx);
}

/** Rebuild the runtime over a restored whole-world save: the store holds the last committed snapshot. */
export function restoreMastWatch(ctx: GameContext): void {
  const snapshot = mastSnapshotStore.read(ctx);
  if (snapshot !== null) mastRuntime(ctx).restore(snapshot);
  syncReadout(ctx);
}

export function registerMastWatch(ctx: GameContext): void {
  ctx.game.commands.define("mast.start", {
    apply(state: GameContext) {
      if (mastRuntime(state).state()?.status === "active") return;
      const position = state.scene.entity.get(state.player.userId)?.position;
      const board = sitePosition(MAST_BOARD);
      if (position === undefined || board === null) return;
      if (Math.hypot(position[0] - board.x, position[2] - board.z) > START_RADIUS) return;
      mastRuntime(state).start(MAST_WATCH_ID);
      state.scene.entity.floatText({ instanceId: state.player.userId, text: "MAST WATCH ACCEPTED", kind: "pickup" });
      commit(state);
      void state.game.save?.checkpoint();
    },
  });
  ctx.game.commands.define("mast.dismiss", {
    apply(state: GameContext) {
      mastRuntime(state).abandon();
      commit(state);
    },
  });
}
