import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import {
  createSideJobs,
  type SideJobEvent,
  type SideJobKindDef,
  type SideJobOffer,
  type SideJobReceipt,
  type SideJobs,
  type SideJobSpot,
  type SideJobsState,
  type SideJobView,
} from "@jgengine/core/mission/sideJobs";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { editorLayers } from "../../editorLayers";
import { earn, spend } from "../cash";
import { vehicleById } from "../entities/vehicles/catalog";
import { handrollOf } from "../handroll";
import { grantCred } from "../progression/cred";
import { RACE_ROUTES } from "../world/districts";

/** The street-race stake, and what a place pays back as a multiple of it: first triples, second breaks even. */
export const GIG_RACE_STAKE = 200;
const GIG_RACE_PAYOUTS = [3, 1] as const;
/** Cred per paid gig, by kind. */
const GIG_CRED: Record<string, number> = { taxi: 10, flowers: 15, street: 40 };
/** The fare standing at the kerb, and the cars a street race lines up. */
export const FARE_ID = "gig_fare";
const RIVAL_CARS = ["car_muscle", "car_sport"] as const;
const RIVAL_SPEEDS = [15.5, 13.8] as const;
/** Seconds between fresh taxi hails while on duty with nobody waiting. */
const HAIL_EVERY = 4;
/** Night hours (20:00–06:00) page a street race to anyone driving. */
const NIGHT_FROM = 20;
const NIGHT_TO = 6;
/** A drop in speed this sharp in one step is a crash, not braking (m/s²). */
const CRASH_DECEL = 22;

function tagsOf(meta: unknown): string[] {
  const tags = (meta as { tags?: unknown } | undefined)?.tags;
  return typeof tags === "string" ? tags.split(",").map((t) => t.trim()).filter((t) => t.length > 0) : [];
}

/** Every authored `gig_stop` marker in the scene document, as side-job spots. */
export const GIG_SPOTS: readonly (SideJobSpot & { label: string })[] = editorLayers.markers
  .filter((marker) => marker.kind === "gig_stop")
  .map((marker) => ({ id: marker.id, label: marker.label ?? marker.id, x: marker.position.x, z: marker.position.z, tags: tagsOf(marker.meta) }));

export const FLORIST = GIG_SPOTS.find((spot) => spot.tags?.includes("florist")) ?? null;

export function spotLabel(id: string): string {
  return GIG_SPOTS.find((spot) => spot.id === id)?.label ?? RACE_ROUTES.find((route) => route.id === id)?.label ?? "the kerb";
}

const kmh = (value: number) => value / 3.6;

/**
 * Harbor Heat's gig kinds as data on the engine's side-job board. Numbers fit the README economy:
 * a fare runs $150–450 with up to 25% tip, a flower run $220–600, a street race risks $200 to win $600.
 */
export const GIG_KINDS: readonly SideJobKindDef[] = [
  {
    id: "taxi",
    label: "Fare",
    pickupTag: "fare",
    dropTag: "fare",
    minLeg: 140,
    maxLeg: 460,
    fare: { base: 60, perMetre: 0.8, max: 450, perSecondLeft: 1 },
    deadline: { speed: kmh(45), slack: 15, pickup: 75 },
    tip: { max: 0.25, minComfort: 20 },
    streak: { step: 0.1, max: 0.5, window: 60 },
    // A crash costs a fifth of the mood, hull damage costs half a point per hit point, and a cop chase bleeds it.
    comfortLoss: ({ dt, facts }) => (facts.crash === true ? 20 : 0) + Number(facts.damage ?? 0) * 0.5 + Number(facts.stars ?? 0) * 4 * dt,
    offerTtl: 45,
    radius: 9,
    stopSpeed: kmh(9),
    boardSeconds: 1.2,
  },
  {
    id: "flowers",
    label: "Boardwalk Blooms run",
    pickupTag: "florist",
    dropTag: "flowers",
    drops: 3,
    minLeg: 90,
    maxLeg: 420,
    fare: { base: 120, perMetre: 0.35, max: 600, perSecondLeft: 0.5 },
    deadline: { speed: kmh(40), slack: 30 },
    tip: { max: 0.3, minComfort: 50 },
    // Bouquets bruise above 60 km/h and in any knock; at 0% the run is spoiled.
    comfortLoss: ({ dt, speed, facts }) => Math.max(0, speed - kmh(60)) * 0.9 * dt + (facts.crash === true ? 30 : 0) + Number(facts.damage ?? 0),
    failAtComfort: 0,
    cooldown: 20,
    offerTtl: 120,
    radius: 9,
    stopSpeed: kmh(9),
  },
  {
    id: "street",
    label: "Street race",
    routes: RACE_ROUTES.map((route) => {
      const start = route.checkpoints[route.checkpoints.length - 1]!;
      return {
        id: route.id,
        label: route.label,
        points: [
          { id: `${route.id}:start`, x: start[0], z: start[1] },
          ...route.checkpoints.map(([x, z], i) => ({ id: `${route.id}:${i}`, x, z })),
        ],
      };
    }),
    fare: { base: 0, perMetre: 0 },
    deadline: { speed: kmh(50), slack: 40, pickup: 120 },
    wager: { stake: GIG_RACE_STAKE, payouts: GIG_RACE_PAYOUTS },
    race: { rivals: 2, gateRadius: 11 },
    cooldown: 60,
    offerTtl: 90,
    radius: 14,
    stopSpeed: kmh(12),
  },
];

/** What a reload keeps: whether the taxi light is on and the board itself. */
export interface GigSave {
  duty: boolean;
  board: SideJobsState;
}

/** HUD mirror: the job in hand, the open offers and the last receipt. */
export interface GigHud {
  duty: boolean;
  view: SideJobView | null;
  offers: readonly SideJobOffer[];
  receipt: SideJobReceipt | null;
  streak: number;
}

export const gigStore = defineStore<GigHud>("harbor.gigs", () => ({ duty: false, view: null, offers: [], receipt: null, streak: 0 }));

interface GigRuntime {
  board: SideJobs;
  duty: boolean;
  hailClock: number;
  lastSpeed: number;
  lastHull: number | null;
  rivals: Map<string, { config: PathFollowConfig; state: PathFollowState }>;
  /** A dropped-off fare walking away, and when it leaves the scene. */
  walkOff: { until: number; to: readonly [number, number, number] } | null;
}

const runtimes = perContext((): GigRuntime => ({
  board: createSideJobs({ kinds: GIG_KINDS, spots: GIG_SPOTS, seed: "harbor-gigs", playerId: "harbor_player" }),
  duty: false,
  hailClock: 0,
  lastSpeed: 0,
  lastHull: null,
  rivals: new Map(),
  walkOff: null,
}));

export function gigBoard(ctx: GameContext): SideJobs {
  return runtimes(ctx).board;
}

function groundCar(ctx: GameContext): string | null {
  const id = handrollOf(ctx).drivingVehicleId();
  if (id === null) return null;
  return vehicleById(ctx.scene.entity.get(id)?.name ?? "")?.dynamics.type === "ground" ? id : null;
}

function bodyAt(ctx: GameContext): { x: number; z: number } | null {
  const body = ctx.scene.entity.get(handrollOf(ctx).drivingVehicleId() ?? ctx.player.userId);
  return body === null ? null : { x: body.position[0], z: body.position[2] };
}

function publish(ctx: GameContext): void {
  const rt = runtimes(ctx);
  gigStore.write(ctx, { duty: rt.duty, view: rt.board.view(), offers: rt.board.offers(), receipt: rt.board.receipt(), streak: rt.board.streak() });
}

function ground(ctx: GameContext, x: number, z: number): readonly [number, number, number] {
  return [x, ctx.world.groundHeightAt(x, z), z];
}

/** The fare waiting at the kerb faces the street and waves; nobody stands there once they are aboard. */
function syncFare(ctx: GameContext): void {
  const rt = runtimes(ctx);
  const job = rt.board.job();
  const hailing = rt.board.offers().find((offer) => offer.kindId === "taxi");
  const waiting = job?.offer.kindId === "taxi" && job.phase === "pickup" ? job.offer.pickup : job === null && rt.duty ? hailing?.pickup : undefined;
  const fare = ctx.scene.entity.get(FARE_ID);
  if (rt.walkOff !== null) {
    if (ctx.time.now() >= rt.walkOff.until) {
      ctx.scene.entity.despawn(FARE_ID);
      rt.walkOff = null;
    }
    return;
  }
  if (waiting === undefined) {
    if (fare !== null) ctx.scene.entity.despawn(FARE_ID);
    return;
  }
  if (fare === null || Math.hypot(fare.position[0] - waiting.x, fare.position[2] - waiting.z) > 3) {
    if (fare !== null) ctx.scene.entity.despawn(FARE_ID);
    ctx.scene.entity.spawn("ped_city", { id: FARE_ID, position: ground(ctx, waiting.x, waiting.z), rotationY: waiting.x < 0 ? Math.PI / 2 : -Math.PI / 2, role: "npc" });
    ctx.scene.entity.floatText({ instanceId: FARE_ID, text: "TAXI!", kind: "info" });
  }
}

function spawnRivals(ctx: GameContext, rivals: readonly string[]): void {
  const rt = runtimes(ctx);
  const job = rt.board.job();
  if (job === null) return;
  const start = job.offer.pickup;
  const gates = job.offer.drops;
  rivals.forEach((id, i) => {
    const side = i === 0 ? 4 : -4;
    const position = ground(ctx, start.x + side, start.z + side);
    if (ctx.scene.entity.get(id) !== null) ctx.scene.entity.despawn(id);
    ctx.scene.entity.spawn(RIVAL_CARS[i % RIVAL_CARS.length]!, { id, position, role: "prop" });
    const config: PathFollowConfig = { waypoints: [[position[0], 0, position[2]], ...gates.map((g) => [g.x, 0, g.z] as const)], speed: RIVAL_SPEEDS[i % RIVAL_SPEEDS.length]!, loop: false };
    rt.rivals.set(id, { config, state: createPathFollow(config) });
  });
}

function clearRivals(ctx: GameContext): void {
  const rt = runtimes(ctx);
  for (const id of rt.rivals.keys()) ctx.scene.entity.despawn(id);
  rt.rivals.clear();
}

function tickRivals(ctx: GameContext, dt: number): Record<string, readonly [number, number, number]> {
  const out: Record<string, readonly [number, number, number]> = {};
  for (const [id, rival] of runtimes(ctx).rivals) {
    rival.state = advancePathFollow(rival.config, rival.state, dt);
    const [x, , z] = rival.state.position;
    ctx.scene.entity.setPose(id, { position: ground(ctx, x, z), rotationY: rival.state.heading, dt });
    out[id] = [x, 0, z];
  }
  return out;
}

function settleReceipt(ctx: GameContext, receipt: SideJobReceipt): void {
  const ref = receipt.jobId;
  if (receipt.fare + receipt.timeBonus > 0) earn(ctx, receipt.fare + receipt.timeBonus, "gig-fare", ref);
  if (receipt.tip > 0) earn(ctx, receipt.tip, "gig-tip", ref);
  if (receipt.streakBonus > 0) earn(ctx, receipt.streakBonus, "gig-streak", ref);
  if (receipt.purse > 0) earn(ctx, receipt.purse, "gig-purse", ref);
  if (receipt.outcome === "paid") grantCred(ctx, receipt.kindId === "street" && receipt.place !== 1 ? 0 : (GIG_CRED[receipt.kindId] ?? 0));
  ctx.game.notices.push({ text: receiptLine(receipt), tone: receipt.outcome === "paid" ? "success" : "warn" });
  if (receipt.total > 0) ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+$${receipt.total}`, kind: "good" });
}

/** The pager's one-line settlement, in the order the money landed. */
export function receiptLine(receipt: SideJobReceipt): string {
  if (receipt.kindId === "street") {
    if (receipt.place === 1) return `Won ${receipt.label} — $${receipt.purse} purse.`;
    if (receipt.purse > 0) return `${receipt.label}: ${ordinal(receipt.place ?? 2)} — stake back, $${receipt.purse}.`;
    return receipt.reason === "placed" ? `${receipt.label}: ${ordinal(receipt.place ?? 3)}. The $${GIG_RACE_STAKE} stake is gone.` : `${receipt.label} called off — ${failWord(receipt.reason)}.`;
  }
  if (receipt.outcome === "failed") return `${receipt.label} lost — ${failWord(receipt.reason)}.`;
  const parts = [`fare $${receipt.fare + receipt.timeBonus}`, receipt.tip > 0 ? `tip $${receipt.tip}` : "no tip", ...(receipt.streakBonus > 0 ? [`streak ×${receipt.streak - 1} $${receipt.streakBonus}`] : [])];
  return `${receipt.label} paid $${receipt.total} · ${parts.join(" · ")}`;
}

function ordinal(place: number): string {
  return place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
}

function failWord(reason: string | null): string {
  switch (reason) {
    case "late": return "out of time";
    case "spoiled": return "the flowers were crushed";
    case "left-car": return "you left the car";
    case "busted": return "busted";
    case "wasted": return "you went down";
    default: return reason ?? "called off";
  }
}

function handle(ctx: GameContext, events: readonly SideJobEvent[]): void {
  const rt = runtimes(ctx);
  for (const event of events) {
    if (event.type === "boarded") {
      const job = rt.board.job();
      if (job?.offer.kindId === "taxi") {
        ctx.scene.entity.despawn(FARE_ID);
        ctx.game.feedback.cue("pickup", `Fare aboard — ${spotLabel(job.offer.drops[0]!.id)}, $${job.offer.fare}.`);
      } else if (job?.offer.kindId === "flowers") {
        ctx.game.feedback.cue("pickup", `Three bouquets loaded — keep it smooth.`);
      }
    } else if (event.type === "race-started") {
      spawnRivals(ctx, event.rivals);
      ctx.game.feedback.cue("objective", "Street race — go!");
    } else if (event.type === "leg") {
      const job = rt.board.job();
      if (job?.offer.kindId === "flowers" && event.leg < event.of) ctx.game.feedback.cue("objective", `Bouquet ${event.leg} of ${event.of} delivered.`);
    } else if (event.type === "paid" || event.type === "failed") {
      const receipt = event.receipt;
      if (receipt.kindId === "taxi" && receipt.outcome === "paid") {
        const at = bodyAt(ctx);
        if (at !== null && ctx.scene.entity.get(FARE_ID) === null) {
          ctx.scene.entity.spawn("ped_city", { id: FARE_ID, position: ground(ctx, at.x + 3, at.z), role: "npc" });
          rt.walkOff = { until: ctx.time.now() + 6, to: ground(ctx, at.x + (at.x < 0 ? -10 : 10), at.z + 4) };
        }
      }
      if (receipt.kindId === "street") clearRivals(ctx);
      settleReceipt(ctx, receipt);
    }
  }
  if (events.length > 0) publish(ctx);
}

/** Pull up beside a waiting fare and they climb in: arriving is accepting, as a street hail is. */
function takeHail(ctx: GameContext, at: { x: number; z: number }, speed: number): void {
  const rt = runtimes(ctx);
  if (rt.board.job() !== null || !rt.duty) return;
  const hail = rt.board.offers().find((offer) => offer.kindId === "taxi");
  if (hail === undefined || speed > kmh(9) || Math.hypot(at.x - hail.pickup.x, at.z - hail.pickup.z) > 9) return;
  handle(ctx, rt.board.accept(hail.id) ?? []);
}

function isNight(ctx: GameContext): boolean {
  const hour = ctx.time.calendar().hour;
  return hour >= NIGHT_FROM || hour < NIGHT_TO;
}

function offerAround(ctx: GameContext, kind: string, at: { x: number; z: number }, radius: number, min = 30): SideJobOffer | null {
  const board = gigBoard(ctx);
  const existing = board.offers().find((offer) => offer.kindId === kind);
  if (existing !== undefined) return existing;
  const events = board.generate({ kinds: [kind], near: { at, radius, min } });
  const offered = events.find((event) => event.type === "offered");
  publish(ctx);
  return offered?.type === "offered" ? offered.offer : null;
}

/** Page a street race to a night driver, once per cooldown. */
function pageNightRace(ctx: GameContext, at: { x: number; z: number }): void {
  if (!isNight(ctx) || gigBoard(ctx).job() !== null || gigBoard(ctx).offers().some((offer) => offer.kindId === "street")) return;
  const offer = offerAround(ctx, "street", at, 420, 0);
  if (offer !== null) ctx.game.notices.push({ text: `Street race page: ${offer.label} · $${GIG_RACE_STAKE} stake, winner takes $${GIG_RACE_STAKE * GIG_RACE_PAYOUTS[0]}.`, tone: "info" });
}

export function tickGigs(ctx: GameContext, dt: number): void {
  const rt = runtimes(ctx);
  const car = groundCar(ctx);
  const at = bodyAt(ctx);
  const speed = car === null ? 0 : kmh(handrollOf(ctx).carSpeedKmh());
  const hull = car === null ? null : (ctx.scene.entity.stats.get(car, "health")?.current ?? null);
  const crash = car !== null && dt > 0 && (rt.lastSpeed - speed) / dt > CRASH_DECEL;
  const damage = hull !== null && rt.lastHull !== null ? Math.max(0, rt.lastHull - hull) : 0;
  rt.lastSpeed = speed;
  rt.lastHull = hull;
  const job = rt.board.job();
  // A fare or a racer who loses the car loses the job; a florist's run can be walked.
  if (job !== null && car === null && job.phase === "en-route" && job.offer.kindId !== "flowers") {
    handle(ctx, rt.board.fail("left-car"));
  }
  if (car !== null && at !== null) {
    if (rt.duty) {
      takeHail(ctx, at, speed);
      rt.hailClock += dt;
      if (rt.board.job() === null && rt.hailClock >= HAIL_EVERY) {
        rt.hailClock = 0;
        offerAround(ctx, "taxi", at, 260, 40);
      }
    }
    pageNightRace(ctx, at);
  }
  const racers = tickRivals(ctx, dt);
  const events = rt.board.tick(dt, { position: at, speed, racers, facts: { crash, damage, stars: handrollOf(ctx).wanted().stars } });
  handle(ctx, events);
  if (rt.walkOff !== null && ctx.scene.entity.get(FARE_ID) !== null) ctx.scene.entity.moveToward(FARE_ID, rt.walkOff.to, { speed: 1.8, dt });
  syncFare(ctx);
  publish(ctx);
}

/** Taxi light on or off. Going off duty sends the waiting fare away; a fare aboard still rides. */
export function setDuty(ctx: GameContext, on: boolean): void {
  const rt = runtimes(ctx);
  rt.duty = on;
  rt.hailClock = HAIL_EVERY;
  if (!on) {
    if (rt.board.offers().some((offer) => offer.kindId === "taxi")) rt.board.clearOffers();
  }
  ctx.game.notices.push({ text: on ? "Taxi light on — fares will hail you. Pull up beside one and stop." : "Taxi light off.", tone: "info" });
  syncFare(ctx);
  publish(ctx);
}

/** Take an open offer by id: a street race charges its stake up front. */
function acceptOffer(ctx: GameContext, id: string): boolean {
  const board = gigBoard(ctx);
  const offer = board.offers().find((o) => o.id === id);
  if (offer === undefined || board.job() !== null) return false;
  if (offer.stake > 0 && !spend(ctx, offer.stake, "gig-stake", offer.id)) {
    ctx.game.notices.push({ text: `The stake is $${offer.stake}.`, tone: "deny" });
    return false;
  }
  handle(ctx, board.accept(id) ?? []);
  publish(ctx);
  return true;
}

/** Fail the gig in hand for a reason the city decided (busted, wasted). */
export function failGigs(ctx: GameContext, reason: string): void {
  handle(ctx, gigBoard(ctx).fail(reason));
  clearRivals(ctx);
}

export function registerGigs(ctx: GameContext): void {
  ctx.game.commands.define("taxiDuty", {
    validate(state) {
      return groundCar(state) === null && !runtimes(state).duty ? { reason: "no-car", message: "Get in a car to work fares." } : null;
    },
    apply(state) {
      setDuty(state, !runtimes(state).duty);
    },
  });
  ctx.game.commands.define("gigs.flowers", {
    validate(state) {
      if (gigBoard(state).job() !== null) return { reason: "busy", message: "Finish the job you are on first." };
      const at = bodyAt(state);
      if (FLORIST === null || at === null || Math.hypot(at.x - FLORIST.x, at.z - FLORIST.z) > 10) return { reason: "not-at-florist", message: "Flower runs load at Boardwalk Blooms." };
      return null;
    },
    apply(state) {
      const offer = offerAround(state, "flowers", { x: FLORIST!.x, z: FLORIST!.z }, 5, 0);
      if (offer === null) {
        state.game.notices.push({ text: "Boardwalk Blooms has nothing ready yet — come back in a moment.", tone: "info" });
        return;
      }
      acceptOffer(state, offer.id);
      state.game.notices.push({ text: `Flower run: three addresses, ${offer.seconds} s, $${offer.fare}. Bouquets bruise above 60 km/h.`, tone: "info" });
    },
  });
  ctx.game.commands.define("gigs.race", {
    validate(state) {
      if (groundCar(state) === null) return { reason: "no-car", message: "You need a car to race." };
      if (gigBoard(state).job() !== null) return { reason: "busy", message: "Finish the job you are on first." };
      return null;
    },
    apply(state) {
      const at = bodyAt(state)!;
      const offer = offerAround(state, "street", at, 2000, 0);
      if (offer === null) {
        state.game.notices.push({ text: "No crews are racing right now — try again in a minute.", tone: "info" });
        return;
      }
      if (acceptOffer(state, offer.id)) state.game.notices.push({ text: `${offer.label}: meet at the start line. $${offer.stake} stake.`, tone: "info" });
    },
  });
  ctx.game.commands.define("gigs.dismiss", { apply(state) { gigBoard(state).dismiss(); publish(state); } });
  ctx.game.commands.define<{ id?: string }>("gigs.accept", { apply(state, input) { if (typeof input?.id === "string") acceptOffer(state, input.id); } });
  if (!import.meta.env.DEV) return;
  // Dev: a fare hailing beside you, in the nearest car, light on.
  ctx.game.commands.define<{ mode?: "taxi" | "race" | "flowers" }>("gigs.stage", { apply(state, input) { stageGig(state, input?.mode ?? "taxi"); } });
  // Dev: move the car to `short` metres before the current target (or the hailing fare), pointed at it.
  ctx.game.commands.define<{ short?: number }>("gigs.warp", { apply(state, input) { warpToTarget(state, input?.short ?? 0); } });
  if (typeof window !== "undefined") {
    (window as unknown as { __harborGigs?: unknown }).__harborGigs = {
      read: () => gigStore.read(ctx),
      board: () => gigBoard(ctx).snapshot(),
      stage: (mode: "taxi" | "race" | "flowers" = "taxi") => stageGig(ctx, mode),
      run: (name: string, input?: unknown) => ctx.game.commands.run(name, input),
    };
  }
}

/**
 * Dev and capture staging: the courier in the nearest ground car with a gig ready — a fare hailing
 * at the closest kerb (taxi), a race accepted at the nearest start line (race), or a flower run
 * loaded at the florist (flowers).
 */
export function stageGig(ctx: GameContext, mode: "taxi" | "race" | "flowers"): void {
  const handroll = handrollOf(ctx);
  if (mode === "flowers" && FLORIST !== null) {
    handroll.exitVehicle(ctx, true);
    ctx.scene.entity.setPose(ctx.player.userId, { position: ground(ctx, FLORIST.x + 2, FLORIST.z) });
    ctx.game.commands.run("gigs.flowers", {});
    return;
  }
  if (groundCar(ctx) === null) {
    const player = ctx.scene.entity.get(ctx.player.userId);
    const car = ctx.scene.entity.list()
      .filter((entity) => vehicleById(entity.name)?.dynamics.type === "ground" && !entity.id.startsWith("cruiser_") && !entity.id.includes(":rival:"))
      .sort((a, b) => (player === null ? 0 : Math.hypot(a.position[0] - player.position[0], a.position[2] - player.position[2]) - Math.hypot(b.position[0] - player.position[0], b.position[2] - player.position[2])))[0];
    if (car !== undefined) handroll.enterVehicle(ctx, car.id);
  }
  const at = bodyAt(ctx);
  if (at === null) return;
  if (mode === "race") {
    ctx.game.commands.run("gigs.race", {});
    return;
  }
  if (!runtimes(ctx).duty) setDuty(ctx, true);
  const near = [...GIG_SPOTS].filter((s) => s.tags?.includes("fare")).sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))[0];
  if (near !== undefined) offerAround(ctx, "taxi", { x: near.x, z: near.z }, 1, 0);
  syncFare(ctx);
}

function warpToTarget(ctx: GameContext, short: number): void {
  const car = groundCar(ctx);
  const at = bodyAt(ctx);
  const gigs = gigStore.read(ctx);
  const target = gigs.view?.target ?? gigs.offers[0]?.pickup ?? null;
  if (car === null || at === null || target === null) return;
  const dx = target.x - at.x;
  const dz = target.z - at.z;
  const length = Math.hypot(dx, dz) || 1;
  const back = Math.max(0, short);
  const x = target.x - (dx / length) * back;
  const z = target.z - (dz / length) * back;
  handrollOf(ctx).placeVehicle(ctx, car, ground(ctx, x, z), Math.atan2(dx, dz));
}

/** The florist's counter prompt. */
export function gigPrompts(ctx: GameContext): PositionedPrompt[] {
  if (FLORIST === null || gigBoard(ctx).job() !== null) return [];
  return [{ id: "gig:flowers", priority: 2, position: { x: FLORIST.x, z: FLORIST.z }, prompt: { radius: 8, display: { kind: "keybind", actionId: "interact" }, invoke: { name: "gigs.flowers", input: undefined } } }];
}

export function gigPromptLabel(id: string): string | null {
  return id === "gig:flowers" ? "Take a flower run · Boardwalk Blooms" : null;
}

export function gigSave(ctx: GameContext): GigSave {
  return { duty: runtimes(ctx).duty, board: gigBoard(ctx).snapshot() };
}

export function restoreGigs(ctx: GameContext, save: unknown): void {
  const value = save as Partial<GigSave> | null;
  if (value === null || typeof value !== "object" || typeof value.board !== "object" || value.board === null) return;
  const rt = runtimes(ctx);
  rt.board.restore(value.board as SideJobsState);
  rt.board.clearOffers();
  rt.duty = value.duty === true;
  clearRivals(ctx);
  publish(ctx);
}

export function resetGigs(ctx: GameContext): void {
  const rt = runtimes(ctx);
  rt.board.fail("reset");
  rt.board.clearOffers();
  rt.board.dismiss();
  rt.duty = false;
  clearRivals(ctx);
  publish(ctx);
}
