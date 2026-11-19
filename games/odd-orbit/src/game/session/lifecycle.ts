import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";

import { WORLD_SEED } from "../../world";
import { setupWorld } from "../sim/setup";
import { resetAgents, resetBook } from "../agents";
import { perContext } from "@jgengine/core/runtime/perContext";
import { ORBIT_SLOTS, orbitProfile, orbitRecords } from "./save";
import { probeShift } from "./shiftSessions";
import { householdStore } from "./store";
import { createHousehold } from "./types";

export interface OrbitSession {
  screen: "menu" | "paused" | null;
  canContinue: boolean;
  saveStatus: "ready" | "saved" | "unavailable" | "damaged";
  initialClock: ClockSnapshot | null;
  lastSavedAt: number;
  slot: string;
}

export const orbitSession = defineStore<OrbitSession>("odd-orbit.session", () => ({
  screen: "menu", canContinue: false, saveStatus: "ready", initialClock: null, lastSavedAt: 0, slot: ORBIT_SLOTS[0],
}));

export async function newestOrbitSave(ctx: GameContext): Promise<{ slot: string | null; damaged: boolean; unavailable: boolean }> {
  let newest: { slot: string; at: number } | null = null;
  let damaged = false;
  let unavailable = false;
  for (const slot of ORBIT_SLOTS) {
    const read = await orbitRecords(ctx).read(slot);
    damaged ||= read.damaged;
    unavailable ||= read.unavailable;
    const at = read.save?.profile?.savedAt ?? 0;
    if (read.save !== null && (newest === null || at > newest.at)) newest = { slot, at };
  }
  return { slot: newest?.slot ?? null, damaged, unavailable };
}

export async function checkpointOrbit(ctx: GameContext): Promise<void> {
  const session = orbitSession.read(ctx);
  if (!session.canContinue || ctx.player.userId === "ui-preview") return;
  orbitProfile.savedAt = ctx.wallClock();
  const written = orbitRecords(ctx).write(session.slot);
  orbitSession.write(ctx, { ...session, lastSavedAt: ctx.time.now() });
  const saved = await written;
  orbitSession.update(ctx, current => ({ ...current, saveStatus: saved ? "saved" : "unavailable" }));
}

const boot = perContext(() => ({ ready: Promise.resolve() }));

export function orbitReady(ctx: GameContext): Promise<void> {
  return boot(ctx).ready;
}

export function prepareOrbit(ctx: GameContext): Promise<void> {
  const initialClock = ctx.time.snapshot();
  ctx.time.pause();
  orbitSession.write(ctx, { screen: "menu", canContinue: false, saveStatus: "ready", initialClock, lastSavedAt: ctx.time.now(), slot: ORBIT_SLOTS[0] });
  setGamePhase(ctx, "menu");
  const opening = orbitSession.read(ctx);
  const ready = (async () => {
    if (ctx.player.userId === "ui-preview") return;
    const found = await newestOrbitSave(ctx);
    if (orbitSession.read(ctx) !== opening) return;
    const opened = found.slot !== null && await orbitRecords(ctx).open(found.slot);
    if (orbitSession.read(ctx) !== opening) return;
    ctx.time.pause();
    orbitSession.write(ctx, {
      ...opening, canContinue: opened,
      saveStatus: found.unavailable ? "unavailable" : found.damaged ? "damaged" : opened ? "saved" : "ready",
      lastSavedAt: ctx.time.now(), slot: found.slot ?? ORBIT_SLOTS[0],
    });
  })();
  boot(ctx).ready = ready;
  return ready;
}

export function startOrbit(ctx: GameContext, slot: string = ORBIT_SLOTS[0], name = ""): Promise<void> {
  const session = orbitSession.read(ctx);
  ctx.hydrate({ objects: [], entities: [] });
  resetAgents();
  resetBook();
  householdStore.write(ctx, createHousehold(WORLD_SEED));
  orbitProfile.name = name.trim().slice(0, 40);
  orbitProfile.thumbnail = null;
  if (session.initialClock !== null) ctx.time.hydrate(session.initialClock);
  setupWorld(ctx);
  // The household's shift session is mounted with the world, so its probe reports from boot.
  const first = householdStore.read(ctx).order[0];
  if (first !== undefined) probeShift(ctx, first);
  ctx.time.play();
  orbitSession.write(ctx, { ...session, screen: null, canContinue: true, slot });
  setGamePhase(ctx, "playing");
  return checkpointOrbit(ctx);
}

export async function resumeOrbit(ctx: GameContext, slot?: string): Promise<void> {
  if (slot !== undefined && slot !== orbitSession.read(ctx).slot && !(await orbitRecords(ctx).open(slot))) return;
  const session = orbitSession.read(ctx);
  if (!session.canContinue && slot === undefined) return;
  orbitSession.write(ctx, { ...session, screen: null, canContinue: true, slot: slot ?? session.slot });
  ctx.time.play();
  setGamePhase(ctx, "playing");
  await checkpointOrbit(ctx);
}

export function pauseOrbit(ctx: GameContext): void {
  const session = orbitSession.read(ctx);
  if (session.screen !== null) return;
  void checkpointOrbit(ctx);
  ctx.time.pause();
  orbitSession.update(ctx, current => ({ ...current, screen: "paused" }));
  setGamePhase(ctx, "paused");
}

export function withdrawOrbit(ctx: GameContext): void {
  void checkpointOrbit(ctx);
  ctx.time.pause();
  orbitSession.update(ctx, current => ({ ...current, screen: "menu" }));
  setGamePhase(ctx, "menu");
}

export function registerOrbitLifecycle(ctx: GameContext): void {
  const define = <I>(name: string, action: (state: GameContext, input: I) => void) =>
    ctx.game.commands.define<I>(name, { apply: (state, input) => { action(state, input); return state; } });
  define<{ slot?: string; name?: string }>("orbit.new", (state, input) => void startOrbit(state, input?.slot, input?.name ?? ""));
  define<{ slot?: string }>("orbit.continue", (state, input) => void resumeOrbit(state, input?.slot));
  define<{ slot?: string }>("orbit.resume", (state, input) => void resumeOrbit(state, input?.slot));
  define<Record<string, never>>("orbit.pause", state => pauseOrbit(state));
  define<Record<string, never>>("orbit.title", state => withdrawOrbit(state));
  define<Record<string, never>>("orbit.checkpoint", state => void checkpointOrbit(state));
}
