import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { CLOSE_FRACTION, DAY_LENGTH, OPEN_FRACTION, guestCap } from "./catalog";
import { resetPark } from "./parkReset";
import { savePark } from "./persistence";
import { captureParkThumb } from "./parkProfile";
import { refreshParkSlot } from "./parkSlot";
import { parkFocusOf } from "./ui/menu/ParkMenu";
import { hintRingOf } from "./ui/hintRing";
import { currentHint } from "./onboarding";
import { sessionOf } from "./session";
import { syncAmbience } from "./audio";
import { tickRating } from "./sim/economy";
import { spawnGuests, tickGuests, tickRidePark } from "./sim/guests";
import { tickStaff } from "./staff";
import { BLUE_RIBBON } from "./milestones";
import { park, parkMetrics } from "./park";
import { BUILDABLES } from "./objects/catalog";
import { breakRide, syncRidePark } from "./rides";
import { publishForContext } from "@jgengine/core/runtime/contextDisposal";

declare module "@jgengine/core/runtime/pageHandle" {
  interface JgPage {
    brightway?: { read(): unknown };
  }
}

export type StageMode = "full";

const STEP = 1 / 20;

function updateOpenState(ctx: GameContext): void {
  const w = park.of(ctx);
  const fraction = ctx.time.calendar().dayFraction;
  const wantOpen = w.fact("park.gate") === true && w.fact("park.game_over") !== true && fraction >= OPEN_FRACTION && fraction <= CLOSE_FRACTION;
  if (wantOpen === (w.fact("park.open") === true)) return;
  w.set("park.open", wantOpen);
  if (wantOpen) ctx.game.audio.play("gates");
}

export function stepPark(ctx: GameContext, dt: number): void {
  syncAmbience(ctx);
  const w = park.of(ctx);
  if (!sessionOf(ctx).started || w.fact("park.game_over") === true || dt <= 0) return;
  updateOpenState(ctx);
  const metrics = parkMetrics(w);
  // The rides run their own cycles and lines; their boardings, breakdowns and repairs land on
  // the guests and the world through the sink in `sim/guests`.
  tickRidePark(ctx, dt);
  spawnGuests(ctx, dt, metrics.totalAppeal);
  tickStaff(ctx, dt);
  tickGuests(ctx, dt, metrics.tracks);
  tickRating(ctx, dt, metrics);
  // The blue ribbon is free play's own goal; a scenario is a world job with its own win and fail.
  if (w.fact("scenario.id") === "" && w.fact("park.won") !== true && metrics.rides >= BLUE_RIBBON.rides && w.num("park.rating") >= BLUE_RIBBON.rating &&
      w.num("park.mood") >= BLUE_RIBBON.mood && w.num("park.litter") <= BLUE_RIBBON.litter &&
      w.num("park.day") > 1 && w.num("park.revenue_yesterday") >= w.num("park.upkeep_yesterday")) {
    w.set("park.won", true);
    ctx.time.pause();
    setGamePhase(ctx, "paused");
    syncAmbience(ctx);
    ctx.game.audio.play("ribbon");
    savePark(ctx);
  }
}

export function stagePark(ctx: GameContext, mode: StageMode): void {
  void mode;
  // Past the open fraction so the gates, the spawner and the HUD all read "open", not "closed for
  // the night" over a full park.
  advance(ctx, DAY_LENGTH * 0.27);
  resetPark(ctx, { layout: "starter", guests: guestCap(park.of(ctx).num("park.rating")) });
  sessionOf(ctx).started = true;
  // Let the seeded crowd spread out, board and line up; queues only exist once guests reach a ride.
  advance(ctx, 30);
}

function advance(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    ctx.sim.advance(STEP, (dt) => {
      // The world ticks first, as the frame loop runs it: flows, crew orders, the scenario's clock.
      park.system.update?.(ctx, dt);
      stepPark(ctx, dt);
    });
  }
}

export function forceBreakdown(ctx: GameContext, id: string): boolean {
  syncRidePark(ctx);
  if (!breakRide(ctx, id)) return false;
  park.emit(ctx, { kind: "breakdown", by: id });
  return true;
}

export function parkReadout(ctx: GameContext): Record<string, unknown> {
  const w = park.of(ctx);
  const metrics = parkMetrics(w);
  const rides = w.instances().filter((entry) => BUILDABLES[entry.kind]?.ride !== undefined);
  return {
    started: sessionOf(ctx).started,
    cash: Math.round(w.num("park.cash")),
    revenueToday: Math.round(w.num("park.revenue_today")),
    rating: Math.round(w.num("park.rating") * 10) / 10,
    mood: Math.round(w.num("park.mood") * 10) / 10,
    buzz: Math.round(w.num("park.buzz") * 10) / 10,
    guests: sessionOf(ctx).guests.size,
    breakdowns: w.num("park.breakdowns"),
    rides: metrics.rides,
    ridesOpen: metrics.ridesOpen,
    totalAppeal: metrics.totalAppeal,
    broken: rides.filter((entry) => w.fact(`${entry.id}.broken`) === true).map((entry) => entry.id),
    rideIds: rides.map((entry) => entry.id),
    crew: w.orders("crew").map((order) => ({ target: order.target, progress: Math.round(order.progress * 100) / 100, active: order.active })),
    selected: sessionOf(ctx).selectedObject,
    // A few live guests with something on their mind, so a drive can pick one the way a click does.
    thinkingGuests: [...sessionOf(ctx).guests.values()].filter((guest) => (guest.thoughts?.length ?? 0) > 0).slice(0, 12).map((guest) => guest.id),
    structures: w.instances().length,
    // What the crowd is doing and which rides are shut: the drive reads it to check guests reach rides.
    phases: [...sessionOf(ctx).guests.values()].reduce<Record<string, number>>((acc, guest) => ({ ...acc, [guest.phase]: (acc[guest.phase] ?? 0) + 1 }), {}),
    heading: [...sessionOf(ctx).guests.values()].reduce<Record<string, number>>((acc, guest) => (guest.targetId === null ? acc : { ...acc, [guest.targetId]: (acc[guest.targetId] ?? 0) + 1 }), {}),
    shut: rides.filter((entry) => w.fact(`${entry.id}.closed`) === true).map((entry) => entry.id),
    // The first scenario's step and the control its ring is on (`ui/hintRing.ts`), as the HUD shows them.
    hint: currentHint(ctx)?.id ?? null,
    pointed: hintRingOf(ctx).pointed,
  };
}

export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  publishForContext(ctx, "brightway", { read: () => parkReadout(ctx) });
  // The drive's breakdown: the dice would get there, this gets there on cue.
  ctx.game.commands.define<{ id?: string }>("park.dev.break", {
    apply(state, input) {
      const w = park.of(state);
      const id = input.id ?? w.instances().find((entry) => BUILDABLES[entry.kind]?.ride !== undefined && w.fact(`${entry.id}.broken`) !== true)?.id;
      if (id !== undefined) forceBreakdown(state, id);
      return state;
    },
  });
  // The drive inspects the newest structure of a kind, the way a click on it would.
  ctx.game.commands.define<{ kind: string }>("park.dev.select", {
    apply(state, input) {
      sessionOf(ctx).selectedTool = null;
      sessionOf(ctx).selectedObject = park.of(state).instances(input.kind).at(-1)?.id ?? null;
      return state;
    },
  });
  ctx.game.commands.define<{ mode?: StageMode }>("park.stage", {
    apply(state, input) {
      stagePark(state, input.mode ?? "full");
      return state;
    },
  });
  // The menu states a capture host reaches: keep the park, stand at the gate.
  ctx.game.commands.define("menu.saveDoc", {
    apply(state) {
      void captureParkThumb()
        .then(() => savePark(state))
        .then(() => refreshParkSlot(state));
      return state;
    },
  });
  ctx.game.commands.define("menu.title", {
    apply(state) {
      parkFocusOf(state).id = null;
      sessionOf(ctx).started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
  ctx.game.commands.define("menu.saves", {
    apply(state) {
      parkFocusOf(state).id = "saves";
      sessionOf(ctx).started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
  ctx.game.commands.define("menu.new", {
    apply(state) {
      parkFocusOf(state).id = "new";
      sessionOf(ctx).started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
}

