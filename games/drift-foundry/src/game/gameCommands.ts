import { rebindAction } from "@jgengine/core/game/controlGate";
import type { ActionCodes } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import { runSessionStore } from "./run/session";
import { createCoursePilot, sessionTrack } from "./testing/courseDriver";
import { raceHud } from "./ui/hudModel";

/** A pane of the customer-service menu a command (or a choice) put up, mirrored into the menu. */
export const MENU_PANES = ["continue", "new", "calendar", "corral", "garage", "records", "settings", "credits"] as const;
export type MenuPaneId = (typeof MENU_PANES)[number];
export const menuPaneStore = defineStore<MenuPaneId | null>("aisleMenuPane", null);

const STEP = 1 / 60;

/**
 * The player's verbs as commands, so the menus, a capture, a flow and a suite proof all run the same
 * paths: show a menu pane, pause, park the cart and go back to customer service, rebind a control.
 * `cheat.drive` is setup only: the course driver at the handle until a run mark or a clock.
 */
export function registerGameCommands(ctx: GameContext): void {
  ctx.game.commands.define<{ pane: MenuPaneId | null }>("menu.pane", {
    apply(state, input) {
      menuPaneStore.write(state, input.pane !== null && MENU_PANES.includes(input.pane) ? input.pane : null);
      return state;
    },
  });
  ctx.game.commands.define("pause", {
    apply(state) {
      runSessionStore.peek(state)?.togglePause();
      return state;
    },
  });
  ctx.game.commands.define("cup.start", {
    apply(state) {
      runSessionStore.peek(state)?.startCup();
      return state;
    },
  });
  ctx.game.commands.define("run.park", {
    apply(state) {
      runSessionStore.peek(state)?.returnToTitle();
      return state;
    },
  });
  ctx.game.commands.define<{ action: string; codes: ActionCodes | null }>("settings.rebind", {
    apply(state, input) {
      rebindAction(state, input.action, input.codes);
      return state;
    },
  });
  ctx.game.commands.define<{ toRun?: number; seconds?: number; event?: string; shop?: boolean; sweep?: boolean; credits?: number }>("cheat.drive", {
    apply(state, input) {
      const session = runSessionStore.peek(state);
      if (session === undefined) return state;
      if (input.event !== undefined && session.selectEvent(input.event).ok) session.start();
      if (session.snapshot().phase === "start") session.start();
      const pilot = createCoursePilot(sessionTrack(session), { shop: input.shop === true, sweep: input.sweep !== false });
      const limit = input.seconds ?? 120;
      for (let t = 0; t < limit; t += STEP) {
        const snap = session.snapshot();
        if (snap.phase !== "running" || (input.toRun !== undefined && snap.run >= input.toRun)) break;
        const frame = pilot(snap);
        session.tick(STEP, frame.axis, frame.input);
      }
      return state;
    },
  });
}

const PHASE_CODE = { start: 0, running: 1, won: 3, crushed: 4 } as const;
const READING_KEYS = ["phase", "run", "speed", "heading", "airborne", "lap", "laps", "lapTime", "finished", "place", "total", "rivalRun", "rivalsFinished", "goal", "blocked", "gates", "mods", "items", "powerUps", "value", "shelves", "style", "boost", "riding", "damage", "gap", "atRisk", "credits", "points", "tiersOpen", "cartsOwned", "runs", "escapes", "receipt", "finishTime", "parked", "menuPane", "tip", "tipSide", "jumpNow", "powersUsed", "cupActive", "cupRound", "cupRank", "cupPoints", "cupsWon", "secrets"] as const;
/** Every reading at zero, before the session exists. */
const EMPTY = Object.fromEntries(READING_KEYS.map((key) => [key, 0])) as Record<(typeof READING_KEYS)[number], number>;

/** Every reading a proof, a flow or a drive checks, as numbers off the live session. */
export type AisleProbe = ReturnType<typeof sessionReadings> & { car: number; x: number; y: number; z: number };

export function probeReadings(ctx: GameContext): AisleProbe {
  const car = ctx.scene.entity.get(ctx.player.userId);
  const session = runSessionStore.peek(ctx);
  const base = { car: car === null ? 0 : 1, x: car?.position[0] ?? 0, y: car?.position[1] ?? 0, z: car?.position[2] ?? 0 };
  return { ...base, ...sessionReadings(ctx, session?.snapshot()) };
}

function sessionReadings(ctx: GameContext, snap: ReturnType<NonNullable<ReturnType<typeof runSessionStore.peek>>["snapshot"]> | undefined): Record<(typeof READING_KEYS)[number], number> {
  if (snap === undefined) return EMPTY;
  return readingsOf(ctx, snap);
}

function readingsOf(ctx: GameContext, snap: NonNullable<Parameters<typeof sessionReadings>[1]>): Record<(typeof READING_KEYS)[number], number> {
  const player = snap.race.standings.find((entry) => entry.id === "player");
  const hud = snap.phase === "running" ? raceHud(snap) : null;
  return {
    phase: snap.phase === "running" && snap.paused ? 2 : PHASE_CODE[snap.phase],
    run: Math.round(snap.run * 10) / 10,
    speed: Math.round(snap.pose.speedKmh * 10) / 10,
    heading: Math.round(snap.pose.heading * 1000) / 1000,
    airborne: snap.pose.airborne ? 1 : 0,
    lap: snap.race.lap,
    laps: snap.race.laps,
    lapTime: Math.round(snap.race.lapTime * 10) / 10,
    finished: player?.finished === true ? 1 : 0,
    place: snap.race.place,
    total: snap.race.total,
    rivalRun: Math.round(Math.max(0, ...snap.rivals.filter((rival) => !rival.blocker).map((rival) => rival.run)) * 10) / 10,
    rivalsFinished: snap.race.standings.filter((entry) => entry.id !== "player" && entry.finished).length,
    goal: hud === null ? 0 : hud.sign.call.length > 0 ? 1 : 0,
    blocked: snap.pose.blockedByGate || snap.gateAdvice !== null ? 1 : 0,
    gates: [...snap.clearedGateIds].filter((id) => !id.endsWith(":beaten")).length,
    mods: Object.values(snap.installed).filter((part) => part !== null).length,
    items: snap.basket.goods.length,
    powerUps: snap.basket.powerUps.length,
    value: Math.round(snap.basket.value),
    shelves: snap.shelvesTaken.size,
    style: snap.style.points,
    boost: snap.boostLeft > 0 ? 1 : 0,
    riding: snap.riding ? 1 : 0,
    damage: Math.max(0, ...snap.damage.map((zone) => zone.stage)),
    gap: Math.round(snap.compactorGap * 10) / 10,
    atRisk: snap.salvageAtRisk,
    credits: snap.career.credits,
    points: snap.calendar.points,
    tiersOpen: snap.calendar.tiers.filter((tier) => tier.open).length,
    cartsOwned: snap.corral.filter((row) => row.owned).length,
    runs: snap.runsPlayed,
    escapes: snap.records.escapes,
    receipt: snap.outcome?.receipt?.total ?? 0,
    tip: hud?.tip === null || hud === null ? 0 : hud.tip.kind === "grab" ? 1 : hud.tip.kind === "power" ? 2 : 3,
    tipSide: hud?.tip?.side ?? 0,
    jumpNow: hud?.jumpNow === true ? 1 : 0,
    powersUsed: snap.powersUsed,
    cupActive: snap.cup.active ? 1 : 0,
    cupRound: snap.cup.roundNumber,
    cupRank: snap.cup.standings.find((row) => row.id === "player")?.rank ?? 0,
    cupPoints: snap.cup.standings.find((row) => row.id === "player")?.points ?? 0,
    cupsWon: snap.cup.won,
    secrets: snap.secrets.found,
    finishTime: snap.outcome?.kind === "won" ? Math.round(snap.outcome.time * 10) / 10 : 0,
    parked: snap.parkedRun === null ? 0 : 1,
    menuPane: (() => {
      const pane = menuPaneStore.peek(ctx) ?? null;
      return pane === null ? 0 : MENU_PANES.indexOf(pane) + 1;
    })(),
  };
}
