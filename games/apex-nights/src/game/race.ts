import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createRaceState, type RaceState } from "@jgengine/core/game/race";
import type { AxisInput } from "@jgengine/core/input/axisInput";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createKinematicVehicle, type KinematicVehicle, type KinematicVehicleModifiers, type KinematicVehicleTuning } from "@jgengine/core/physics/kinematicVehicle";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createSessionLoop, type SessionLoop } from "@jgengine/core/run/sessionLoop";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { boostOf, career, currentRace, fact } from "./spec";
import { circuitOf, gridSlot, headingTo, nearestOnLine, trackOf } from "./track";

/**
 * Each race is one session on the engine's session loop: lining up opens it, the finish settles it
 * with the place, and the settle rule pays. The engine's race state counts checkpoints, laps and
 * places; the arcade vehicle sim moves every car; this file only decides who presses what.
 */

export interface RaceResult {
  place: number;
  pay: number;
  time: number;
  title: string;
}

/** Off the throttle with the handbrake on: brake alone would back a stopped car up. */
const PARKED: AxisInput = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
const COUNTDOWN = 3;
const NITRO_DRAIN = 0.32;
const NITRO_REFILL = 0.06;
/** Share of a race's pay for 1st, 2nd and 3rd. */
const PAYOUT = [1, 0.55, 0.3] as const;

/** The stock car: quick, grippy, forgiving. Upgrades scale it; nothing else does. */
export const BASE: KinematicVehicleTuning = {
  topSpeed: 36,
  engineAccel: 10,
  brakeAccel: 20,
  reverseSpeed: 8,
  turnRate: 1.5,
  turnSpeedRef: 14,
  gripStrength: 9,
  handbrakeGrip: 0.4,
  coastDeceleration: 2.5,
};

export const circuit = circuitOf(editorLayers);

interface Session {
  /** One race = one session: open while lined up or racing, closed once it has paid. */
  loop: SessionLoop<never, { place: number; raceId: string }, number>;
  raceId: string;
  countdown: number;
  clock: number;
  startedAt: number;
  race: RaceState | null;
  cars: Map<string, KinematicVehicle>;
  rivals: string[];
  skill: Map<string, number>;
  speedKmh: number;
  nitro: number;
  result: RaceResult | null;
  winnerAt: number;
  /** Steering assist: the car follows the racing line unless you steer yourself. */
  assist: boolean;
}

export const session = perContext(
  (ctx: GameContext): Session => ({
    loop: createSessionLoop<never, { place: number; raceId: string }, number>({
      kind: "race",
      carries: false,
      settle: ({ input }) => payout(ctx, input.raceId, input.place),
    }),
    raceId: idea.races[0]!.id,
    countdown: 0,
    clock: 0,
    startedAt: 0,
    race: null,
    cars: new Map(),
    rivals: [],
    skill: new Map(),
    speedKmh: 0,
    nitro: 1,
    result: null,
    winnerAt: -1,
    assist: false,
  }),
);

const rivalId = (index: number) => `rival-${index + 1}`;

/** Where the player stands, read off the session loop: between races, counting down, racing, or paid. */
export function racePhase(state: Session): "garage" | "countdown" | "racing" | "finished" {
  if (state.loop.phase() === "open") return state.countdown > 0 ? "countdown" : "racing";
  return state.result === null ? "garage" : "finished";
}

/** The settle rule: a podium pays its share of the purse and counts toward the career. */
function payout(ctx: GameContext, raceId: string, place: number): number {
  const race = idea.races.find((entry) => entry.id === raceId)!;
  const pay = Math.round(race.pay * (PAYOUT[place - 1] ?? 0));
  const world = career.of(ctx);
  world.set(fact(idea.currency.id), world.num(fact(idea.currency.id)) + pay);
  world.set(fact("raced"), world.num(fact("raced")) + 1);
  if (place === 1) world.set(fact("wins"), world.num(fact("wins")) + 1);
  if (place <= 3) world.set(fact(`podium_${race.id}`), 1);
  const best = world.num(fact(`best_${race.id}`));
  if (best === 0 || place < best) world.set(fact(`best_${race.id}`), place);
  return pay;
}

function carFor(state: Session, id: string, slot: number): KinematicVehicle {
  const grid = gridSlot(circuit, slot);
  let car = state.cars.get(id);
  if (car === undefined) {
    car = createKinematicVehicle(BASE, { position: grid.position, heading: grid.heading });
    state.cars.set(id, car);
  } else car.resetTo(grid.position, grid.heading);
  return car;
}

function place(ctx: GameContext, id: string, car: KinematicVehicle): void {
  const pose = car.pose();
  const y = ctx.world.groundHeightAt(pose.position[0], pose.position[2]);
  ctx.scene.entity.setPose(id, { position: [pose.position[0], y, pose.position[2]], rotationY: pose.heading });
}

/** The player's car on the grid, in the garage. */
export function parkPlayer(ctx: GameContext): void {
  const state = session(ctx);
  const grid = gridSlot(circuit, 0);
  if (ctx.scene.entity.get(ctx.player.userId) === null) {
    ctx.scene.entity.spawn("car", { id: ctx.player.userId, position: grid.position, rotationY: grid.heading, role: "player" });
  }
  place(ctx, ctx.player.userId, carFor(state, ctx.player.userId, 0));
}

/** Line up the next race: the player and this race's rivals on the grid, then a three-second count. */
export function lineUp(ctx: GameContext): void {
  const state = session(ctx);
  if (state.loop.phase() === "open") return;
  const race = currentRace(ctx);
  const raceIndex = idea.races.indexOf(race);
  for (const id of state.rivals) ctx.scene.entity.despawn(id);
  state.rivals = Array.from({ length: race.rivals }, (_, index) => rivalId(index));
  parkPlayer(ctx);
  state.rivals.forEach((id, index) => {
    const grid = gridSlot(circuit, index + 1);
    ctx.scene.entity.spawn(`rival${(index % idea.rivals.length) + 1}`, { id, position: grid.position, rotationY: grid.heading, role: "npc" });
    place(ctx, id, carFor(state, id, index + 1));
    // Later races field quicker rivals; within a race the front of the grid is quicker than the back.
    state.skill.set(id, 0.8 + raceIndex * 0.07 + (race.rivals - index) * 0.025);
  });
  state.race = createRaceState({ track: trackOf(circuit, race.laps) });
  state.raceId = race.id;
  state.loop.start();
  state.countdown = COUNTDOWN;
  state.result = null;
  state.winnerAt = -1;
  state.nitro = 1;
}

/** Back to the garage after a result. */
export function toGarage(ctx: GameContext): void {
  const state = session(ctx);
  if (racePhase(state) !== "finished") return;
  for (const id of state.rivals) ctx.scene.entity.despawn(id);
  state.rivals = [];
  state.race = null;
  state.result = null;
  parkPlayer(ctx);
}

function playerAxis(ctx: GameContext, racing: boolean, car: KinematicVehicle | undefined): AxisInput {
  if (!racing) return PARKED;
  const value = (action: string) => Math.max(ctx.input.value(action), ctx.input.isDown(action) ? 1 : 0);
  const manual = value("steerRight") - value("steerLeft");
  const steer = manual === 0 && session(ctx).assist && car !== undefined ? rivalAxis(car, true).steer : manual;
  return { throttle: value("throttle"), brake: value("brake"), steer, handbrake: value("handbrake") };
}

/** A rival aims a few points down the racing line and lifts when the turn ahead is sharp. */
export function rivalAxis(car: KinematicVehicle, racing: boolean): AxisInput {
  if (!racing) return PARKED;
  const pose = car.pose();
  const { index } = nearestOnLine(circuit, pose.position[0], pose.position[2]);
  const aim = circuit.line[(index + 2) % circuit.line.length]!;
  const wanted = headingTo([pose.position[0], pose.position[2]], aim);
  let turn = wanted - pose.heading;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  // Steering right lowers the engine's yaw, so a turn toward a higher heading is a left steer.
  const steer = Math.max(-1, Math.min(1, -turn * 2.4));
  const [vx, vz] = car.velocity();
  const sharp = Math.abs(turn) > 0.5 && Math.hypot(vx, vz) > 18;
  return { throttle: sharp ? 0.3 : 1, brake: sharp ? 0.4 : 0, steer, handbrake: 0 };
}

function offRoad(car: KinematicVehicle): boolean {
  const pose = car.pose();
  return nearestOnLine(circuit, pose.position[0], pose.position[2]).off > circuit.width / 2 + 2;
}

function finish(ctx: GameContext, place: number): void {
  const state = session(ctx);
  const race = idea.races.find((entry) => entry.id === state.raceId)!;
  const pay = state.loop.settle({ place, raceId: race.id }).result;
  state.result = { place, pay, time: state.clock - state.startedAt, title: race.title };
  ctx.game.notices.push({ text: place <= 3 ? `P${place}! +${pay} ${idea.currency.label.toLowerCase()}` : `P${place}. No pay this time.`, tone: place <= 3 ? "success" : "warn" });
  void ctx.game.save?.checkpoint();
}

export function tickRace(ctx: GameContext, dt: number): void {
  const state = session(ctx);
  state.clock += dt;
  if (racePhase(state) === "countdown") {
    state.countdown -= dt;
    if (state.countdown <= 0) {
      state.countdown = 0;
      state.startedAt = state.clock;
      state.race?.addRacer(ctx.player.userId, state.clock);
      for (const id of state.rivals) state.race?.addRacer(id, state.clock);
    }
  }
  const racing = racePhase(state) === "racing";
  const engine = boostOf(ctx, "engine");
  const grip = boostOf(ctx, "grip");
  const nitroBoost = boostOf(ctx, "nitro");
  const burning = racing && ctx.input.isDown("nitro") && state.nitro > 0.02;
  state.nitro = Math.max(0, Math.min(1, state.nitro + (burning ? -NITRO_DRAIN : NITRO_REFILL) * dt));

  const positions = new Map<string, readonly [number, number, number]>();
  const drive = (id: string, axis: AxisInput, modifiers: KinematicVehicleModifiers) => {
    const car = state.cars.get(id);
    if (car === undefined || ctx.scene.entity.get(id) === null) return;
    const slowed = offRoad(car) ? 0.55 : 1;
    const step = tickDrivableVehicle(car, dt, axis, {
      groundHeight: (x, z) => ctx.world.groundHeightAt(x, z),
      modifiers: { ...modifiers, topSpeedScale: (modifiers.topSpeedScale ?? 1) * slowed },
    });
    ctx.scene.entity.setPose(id, { position: step.pose.position, rotationY: step.pose.rotationY });
    positions.set(id, step.pose.position);
    if (id === ctx.player.userId) state.speedKmh = Math.abs(step.step.forwardSpeed) * 3.6;
  };

  drive(ctx.player.userId, playerAxis(ctx, racing, state.cars.get(ctx.player.userId)), {
    topSpeedScale: 1 + engine + (burning ? 0.22 + nitroBoost : 0),
    accelScale: 1 + engine + (burning ? 0.6 + nitroBoost : 0),
    turnRateScale: 1 + grip * 0.5,
    gripScale: 1 + grip,
  });
  const playerProgress = state.race?.progressOf(ctx.player.userId)?.progress ?? 0;
  for (const id of state.rivals) {
    const car = state.cars.get(id);
    if (car === undefined) continue;
    const behind = (state.race?.progressOf(id)?.progress ?? 0) < playerProgress;
    const skill = (state.skill.get(id) ?? 0.9) + (behind ? 0.05 : 0);
    drive(id, rivalAxis(car, racing), { topSpeedScale: skill, accelScale: skill });
  }

  if (!racing || state.race === null) return;
  for (const event of state.race.update(state.clock, positions)) {
    if (event.type === "lap.completed" && event.racerId === ctx.player.userId) {
      const race = idea.races.find((entry) => entry.id === state.raceId)!;
      if (event.lap < race.laps) ctx.game.notices.push({ text: event.lap === race.laps - 1 ? "Final lap!" : `Lap ${event.lap + 1}`, tone: "info" });
    }
  }
  const standings = state.race.standings();
  const me = standings.find((entry) => entry.racerId === ctx.player.userId);
  if (me?.finished === true) {
    finish(ctx, standings.filter((entry) => entry.finished && (entry.finishTime ?? 0) <= (me.finishTime ?? 0)).length);
    return;
  }
  // Nobody waits forever: 45 seconds after the winner crosses, the player is classified where they run.
  if (state.winnerAt < 0 && standings.some((entry) => entry.finished)) state.winnerAt = state.clock;
  if (state.winnerAt >= 0 && state.clock - state.winnerAt > 45) finish(ctx, me?.position ?? standings.length);
}

/** What the HUD reads. */
export function raceView(ctx: GameContext) {
  const state = session(ctx);
  const race = idea.races.find((entry) => entry.id === state.raceId) ?? idea.races[0]!;
  const me = state.race?.progressOf(ctx.player.userId) ?? null;
  const world = career.of(ctx);
  const next = currentRace(ctx);
  const phase = racePhase(state);
  return {
    phase,
    countdown: Math.ceil(state.countdown),
    speed: Math.round(state.speedKmh),
    nitro: state.nitro,
    lap: Math.min(me?.lap ?? 1, race.laps),
    laps: race.laps,
    position: me?.position ?? 1,
    field: state.rivals.length + 1,
    time: phase === "racing" ? state.clock - state.startedAt : 0,
    assist: state.assist,
    result: state.result,
    cash: Math.floor(world.num(fact(idea.currency.id))),
    wins: world.num(fact("wins")),
    next,
    nextIndex: idea.races.indexOf(next),
    allDone: idea.races.every((entry) => world.num(fact(`podium_${entry.id}`)) >= 1),
    upgrades: idea.upgrades.map((upgrade) => ({
      ...upgrade,
      stage: world.num(`${upgrade.id}.stage`),
      price: upgrade.cost * world.num(`${upgrade.id}.stage`),
    })),
  };
}

export const raceSystem = defineSystem({
  id: "race.loop",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define("race", {
      apply(state) {
        lineUp(state);
        return state;
      },
    });
    ctx.game.commands.define("assist", {
      apply(state) {
        const race = session(state);
        race.assist = !race.assist;
        state.game.notices.push({ text: race.assist ? "Steering assist on: the car follows the line unless you steer" : "Steering assist off", tone: "info" });
        return state;
      },
    });
    ctx.game.commands.define("garage", {
      apply(state) {
        toGarage(state);
        return state;
      },
    });
    idea.upgrades.forEach((upgrade, index) => {
      ctx.game.commands.define(`buy${index + 1}`, {
        apply(state) {
          if (racePhase(session(state)) !== "garage") return state;
          const done = career.of(state).act(`buy_${upgrade.id}`, upgrade.id);
          if (!done.ok) state.game.notices.push({ text: done.message, tone: "deny" });
          return state;
        },
      });
    });
  },
  update(ctx, dt) {
    if (gamePhase(ctx) !== "playing") return;
    tickRace(ctx, Math.min(dt, 0.05));
  },
});
