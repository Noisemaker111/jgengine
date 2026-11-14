import { applyMissionRewards } from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { behaviorControl } from "@jgengine/core/scene/behaviorRuntime";
import { defineStore } from "@jgengine/core/store/defineStore";
import { createWorldModel, type WorldEvent, type WorldModel, type WorldModelState } from "@jgengine/core/worldModel/worldModel";
import { editorLayers } from "../editorLayers";
import { earn } from "./cash";
import { city, CITY_PLAYER, SET_PIECES } from "./city";
import { registerStreet, tickCover, tickReckless } from "./city/street";
import { registerGarage } from "./city/garage";
import { safehouseStore } from "./commands";
import { streetPlayOf, raceStore } from "./streetPlay";
import { CRED_BY_JOB, grantCred } from "./progression/cred";
import { nightStore, resetNight, tickNights } from "./pizza/nights";
import { pizzeriaStore } from "./pizza/shift";
import { repStars } from "./pizza/orders";

/** The whole world model's state: one store, so the world snapshot saves it and the host replicates it. */
export const worldStore = defineStore<WorldModelState | undefined>("harbor.world", undefined);

/** Whether the phone is out: a menu, not world state. */
export const phoneStore = defineStore<boolean | undefined>("harbor.phone", undefined);

/** Fear at which residents and pedestrians drop what they are doing. */
export const PANIC_FEAR = 35;

interface CityRuntime {
  model: WorldModel;
  panicking: boolean;
}

/** Hours the city counts as night: the market fills, the wardens double up. */
export const isNight = (hour: number) => hour >= 20 || hour < 6;

/** Facts the game computes and the world only reads. */
function liveFacts(ctx: GameContext) {
  const hour = ctx.time.calendar().hour;
  return { "clock.hour": hour, "clock.night": isNight(hour), "police.stars": streetPlayOf(ctx).wanted().stars };
}

/** The pizza career as the facts the story's objectives wait on. */
export function pizzaFacts(ctx: GameContext): Record<string, number | boolean> {
  const shop = pizzeriaStore.read(ctx);
  const night = nightStore.read(ctx);
  return {
    "pizza.delivered": shop.deliveries,
    "pizza.happy": shop.goodDeliveries,
    "pizza.rep": repStars(shop.goodDeliveries),
    "pizza.swaps": shop.swaps ?? 0,
    "pizza.hull_drops": shop.hullDrops ?? 0,
    "pizza.stack_drops": shop.stackDrops ?? 0,
    "pizza.shaken": shop.shaken ?? 0,
    "pizza.upstairs_drops": shop.upstairsDrops ?? 0,
    "pizza.paid": shop.paid ?? 0,
    "pizza.saved": shop.saved ? 1 : 0,
    "pizza.night_score": night.score,
    "pizza.night_failed": night.failed,
  };
}

function groundedMarkers(ctx: GameContext) {
  const out = missionMarkers(editorLayers);
  for (const marker of Object.values(out)) marker.y = ctx.world.groundHeightAt(marker.x, marker.z);
  return out;
}

const runtimes = perContext((ctx: GameContext): CityRuntime => ({
  model: createWorldModel(city, {
    markers: groundedMarkers(ctx),
    defaultPursuer: CITY_PLAYER,
    storage: { read: () => worldStore.peek(ctx), write: (next) => worldStore.write(ctx, next) },
    onReward: (rewards, jobId) =>
      applyMissionRewards(rewards, {
        grantEconomy: (currency, amount) => {
          if (currency === "cash") earn(ctx, amount, "job-reward", jobId);
          else ctx.game.economy.grant(ctx.player.userId, currency, amount);
        },
      }),
    onOutput: (name, amount) => {
      if (name === "heat") streetPlayOf(ctx).addHeat(ctx, amount);
    },
    live: () => liveFacts(ctx),
  }),
  panicking: false,
}));

/** The city's world model for this context. */
export function cityOf(ctx: GameContext): WorldModel {
  return runtimes(ctx).model;
}

/** Report something that happened in the city: it ripples into fear, moods, heat and the log. */
export function cityEvent(ctx: GameContext, event: WorldEvent): void {
  cityOf(ctx).emit(event);
}

function playerPosition(ctx: GameContext): readonly [number, number, number] | null {
  return ctx.scene.entity.get(streetPlayOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.position ?? null;
}

/** Fear where a point stands, 0 when it is in no declared place. */
export function fearAt(ctx: GameContext, x: number, z: number): number {
  const model = cityOf(ctx);
  const place = model.placeAt(x, z);
  return place === null ? 0 : model.num(`${place}.fear`);
}

export function registerCity(ctx: GameContext): void {
  registerCityDev(ctx);
  registerStreet(ctx);
  registerGarage(ctx);
  ctx.game.events.on("entity.died", (event) => {
    const { catalogId, position } = event as { catalogId: string; instanceId: string; position: [number, number, number] };
    if (catalogId.startsWith("ped_")) cityEvent(ctx, { kind: "killing", at: position });
    else if (catalogId.startsWith("cop_") && catalogId !== "car_cop") cityEvent(ctx, { kind: "cop_down", at: position, faction: "hhpd" });
  });
  ctx.game.commands.define("phone", { apply(state) { phoneStore.write(state, phoneStore.read(state) !== true); } });
  ctx.game.commands.define<{ id: string }>("city.job.start", {
    validate(state, input) {
      const job = cityOf(state).job(input.id);
      if (job === null) return { reason: "unknown-job", message: "No such job." };
      if (cityOf(state).missionView() !== null) return { reason: "busy", message: "Finish the chapter you are on first." };
      if (job.status !== "available" && job.status !== "failed") return { reason: "locked", message: "That chapter is not open yet." };
      return null;
    },
    apply(state, input) {
      // A retried set-piece night starts from a clean score.
      if (input.id in SET_PIECES) resetNight(state);
      if (cityOf(state).startJob(input.id) === null) return;
      state.game.dialogue?.close();
      phoneStore.write(state, false);
      state.game.feedback.cue("objective", cityOf(state).job(input.id)?.title ?? "Chapter started");
    },
  });
}

/** Dev-only proof hooks: a warp, a fact poke, and `window.__harborCity`, the world model's readout a drive asserts against. */
function registerCityDev(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ x: number; z: number }>("city.dev.warp", {
    apply(state, input) {
      streetPlayOf(state).exitVehicle(state, true);
      state.scene.entity.setPose(state.player.userId, { position: [input.x, state.world.groundHeightAt(input.x, input.z), input.z] });
    },
  });
  ctx.game.commands.define<{ key: string; value: string | number | boolean }>("city.dev.set", {
    apply(state, input) {
      cityOf(state).set(input.key, input.value);
    },
  });
  ctx.game.commands.define<Record<string, never>>("city.dev.abandon", {
    apply(state) {
      failActiveJob(state);
    },
  });
  ctx.game.commands.define<{ amount: number }>("city.dev.cash", {
    apply(state, input) {
      earn(state, input.amount, "reconcile", "dev");
    },
  });
  (globalThis as { __harborCity?: unknown }).__harborCity = {
    read() {
      const world = cityOf(ctx);
      const live = world.missionView();
      const player = playerPosition(ctx);
      return {
        job: live === null ? null : { id: live.missionId, objective: live.objectiveId, label: live.label, counted: live.counted, count: live.count },
        next: world.next(),
        fear: Object.fromEntries(Object.keys(world.def.places ?? {}).map((id) => [id, Math.round(world.num(`${id}.fear`))])),
        moods: Object.fromEntries(Object.keys(world.def.factions ?? {}).map((id) => [id, Math.round(world.num(`${id}.mood`))])),
        jobs: Object.fromEntries(world.jobs().map((job) => [job.id, job.status])),
        contacts: world.contacts().map((contact) => contact.id),
        says: Object.fromEntries(Object.keys(world.def.people ?? {}).map((id) => [id, world.says(id)[0] ?? null])),
        log: world.log().map((entry) => entry.text),
        place: player === null ? null : world.placeAt(player[0], player[2]),
        panicking: runtimes(ctx).panicking,
        stars: streetPlayOf(ctx).wanted().stars,
        hidden: streetPlayOf(ctx).hidden(),
        heat: Math.round(streetPlayOf(ctx).wanted().heat),
        clock: { hour: world.fact("clock.hour"), night: world.fact("clock.night") },
        pizza: pizzaFacts(ctx),
        night: nightStore.read(ctx),
      };
    },
  };
}

/** A new career opens on the first chapter, so the opening is play, not a menu. */
export function startCareer(ctx: GameContext): void {
  if (cityOf(ctx).job("welcome")?.status === "available") cityOf(ctx).startJob("welcome");
}

/** A crash out or a Warden stop drops the live chapter step; its giver offers it again. */
export function failActiveJob(ctx: GameContext): void {
  const model = cityOf(ctx);
  if (model.missionView() === null) return;
  model.abandonJob();
}

/** Street peds freeze their routes while the block they are on is scared, and walk again when it calms. */
function tickPanic(ctx: GameContext, runtime: CityRuntime): void {
  const player = playerPosition(ctx);
  const panicking = player !== null && fearAt(ctx, player[0], player[2]) >= PANIC_FEAR;
  if (panicking === runtime.panicking) return;
  runtime.panicking = panicking;
  const control = behaviorControl(ctx);
  for (const info of control.list()) {
    if (!info.id.startsWith("ped_")) continue;
    if (panicking) control.disable(info.id, "panic");
    else control.enable(info.id);
  }
}

export function tickCity(ctx: GameContext, dt: number): void {
  const runtime = runtimes(ctx);
  const model = runtime.model;
  tickNights(ctx, model.missionView()?.missionId ?? null);
  const position = playerPosition(ctx);
  const race = raceStore.peek(ctx);
  const drivingId = streetPlayOf(ctx).drivingVehicleId();
  const result = model.tick(dt, {
    actors: { [CITY_PLAYER]: position === null ? {} : { position: { x: position[0], y: position[1], z: position[2] } } },
    events: [],
    facts: {
      ...pizzaFacts(ctx),
      police_tier: streetPlayOf(ctx).wanted().stars,
      race_won: race !== undefined && race.finished && race.won ? race.routeId : "",
      driving: drivingId === null ? "" : (ctx.scene.entity.get(drivingId)?.name ?? ""),
    },
  });
  for (const event of result.mission) {
    if (event.kind === "objective") ctx.game.feedback.cue("objective", event.label);
  }
  for (const event of result.jobs) {
    if (event.kind === "job-done") {
      const cred = CRED_BY_JOB[event.jobId];
      if (cred !== undefined) grantCred(ctx, cred);
      ctx.game.notices.push({ text: `${city.jobs?.[event.jobId]?.title ?? event.jobId} complete.`, tone: "success" });
      if (event.jobId in SET_PIECES) resetNight(ctx);
      void ctx.game.save?.checkpoint();
    } else if (event.kind === "job-failed") {
      ctx.game.notices.push({ text: `${city.jobs?.[event.jobId]?.title ?? "Chapter"}: ${event.reason} Ask again to retry.`, tone: "warn" });
    }
  }
  tickPanic(ctx, runtime);
  tickReckless(ctx);
  tickCover(ctx, safehouseStore.read(ctx) === true);
}
