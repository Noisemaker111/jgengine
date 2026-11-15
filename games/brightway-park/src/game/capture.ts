import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { actionContextStack } from "@jgengine/core/game/controlGate";

import { CLOSE_FRACTION, DAY_LENGTH, OPEN_FRACTION, guestCap } from "./catalog";
import { resetPark } from "./parkReset";
import { savePark } from "./persistence";
import { captureParkThumb } from "./parkProfile";
import { refreshParkSlot } from "./parkSlot";
import { parkFocus } from "./ui/menu/ParkMenu";
import { hintRing } from "./ui/hintRing";
import { currentHint } from "./onboarding";
import { session } from "./session";
import { syncAmbience } from "./audio";
import { tickRating } from "./sim/economy";
import { seedGroup, spawnGuests, tickGuests, tickRidePark } from "./sim/guests";
import { tickStaff } from "./staff";
import { BLUE_RIBBON } from "./milestones";
import { park, parkMetrics } from "./park";
import { BUILDABLES } from "./objects/catalog";
import { breakRide, syncRidePark } from "./rides";
import { tickScares } from "./scares";
import { armMidnight } from "./midnight";
import { residentCount, tickGhosts } from "./ghosts";
import { tickExorcist } from "./threats";

/** What a staged park should look like when the capture takes it. */
export type StageMode = "full" | "dusk" | "dawn";

/** Where in the clock day each staged night stands: just after dusk, deep night, the grey before dawn. */
const STAGE_TIME: Record<StageMode, number> = { dusk: 0.255, full: 0.5, dawn: 0.76 };

const STEP = 1 / 20;

function updateOpenState(ctx: GameContext): void {
  const w = park.of(ctx);
  const fraction = ctx.time.calendar().dayFraction;
  const wantOpen = w.fact("park.gate") === true && w.fact("park.game_over") !== true && fraction >= OPEN_FRACTION && fraction <= CLOSE_FRACTION;
  if (wantOpen === (w.fact("park.open") === true)) return;
  w.set("park.open", wantOpen);
  if (wantOpen) ctx.game.audio.play("gates");
}

/**
 * One tick of a live park, shared by the frame loop and the staging that fast-forwards a day, so
 * both advance exactly the same systems.
 */
export function stepPark(ctx: GameContext, dt: number): void {
  syncAmbience(ctx);
  const w = park.of(ctx);
  if (!session.started || w.fact("park.game_over") === true || dt <= 0) return;
  updateOpenState(ctx);
  const metrics = parkMetrics(w);
  // The rides run their own cycles and lines; their boardings, breakdowns and repairs land on
  // the guests and the world through the sink in `sim/guests`.
  tickRidePark(ctx, dt);
  spawnGuests(ctx, dt, metrics.totalAppeal);
  tickStaff(ctx, dt);
  tickGuests(ctx, dt, metrics.tracks);
  // The props jolt whoever walks into reach; the ghosts look the park over and move in or out.
  tickScares(ctx);
  tickGhosts(ctx, dt);
  tickExorcist(ctx, dt);
  tickRating(ctx, dt, metrics);
  // A ghost paradise is free play's own goal; a scenario is a world job with its own win and fail.
  if (w.fact("scenario.id") === "" && w.fact("park.won") !== true && metrics.rides >= BLUE_RIBBON.rides && w.num("park.rating") >= BLUE_RIBBON.rating && residentCount(w) >= BLUE_RIBBON.ghosts &&
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

/**
 * Dev-only staging for the state that needs a played night: a park at capacity, the gate open, the
 * authored starter rides running lines and the living standing in them. Play reaches this by
 * opening the gate and waiting into the night; `shoot --state full-park` jumps here instead.
 */
export function stagePark(ctx: GameContext, mode: StageMode): void {
  resetPark(ctx, { layout: "starter", guests: guestCap(park.of(ctx).num("park.rating")) });
  // Deep in the night, so the gate, the spawner and the HUD all read "night", not "the living are home" over a full park.
  // The clock only ever moves forward (a renderer that keeps time-based state draws garbage when it
  // jumps back), so it is set to just before the asked hour and the crowd settles in while it runs on.
  const settle = mode === "dusk" ? 5 : 30;
  ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_LENGTH * STAGE_TIME[mode] - settle });
  armMidnight(ctx);
  session.started = true;
  // The night the hunters came: a ghost hunter pair and a TV crew (their van outside) in the crowd.
  if (mode === "full") {
    seedGroup(ctx, "visitor_hunter", 2, [6, 24]);
    seedGroup(ctx, "visitor_tvcrew", 3, [-6, 30]);
  }
  // Let the seeded crowd spread out, board and line up; queues only exist once guests reach a ride.
  advance(ctx, settle);
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

/** Take a ride down now and report it, exactly as the ride sim's own breakdown would. */
export function forceBreakdown(ctx: GameContext, id: string): boolean {
  syncRidePark(ctx);
  if (!breakRide(id)) return false;
  park.emit(ctx, { kind: "breakdown", by: id });
  return true;
}

/** What the drive reads back (`globalThis.__brightway.read()`): the world's numbers, the rides, the crew and the ghosts. */
export function parkReadout(ctx: GameContext): Record<string, unknown> {
  const w = park.of(ctx);
  const metrics = parkMetrics(w);
  const rides = w.instances().filter((entry) => BUILDABLES[entry.kind]?.ride !== undefined);
  return {
    started: session.started,
    cash: Math.round(w.num("park.cash")),
    revenueToday: Math.round(w.num("park.revenue_today")),
    screams: w.num("park.screams"),
    ghosts: residentCount(w),
    evidence: Math.round(w.num("park.evidence")),
    rating: Math.round(w.num("park.rating") * 10) / 10,
    mood: Math.round(w.num("park.mood") * 10) / 10,
    buzz: Math.round(w.num("park.buzz") * 10) / 10,
    guests: session.guests.size,
    breakdowns: w.num("park.breakdowns"),
    rides: metrics.rides,
    ridesOpen: metrics.ridesOpen,
    totalAppeal: metrics.totalAppeal,
    broken: rides.filter((entry) => w.fact(`${entry.id}.broken`) === true).map((entry) => entry.id),
    rideIds: rides.map((entry) => entry.id),
    crew: w.orders("crew").map((order) => ({ target: order.target, progress: Math.round(order.progress * 100) / 100, active: order.active })),
    selected: session.selectedObject,
    tool: session.selectedTool,
    controls: actionContextStack(ctx).ids(),
    // A few live guests with something on their mind, so a drive can pick one the way a click does.
    thinkingGuests: [...session.guests.values()].filter((guest) => (guest.thoughts?.length ?? 0) > 0).slice(0, 12).map((guest) => guest.id),
    structures: w.instances().length,
    // What the crowd is doing and which rides are shut: the drive reads it to check guests reach rides.
    phases: [...session.guests.values()].reduce<Record<string, number>>((acc, guest) => ({ ...acc, [guest.phase]: (acc[guest.phase] ?? 0) + 1 }), {}),
    heading: [...session.guests.values()].reduce<Record<string, number>>((acc, guest) => (guest.targetId === null ? acc : { ...acc, [guest.targetId]: (acc[guest.targetId] ?? 0) + 1 }), {}),
    shut: rides.filter((entry) => w.fact(`${entry.id}.closed`) === true).map((entry) => entry.id),
    // The first scenario's step and the control its ring is on (`ui/hintRing.ts`), as the HUD shows them.
    hint: currentHint(ctx)?.id ?? null,
    pointed: hintRing.pointed,
  };
}

export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  (globalThis as { __brightway?: { read(): Record<string, unknown> } }).__brightway = { read: () => parkReadout(ctx) };
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
      session.selectedTool = null;
      session.selectedObject = park.of(state).instances(input.kind).at(-1)?.id ?? null;
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
      void captureParkThumb().then(() => {
        savePark(state);
        refreshParkSlot();
      });
      return state;
    },
  });
  ctx.game.commands.define("menu.title", {
    apply(state) {
      parkFocus.id = null;
      session.started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
  ctx.game.commands.define("menu.saves", {
    apply(state) {
      parkFocus.id = "saves";
      session.started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
  ctx.game.commands.define("menu.new", {
    apply(state) {
      parkFocus.id = "new";
      session.started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
}


