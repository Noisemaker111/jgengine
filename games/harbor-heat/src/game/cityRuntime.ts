import { applyMissionRewards, type MissionWorldEvent } from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { behaviorControl } from "@jgengine/core/scene/behaviorRuntime";
import { defineStore } from "@jgengine/core/store/defineStore";
import { createWorldModel, type WorldEvent, type WorldModel, type WorldModelState } from "@jgengine/core/worldModel/worldModel";
import { editorLayers } from "../editorLayers";
import { earn } from "./cash";
import { city, CITY_PLAYER, TURF, turfWar } from "./city";
import { raidLost, raidStarted, registerFronts, startRaidOnFirstFront, tickFronts } from "./city/fronts";
import { crewPush, GANG_LABEL, gangClash, gangOf, registerStreet, tickClashes, tickCover, tickReckless, tickStreetCrews } from "./city/street";
import { registerGarage } from "./city/garage";
import { safehouseStore } from "./commands";
import { handrollOf, raceStore } from "./handroll";
import { CRED_BY_JOB, grantCred } from "./progression/cred";
import { convoyRunners } from "./runState";
import { CICADA_STAGE_POS, KINGPIN_POS } from "./world/districts";

/** The whole world model's state: one store, so the world snapshot saves it and the host replicates it. */
export const worldStore = defineStore<WorldModelState | undefined>("harbor.world", undefined);

/** Whether the phone is out: a menu, not world state. */
export const phoneStore = defineStore<boolean | undefined>("harbor.phone", undefined);

const CICADA_STAGE_ID = "cicada_stage_car";
/** Fear at which residents and pedestrians drop what they are doing. */
export const PANIC_FEAR = 35;

interface CityRuntime {
  model: WorldModel;
  /** World events seen since the last tick, for the mission machine's counters. */
  pending: MissionWorldEvent[];
  cicadaWrecked: boolean;
  panicking: boolean;
  /** Whether the Protection job has set up its raid yet. */
  protectionStaged: boolean;
  /** Job crews already put down this job, by id prefix. */
  staged: Set<string>;
}

/** Hours HHPD and the crews count as night: the clubs fill, the crews double up. */
export const isNight = (hour: number) => hour >= 20 || hour < 6;

/**
 * Facts the game computes and the world only reads. `turf.held` is read straight off the saved facts,
 * not through the model, so it never asks itself.
 */
function liveFacts(ctx: GameContext) {
  const hour = ctx.time.calendar().hour;
  const facts = worldStore.peek(ctx)?.facts;
  let held = 0;
  for (const id of TURF) if ((facts?.[`${id}.owner`] ?? city.places?.[id]?.owner) === "player") held += 1;
  return { "clock.hour": hour, "clock.night": isNight(hour), "police.stars": handrollOf(ctx).wanted().stars, "turf.held": held };
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
      if (name === "heat") handrollOf(ctx).addHeat(ctx, amount);
    },
    live: () => liveFacts(ctx),
    hooks: {
      crewPush: (call) => crewPush(ctx, call),
      gangClash: (call) => gangClash(ctx, call),
      raidStarted: (call) => raidStarted(ctx, call),
      raidLost: (call) => raidLost(ctx, call),
    },
  }),
  pending: [],
  cicadaWrecked: false,
  panicking: false,
  protectionStaged: false,
  staged: new Set(),
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
  return ctx.scene.entity.get(handrollOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.position ?? null;
}

/** Fear where a point stands, 0 when it is in no declared place. */
export function fearAt(ctx: GameContext, x: number, z: number): number {
  const model = cityOf(ctx);
  const place = model.placeAt(x, z);
  return place === null ? 0 : model.num(`${place}.fear`);
}

export function registerCity(ctx: GameContext): void {
  const runtime = runtimes(ctx);
  registerCityDev(ctx);
  registerFronts(ctx);
  registerStreet(ctx);
  registerGarage(ctx);
  ctx.game.events.on("entity.died", (event) => {
    const { catalogId, instanceId, position, source } = event as { catalogId: string; instanceId: string; position: [number, number, number]; source?: string };
    if (instanceId === CICADA_STAGE_ID) runtime.cicadaWrecked = true;
    const victim = gangOf(catalogId);
    const killer = source === undefined ? null : gangOf(ctx.scene.entity.get(source)?.name ?? "");
    // One crew dropping the other's soldier is their war, not the player's: no heat, no job count,
    // and the block goes to the shooter's crew a little.
    if (victim !== null && killer !== null && killer !== victim) {
      cityEvent(ctx, { kind: turfWar.pushRipple(killer === "carmine" ? "carmine_war" : "riptide_war"), at: position });
      return;
    }
    runtime.pending.push({ kind: "kill", target: catalogId });
    if (catalogId.startsWith("ped_")) cityEvent(ctx, { kind: "killing", at: position });
    else if (victim === "riptide") cityEvent(ctx, { kind: "riptide_down", at: position, faction: "riptide" });
    else if (victim === "carmine") cityEvent(ctx, { kind: "ganger_down", at: position, faction: "carmine" });
    else if (catalogId.startsWith("cop_") && catalogId !== "car_cop") cityEvent(ctx, { kind: "cop_down", at: position, faction: "hhpd" });
  });
  ctx.game.events.on("worldItem.picked_up", (event) => {
    runtime.pending.push({ kind: "collect", target: event.itemId, count: event.count });
  });
  ctx.game.commands.define("phone", { apply(state) { phoneStore.write(state, phoneStore.read(state) !== true); } });
  ctx.game.commands.define<{ id: string }>("city.job.start", {
    validate(state, input) {
      const job = cityOf(state).job(input.id);
      if (job === null) return { reason: "unknown-job", message: "No such job." };
      if (cityOf(state).missionView() !== null) return { reason: "busy", message: "Finish the job you are on first." };
      if (job.status !== "available" && job.status !== "failed") return { reason: "locked", message: "That job is not open yet." };
      return null;
    },
    apply(state, input) {
      if (cityOf(state).startJob(input.id) === null) return;
      runtimes(state).cicadaWrecked = false;
      runtimes(state).protectionStaged = false;
      runtimes(state).staged.clear();
      state.game.dialogue?.close();
      phoneStore.write(state, false);
      state.game.feedback.cue("objective", cityOf(state).job(input.id)?.title ?? "Job started");
    },
  });
}

/**
 * Dev-only proof hooks: a warp, a shot aimed at the nearest named target through the real fire path,
 * and `window.__harborCity`, the world model's readout a drive asserts against.
 */
function registerCityDev(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ x: number; z: number }>("city.dev.warp", {
    apply(state, input) {
      handrollOf(state).exitVehicle(state, true);
      state.scene.entity.setPose(state.player.userId, { position: [input.x, state.world.groundHeightAt(input.x, input.z), input.z] });
    },
  });
  ctx.game.commands.define<{ prefix: string; itemId?: string }>("city.dev.shoot", {
    apply(state, input) {
      const me = state.scene.entity.get(state.player.userId);
      if (me === null) return;
      const target = state.scene.entity
        .list()
        .filter((entity) => entity.name.startsWith(input.prefix) && entity.id !== me.id)
        .sort((a, b) => Math.hypot(a.position[0] - me.position[0], a.position[2] - me.position[2]) - Math.hypot(b.position[0] - me.position[0], b.position[2] - me.position[2]))[0];
      if (target === undefined) return;
      // Walk up to point-blank so crates don't eat the shot and keep the magazine fed; the
      // step file spaces shots past the gun's fire rate.
      const away = Math.hypot(target.position[0] - me.position[0], target.position[2] - me.position[2]) || 1;
      const x = target.position[0] - ((target.position[0] - me.position[0]) / away) * 3;
      const z = target.position[2] - ((target.position[2] - me.position[2]) / away) * 3;
      const from: [number, number, number] = [x, state.world.groundHeightAt(x, z), z];
      const dx = target.position[0] - from[0];
      const dz = target.position[2] - from[2];
      const yaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(target.position[1] + 1.1 - (from[1] + 1.4), Math.hypot(dx, dz));
      state.scene.entity.setPose(me.id, { position: from, rotationY: yaw });
      state.scene.entity.stats.delta(me.id, "ammo_9mm", 1);
      const health = state.scene.entity.stats.get(me.id, "health");
      if (health !== null && health.current > 0) state.scene.entity.stats.set(me.id, "health", { current: health.max });
      state.item.use.use({ from: me.id, itemId: input.itemId ?? "pistol_vice", aim: { yaw, pitch } });
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
  ctx.game.commands.define<Record<string, never>>("city.dev.pickup", {
    apply(state) {
      const me = state.scene.entity.get(state.player.userId);
      if (me === null) return;
      const item = state.scene.worldItem.nearestInRadius(me.position, 6);
      if (item !== null) state.scene.worldItem.pickup(item, state.player.userId);
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
        stars: handrollOf(ctx).wanted().stars,
        hidden: handrollOf(ctx).hidden(),
        heat: Math.round(handrollOf(ctx).wanted().heat),
        clock: { hour: world.fact("clock.hour"), night: world.fact("clock.night") },
        turf: Object.fromEntries(TURF.map((id) => [id, { owner: world.fact(`${id}.owner`), grip: Math.round(world.num(`${id}.grip`)), attacker: world.fact(`${id}.attacker`) }])),
        war: { on: world.fact("war.on"), tension: Math.round(world.num("war.tension")) },
        fronts: Object.fromEntries(world.instances("front").map((front) => [front.slot ?? front.id, { id: front.id, raid: world.fact(`${front.id}.raid`), hit: world.fact(`${front.id}.hit`), clock: Math.ceil(world.num(`${front.id}.raid_clock`)) }])),
        takings: Math.floor(world.num("fronts.takings")),
        repelled: world.num("fronts.repelled"),
        crews: ctx.scene.entity.list().filter((entity) => entity.id.startsWith("crew_") || entity.id.startsWith("raider_") || entity.id.startsWith("clash_")).map((entity) => entity.id),
      };
    },
  };
}

/** A new career opens on the first story beat, so the opening is play, not a menu. */
export function startCareer(ctx: GameContext): void {
  if (cityOf(ctx).job("welcome")?.status === "available") cityOf(ctx).startJob("welcome");
}

/** A death or an arrest drops the job on the floor; its giver offers it again. */
export function failActiveJob(ctx: GameContext): void {
  const model = cityOf(ctx);
  if (model.missionView() === null) return;
  model.abandonJob();
  for (const entity of ctx.scene.entity.list()) {
    if (entity.id === "kingpin_sal" || entity.id.startsWith("sal_guard_")) ctx.scene.entity.despawn(entity.id);
  }
}

/**
 * Put each job's cast where its current stage needs it. This is content, not a system: the convoy
 * is the engine's wave runner, Sal's guard and the Cicada are spawned once per stage.
 */
function stageJob(ctx: GameContext, dt: number): void {
  const view = cityOf(ctx).missionView();
  if (view === null) return;
  if (view.missionId === "convoy" && view.objectiveId === "break") {
    const alive = ctx.scene.entity.list().filter((e) => e.name === "ganger_dock").length;
    convoyRunners(ctx).update(dt, { alive });
  }
  if (view.missionId === "kingpin" && ctx.scene.entity.get("kingpin_sal") === null && view.objectiveId === "go") {
    ctx.scene.entity.spawn("kingpin_sal", {
      id: "kingpin_sal",
      position: [KINGPIN_POS[0], ctx.world.groundHeightAt(KINGPIN_POS[0], KINGPIN_POS[2]), KINGPIN_POS[2]],
      role: "npc",
    });
    for (let i = 0; i < 3; i += 1) {
      const x = KINGPIN_POS[0] - 6 + i * 6;
      const z = KINGPIN_POS[2] + 8;
      ctx.scene.entity.spawn("ganger_enforcer", { id: `sal_guard_${i}`, position: [x, ctx.world.groundHeightAt(x, z), z], role: "npc" });
    }
  }
  if (view.missionId === "protection" && !runtimes(ctx).protectionStaged) {
    // The job is the raid: count only raids broken from here, and start one on the player's front.
    cityOf(ctx).set("fronts.repelled", 0);
    runtimes(ctx).protectionStaged = startRaidOnFirstFront(ctx);
    if (!runtimes(ctx).protectionStaged) ctx.game.notices.push({ text: "You need an open front for Sal to hit. Buy or reopen one.", tone: "warn" });
  }
  // Rising Tide's boat crew and Corvo's Canal Row crew are four soldiers each, put down once per stage.
  if (view.missionId === "riptide_intro" && view.objectiveId === "drop") stageCrew(ctx, "riptide_boat", "riptide_soldier", "strand", 4);
  if (view.missionId === "corvo_offer" && view.objectiveId === "clear") stageCrew(ctx, "corvo_target", "ganger_dock", "canal", 4);
  if (view.missionId === "hot_wheels" && view.objectiveId !== "deliver" && ctx.scene.entity.get(CICADA_STAGE_ID) === null) {
    const [x, , z] = CICADA_STAGE_POS;
    ctx.scene.entity.spawn("car_sport", { id: CICADA_STAGE_ID, position: [x, ctx.world.groundHeightAt(x, z), z], role: "prop" });
  }
}

/** A job's crew, spawned once around a block's centre; ids stay fixed so a re-staged tick never doubles them. */
function stageCrew(ctx: GameContext, prefix: string, catalogId: string, place: string, count: number): void {
  const runtime = runtimes(ctx);
  if (runtime.staged.has(prefix)) return;
  const at = cityOf(ctx).position(place);
  if (at === null) return;
  runtime.staged.add(prefix);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const x = at[0] + Math.cos(angle) * 5;
    const z = at[1] + Math.sin(angle) * 5;
    ctx.scene.entity.spawn(catalogId, { id: `${prefix}_${index}`, position: [x, ctx.world.groundHeightAt(x, z), z], role: "npc" });
  }
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
  const position = playerPosition(ctx);
  const race = raceStore.peek(ctx);
  const drivingId = handrollOf(ctx).drivingVehicleId();
  const events = runtime.pending;
  runtime.pending = [];
  const result = model.tick(dt, {
    actors: { [CITY_PLAYER]: position === null ? {} : { position: { x: position[0], y: position[1], z: position[2] } } },
    events,
    facts: {
      police_tier: handrollOf(ctx).wanted().stars,
      race_won: race !== undefined && race.finished && race.won ? race.routeId : "",
      driving: drivingId === null ? "" : (ctx.scene.entity.get(drivingId)?.name ?? ""),
      cicada_wrecked: runtime.cicadaWrecked,
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
      if (event.jobId === "hot_wheels" && handrollOf(ctx).drivingVehicleId() !== null) handrollOf(ctx).exitVehicle(ctx);
      void ctx.game.save?.checkpoint();
    } else if (event.kind === "job-failed") {
      ctx.game.notices.push({ text: `Job failed: ${event.reason} See the giver to retry.`, tone: "warn" });
    }
  }
  for (const id of result.fired ?? []) {
    const handover = turfWar.handover(id);
    if (handover === null) continue;
    const label = city.places?.[handover.block]?.label ?? handover.block;
    if (handover.to === "player") {
      ctx.game.notices.push({ text: `${label} is yours. Its corners pay you protection now.`, tone: "success" });
      ctx.game.feedback.cue("objective", `Took ${label}`);
    } else if (handover.from === "player") {
      ctx.game.notices.push({ text: `${GANG_LABEL[handover.to] ?? "A crew"} took ${label} from you.`, tone: "warn" });
    } else {
      ctx.game.notices.push({ text: `${GANG_LABEL[handover.to] ?? "A crew"} took ${label} from ${GANG_LABEL[handover.from] ?? "a crew"}.`, tone: "info" });
    }
  }
  stageJob(ctx, dt);
  tickPanic(ctx, runtime);
  tickFronts(ctx);
  tickStreetCrews(ctx);
  tickClashes(ctx, dt);
  tickReckless(ctx);
  tickCover(ctx, safehouseStore.read(ctx) === true);
}

/** A crew's soldiers notice you from further away the angrier their crew is. */
export function gangAggroRadius(ctx: GameContext, gang: string, base: number): number {
  return base + Math.max(0, -cityOf(ctx).num(`${gang}.mood`)) * 0.2;
}
