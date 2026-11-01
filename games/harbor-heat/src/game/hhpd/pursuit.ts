import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createAlertLevel, type AlertLevel, type AlertLevelState, type AlertStep, type AlertTuning } from "@jgengine/core/ai/alertLevel";
import { createPacedSchedule, type PacedSchedule, type PacedScheduleState } from "@jgengine/core/time/pacedSchedule";
import type { ThresholdBoundary } from "@jgengine/core/threshold/thresholds";
import { annulusRegion, sampleBatch } from "@jgengine/core/world/spatialSample";
import { createPerception, type PerceptionCandidate, type PerceptionService } from "@jgengine/core/sensor/perception";
import { advancePursuit, armPursuit, createPursuitState, type PursuitState } from "@jgengine/core/ai/pursuit";
import type { DifficultyProfile } from "@jgengine/core/ai/difficulty";
import { createDriverState, driveStep, type DriverGoal, type DriverState, type DriverTuning, type PaceBand } from "@jgengine/core/ai/driver";
import { seededRng } from "@jgengine/core/random/rng";
import { vehicleById } from "../entities/vehicles/catalog";
import type { Driving } from "../driving/driving";
import { landHit } from "../combat/hitModel";

/** The last-sighting circle HHPD is working; `center` is world XZ, `radius` metres. */
export interface SearchAreaSnapshot {
  center: readonly [number, number];
  radius: number;
  lastSeenAt: number;
}

export interface WantedSnapshot {
  heat: number;
  /** Escalation tier, 0 (clean) to {@link MAX_STARS}. */
  stars: number;
  peakStars: number;
  /** What HHPD is doing about it right now. */
  response: "patrol" | "investigate" | "pursue" | "roadblock";
  /** Where the search is, from the last sighting; null while clean. */
  search: SearchAreaSnapshot | null;
}

export const MAX_STARS = 5;
/** Heat at the top tier; the HUD bar is a fraction of this. */
export const MAX_HEAT = MAX_STARS * 100;
export const PURSUIT_STARS = 3;

export const wantedStore = defineStore<WantedSnapshot | undefined>("harbor.wanted", undefined);
import { defineStore } from "@jgengine/core/store/defineStore";

/** Cruiser driving skill by wanted stars: 3★ rookies drive sloppy, 5★ interceptors drive sharp. */
const CRUISER_SKILL: readonly DifficultyProfile[] = [
  {
    reactionSeconds: 0.9,
    decisionNoise: 0.35,
    executionJitter: 0.3,
    abilityDiscipline: 0.2,
    perceptionScale: 0.7,
    planDepth: 1,
    planWidth: 2,
  },
  {
    reactionSeconds: 0.35,
    decisionNoise: 0.12,
    executionJitter: 0.12,
    abilityDiscipline: 0.55,
    perceptionScale: 1,
    planDepth: 2,
    planWidth: 4,
  },
  {
    reactionSeconds: 0.08,
    decisionNoise: 0,
    executionJitter: 0.02,
    abilityDiscipline: 0.85,
    perceptionScale: 1.3,
    planDepth: 4,
    planWidth: 8,
  },
];
const cruiserSkill = (stars: number): DifficultyProfile =>
  CRUISER_SKILL[Math.max(0, Math.min(CRUISER_SKILL.length - 1, stars - PURSUIT_STARS))]!;

const CRUISER_TUNING: DriverTuning = (() => {
  const def = vehicleById("car_cop");
  return { maxSpeed: def !== undefined && def.dynamics.type === "ground" ? def.dynamics.tuning.topSpeed : 35 };
})();

/** Fraction of the interceptor's top speed it holds on a straight; the chase band pushes past it. */
const CRUISER_CRUISE = 0.8;

/**
 * The interceptors' chase band: hold a tail six metres off the player's bumper, so a cruiser that
 * falls behind opens up and one that closes backs off instead of driving through the car. Unlike the
 * race band this one is aimed at a moving target rather than a field position, and its push is what
 * lets a cruiser cruise below top speed and still reel a fast player in.
 */
const CRUISER_PACE: PaceBand = { margin: -6, tolerance: 0.5, easeAt: 3, ease: 0.9, pushAt: 25, push: 0.7 };

/**
 * The goal a cruiser hands the shared driver this step: aim at the player, pace it with
 * {@link CRUISER_PACE} and cap the cruise at `CRUISER_CRUISE` of the car's top speed so the band's
 * push has somewhere to go. The gap is measured along the cruiser's own nose, so a car that has run
 * past the player counts as ahead and eases instead of turning to ram from behind.
 */
export function cruiserGoal(
  pose: { readonly position: readonly [number, number, number]; readonly heading: number },
  target: readonly [number, number, number],
): DriverGoal {
  const ahead =
    (target[0] - pose.position[0]) * Math.sin(pose.heading) + (target[2] - pose.position[2]) * Math.cos(pose.heading);
  return {
    x: target[0],
    z: target[2],
    speedLimit: CRUISER_TUNING.maxSpeed * CRUISER_CRUISE,
    paceGap: -ahead,
    paceBand: CRUISER_PACE,
  };
}

/** One step on HHPD's wanted ladder: the stars it shows, what HHPD is doing, and what it puts on the street. */
export interface WantedTier {
  /** Stars the HUD shows at this step; every rule (cruisers, arrest fines, courier heat) reads this same number. */
  stars: number;
  response: WantedSnapshot["response"];
  /** Officers this step wants on foot. */
  officers: number;
  /** Radius, metres, of the last-sighting search while the trail is fresh. */
  searchRadius: number;
}

/** Below the first step HHPD is only on patrol: no stars, no search, nobody looking for you. */
const PATROL: WantedTier = { stars: 0, response: "patrol", officers: 0, searchRadius: 0 };

/** HHPD's five steps: who turns up, how many, and how wide they work the last sighting. */
const TIERS: readonly ThresholdBoundary<WantedTier>[] = [
  { at: 50, id: { stars: 1, response: "investigate", officers: 1, searchRadius: 26 } },
  { at: 120, id: { stars: 2, response: "investigate", officers: 2, searchRadius: 30 } },
  { at: 210, id: { stars: 3, response: "pursue", officers: 2, searchRadius: 34 } },
  { at: 320, id: { stars: 4, response: "pursue", officers: 3, searchRadius: 40 } },
  { at: 450, id: { stars: 5, response: "roadblock", officers: 4, searchRadius: 46 } },
];

/** A slow bleed once the trail goes cold, and a beat of "still hot" after the last crime. */
const HUNT: AlertTuning<WantedTier> = {
  tiers: TIERS,
  decayPerSecond: 9,
  decayDelaySeconds: 3,
  escapeSeconds: 8,
  sightGraceSeconds: 0.25,
  standDownSeconds: 4,
  hiddenRate: 3,
};

/** Where the search stops growing, and how fast it grows while the trail stays cold. */
const SEARCH_RADIUS_MAX = 90;
const SEARCH_GROWTH_PER_SECOND = 1.4;

/** Where a new unit arrives: from the next block, never on top of the player. */
const SPAWN_RING: readonly [number, number] = [44, 62];
const RING_SEED = 20260712;

/** Seconds between officer waves at a star count; the floor keeps a five-star street from becoming a wall of cops. */
const officerPace = (stars: number): number => Math.max(2, 8 - stars * 1.2);
/** Seconds between interceptor arrivals once the chase is on. */
const CRUISER_PACE_SECONDS = 9;

/**
 * A witness is anyone who can see the street: pedestrians, named residents and officers. HHPD only
 * asks officers, but a resident's sighting is the call that brings them, so the roster is shared.
 */
const WITNESS_RADIUS = 64;
const MAX_WITNESSES = 24;
function isWitnessName(name: string): boolean {
  return name.startsWith("ped_") || name.startsWith("resident-") || name === "cop_patrol" || name === "cop_swat";
}
function isCopName(name: string): boolean {
  return name === "cop_patrol" || name === "cop_swat";
}

/** How close an officer must be, with a clear line, to switch from searching to chasing. */
const COP_SIGHT_RANGE = 26;

/** How far past the last sighting the player can get before cruisers lose the chase and search again. */
const CHASE_RADIUS = 34;

/** The stars a tier shows, or none below the first step. */
function starsOf(tier: WantedTier | null): number {
  return tier === null ? 0 : Math.min(MAX_STARS, tier.stars);
}

/**
 * What a reload has to keep or the difficulty silently changes: the alert level's own state (the
 * heat curve, the sight timer, the last sighting and the counters), the dispatch clocks, the
 * pursuit's peak tier, and the spawn ring's stream cursor. The per-officer AI state (`copPursuit`,
 * `copSearchAngle`, `cruiserDrivers`) is keyed by entity id and rebuilt from the officers that
 * respawn, so it is deliberately not carried.
 */
export interface PursuitSave {
  /** The alert level: heat, its clocks, the last sighting and the counters. */
  alert: AlertLevelState<WantedTier>;
  peakStars: number;
  lastNoticeTier: number;
  /** The officer wave clock, so a reload does not restart a wave. */
  officerPace: PacedScheduleState;
  officerCounter: number;
  cruiserPace: PacedScheduleState;
  cruiserCounter: number;
  /** The ring stream's cursor, so a reload keeps the same arrival points. */
  ringCursor: number;
}

/** Whether a would-be witness keeps quiet: a resident on a block the player holds, say. */
export type WitnessFilter = (ctx: GameContext, entity: { readonly name: string; readonly position: readonly [number, number, number] }) => boolean;

export interface Pursuit {
  addHeat(ctx: GameContext, amount: number): void;
  /** Take heat off at once (a bribe, a respray); returns the stars left. */
  forgiveHeat(ctx: GameContext, amount: number): number;
  /** The player is in cover HHPD can't see into this tick. */
  setHidden(hidden: boolean): void;
  hidden(): boolean;
  /** Who keeps quiet: called for every pedestrian and resident before it is asked what it saw. */
  setWitnessFilter(filter: WitnessFilter | null): void;
  /** Heat at the threshold of a star count, for pricing a pay-off down to it. */
  heatForStars(stars: number): number;
  clearWanted(ctx: GameContext): void;
  snapshot(): PursuitSave;
  restore(ctx: GameContext, state: PursuitSave): void;
  wanted(): WantedSnapshot;
  tickWanted(ctx: GameContext, dt: number): void;
  tickCops(ctx: GameContext, dt: number): void;
  tickCruisers(ctx: GameContext, dt: number): void;
}

/**
 * The pursuit slice: HHPD's wanted response over the shared `ai/alertLevel` primitive, the cops that
 * search the last sighting, and the cruiser cars — all keyed off the player's world position, which it
 * reads through the {@link Driving} seam. Heat only rises while a witness has the player in view, the
 * search area sits where that witness last saw them, and the heat bleeds once nobody does. Cruiser
 * cars reuse driving's vehicle registry (`makeCarSim`/`refreshClamp`/`dropCarSim`).
 */
export function createPursuit(driving: Driving): Pursuit {
  let witnessRoster: string[] = [];
  let hiddenNow = false;
  let quiet: WitnessFilter | null = null;
  const perception: PerceptionService = createPerception({
    sightRange: WITNESS_RADIUS,
    sightConeDeg: 150,
    hearingRange: 0,
    memorySeconds: 12,
  });
  function freshAlert(): AlertLevel<WantedTier> {
    return createAlertLevel<WantedTier>({
      witness: perception,
      observers: () => witnessRoster,
      targetId: "sighting-player",
      tuning: HUNT,
    });
  }
  let alert = freshAlert();
  let peakStars = 0;
  let lastNoticeTier = 0;
  let lastArea: SearchAreaSnapshot | null = null;
  const rng = seededRng("harbor-heat-cops");
  /** The arrival ring keeps its own stream so a reload repeats where units came from. */
  const ringRng = seededRng(RING_SEED);
  const officerClock: PacedSchedule = createPacedSchedule({ firstAt: 0, every: officerPace(0) }, rng, { maxPerTick: 1 });
  const cruiserClock: PacedSchedule = createPacedSchedule({ firstAt: 0, every: CRUISER_PACE_SECONDS }, rng, { maxPerTick: 1 });
  /**
   * The world clock does not start at zero, so both dispatch clocks take their start from the first
   * tick of the pursuit rather than from time zero.
   */
  let clocksStarted = false;
  let officerCounter = 0;
  let cruiserCounter = 0;
  /** Per-cop attack-cooldown state, owned by the pursuit primitive instead of stashed on `entity.meta`. */
  const copPursuit = new Map<string, PursuitState>();
  /** Per-cop search beat: the little arc it walks inside the search area while the trail is cold. */
  const copSearchAngle = new Map<string, number>();
  /** Per-cruiser AI-driver state — steering quality scales with the wanted level. */
  const cruiserDrivers = new Map<string, DriverState>();

  /** Police and perception share one millisecond clock, derived from the world's seconds. */
  function clockMs(ctx: GameContext): number {
    return ctx.time.now() * 1000;
  }

  function publishWanted(ctx: GameContext): void {
    wantedStore.write(ctx, {
      heat: alert.current().value,
      stars: starsOf(alert.current().tier),
      peakStars,
      response: alert.current().tier?.response ?? PATROL.response,
      search: lastArea,
    } satisfies WantedSnapshot);
  }

  /** The circle HHPD works: the tier's own radius, grown while the trail stays cold. */
  function searchAreaOf(step: AlertStep<WantedTier>): SearchAreaSnapshot | null {
    const tier = step.tier;
    const anchor = step.anchor;
    if (tier === null || anchor === null) return null;
    return {
      center: [anchor.at[0], anchor.at[1]],
      radius: Math.min(SEARCH_RADIUS_MAX, tier.searchRadius + step.outOfSightSeconds * SEARCH_GROWTH_PER_SECOND),
      lastSeenAt: anchor.lastSeenAt,
    };
  }

  /** Heat at the first step of a star count, for pricing a pay-off down to it. */
  function heatForStars(stars: number): number {
    let at = 0;
    for (const tier of TIERS) if (tier.id.stars <= stars) at = tier.at;
    return at;
  }

  /** One arrival point on the ring around `center`, drawn from the seeded ring stream. */
  function spawnPointAround(center: readonly [number, number]): readonly [number, number] {
    const region = annulusRegion(center, SPAWN_RING[0], SPAWN_RING[1], { distribution: "radial" });
    const placed = sampleBatch({ region, rng: ringRng, count: 1 }).points[0];
    return placed ?? center;
  }

  /** Ask every witness near the player what it can see; bounded by roster size, never the whole city. */
  function observeWitnesses(ctx: GameContext, nowMs: number): void {
    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player === null) {
      witnessRoster = [];
      return;
    }
    const candidate: PerceptionCandidate = { id: "sighting-player", position: player.position };
    const near = ctx.scene.entity
      .list()
      .filter((entity) => isWitnessName(entity.name))
      .filter((entity) => Math.hypot(entity.position[0] - player.position[0], entity.position[2] - player.position[2]) <= WITNESS_RADIUS)
      .filter((entity) => isCopName(entity.name) || quiet === null || !quiet(ctx, entity))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, MAX_WITNESSES);
    witnessRoster = near.map((entity) => entity.id);
    for (const witness of near) {
      perception.observe({ id: witness.id, position: witness.position, yaw: witness.rotationY }, [candidate], nowMs);
    }
  }

  function tickWanted(ctx: GameContext, dt: number): void {
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const cops = ctx.scene.entity.list().filter((e) => isCopName(e.name));
    const nowMs = clockMs(ctx);
    observeWitnesses(ctx, nowMs);

    const step = alert.tick(dt, { nowMs, activeUnits: cops.length, hidden: hiddenNow });
    const tier = step.tier;
    const stars = starsOf(tier);
    peakStars = Math.max(peakStars, stars);
    lastArea = searchAreaOf(step);
    publishWanted(ctx);

    announceTier(ctx, stars);

    if (step.standDown) {
      for (const cop of cops) {
        ctx.scene.entity.despawn(cop.id);
        copPursuit.delete(cop.id);
        copSearchAngle.delete(cop.id);
      }
      for (const cruiser of ctx.scene.entity.list().filter((e) => e.id.startsWith("cruiser_"))) {
        ctx.scene.entity.despawn(cruiser.id);
        driving.dropCarSim(cruiser.id);
      }
      return;
    }

    const now = ctx.time.now();
    if (!clocksStarted) {
      clocksStarted = true;
      officerClock.retune({ firstAt: now });
      cruiserClock.retune({ firstAt: now });
      officerClock.reset();
      cruiserClock.reset();
    }
    const wantOfficers = Math.max(0, (tier === null ? 0 : tier.officers) - cops.length);
    if (wantOfficers === 0) {
      officerClock.pause(now);
      return;
    }
    officerClock.resume(now);
    officerClock.retune({ every: officerPace(stars) });
    if (officerClock.due(now).length === 0) return;
    officerCounter += 1;
    const center: readonly [number, number] = lastArea === null ? [playerPos[0], playerPos[2]] : lastArea.center;
    const [x, z] = spawnPointAround(center);
    ctx.scene.entity.spawn(stars >= 4 ? "cop_swat" : "cop_patrol", {
      id: `cop_${officerCounter}`,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      role: "npc",
    });
  }

  /** One line in Harbor's voice when HHPD changes what it is doing, plus the engine's own deny cue. */
  function announceTier(ctx: GameContext, stars: number): void {
    if (stars === lastNoticeTier) return;
    const rising = stars > lastNoticeTier;
    lastNoticeTier = stars;
    if (!rising) {
      if (stars === 0) ctx.game.notices.push({ text: "HHPD lost the trail. Nobody is looking.", tone: "success" });
      return;
    }
    const text =
      stars === 1
        ? "Someone called it in. HHPD is on the way."
        : stars === 2
          ? "HHPD is asking around the block."
          : stars === 3
            ? "HHPD is hunting you now."
            : stars >= 5
              ? "HHPD has the causeway. Lose them."
              : "More units are joining the search.";
    ctx.game.notices.push({ text, tone: "warn" });
    ctx.game.feedback.cue("deny", text);
  }

  /**
   * Officers work the search area: they walk to where the player was last seen, sweep its arc, and
   * only break into a chase with a clear line inside {@link COP_SIGHT_RANGE}.
   */
  function tickCops(ctx: GameContext, dt: number): void {
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const cops = ctx.scene.entity.list().filter((e) => isCopName(e.name));
    const area = lastArea;

    for (const cop of cops) {
      const dist = Math.hypot(cop.position[0] - playerPos[0], cop.position[2] - playerPos[2]);
      if (area === null && dist > 70) {
        ctx.scene.entity.despawn(cop.id);
        copPursuit.delete(cop.id);
        copSearchAngle.delete(cop.id);
        continue;
      }
      const seesPlayer = dist < COP_SIGHT_RANGE && ctx.scene.entity.hasLineOfSight(cop.id, ctx.player.userId);
      if (seesPlayer) {
        if (dist > 2.5) {
          ctx.scene.entity.moveToward(cop.id, [playerPos[0], playerPos[1], playerPos[2]], {
            speed: cop.name === "cop_swat" ? 5.6 : 5.2,
            stopDistance: 2,
            dt,
          });
        }
      } else if (area !== null) {
        searchStep(ctx, cop.id, area.center[0], area.center[1], area.radius, dt, cop.name === "cop_swat" ? 4.2 : 3.6);
      }

      // The pursuit primitive owns the wall-clock attack cadence: fire only with a clear line, on a
      // per-cop cooldown that keeps counting during the chase.
      let state = copPursuit.get(cop.id);
      if (state === undefined) {
        state = createPursuitState();
        copPursuit.set(cop.id, state);
      }
      // Officers only draw on someone they are actually working a search for.
      const canShoot = area !== null && dist < 16 && ctx.scene.entity.hasLineOfSight(cop.id, ctx.player.userId);
      const action = advancePursuit(state, dt, canShoot ? dist : null, 16);
      if (action === "attack") {
        armPursuit(state, cop.name === "cop_swat" ? 0.7 : 1.2);
        ctx.scene.entity.effect({
          from: cop.id,
          to: ctx.player.userId,
          effect: "damage",
          via: { amount: cop.name === "cop_swat" ? 9 : 5 },
        });
      }
    }
  }

  /** Walk a beat inside the last-sighting circle instead of standing on its centre. */
  function searchStep(
    ctx: GameContext,
    copId: string,
    cx: number,
    cz: number,
    radius: number,
    dt: number,
    speed: number,
  ): void {
    let angle = copSearchAngle.get(copId);
    if (angle === undefined) {
      angle = rng() * Math.PI * 2;
      copSearchAngle.set(copId, angle);
    }
    const reach = radius * 0.65;
    const x = cx + Math.sin(angle) * reach;
    const z = cz + Math.cos(angle) * reach;
    const cop = ctx.scene.entity.get(copId);
    if (cop === null) return;
    if (Math.hypot(cop.position[0] - x, cop.position[2] - z) < 1.6) {
      copSearchAngle.set(copId, angle + Math.PI * (0.6 + rng() * 0.8));
      return;
    }
    ctx.scene.entity.moveToward(copId, [x, cop.position[1], z], { speed, dt });
  }

  function tickCruisers(ctx: GameContext, dt: number): void {
    const level = starsOf(alert.current().tier);
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const area = lastArea;
    const searchCenter: readonly [number, number] = area === null ? [playerPos[0], playerPos[2]] : area.center;
    /**
     * Cruisers drive to the last sighting; they only turn for the player once they can see them. The
     * chase band belongs to that second leg, so a search leg steers to a point instead of tailing one.
     */
    const chasing =
      area === null || Math.hypot(playerPos[0] - area.center[0], playerPos[2] - area.center[1]) < CHASE_RADIUS;
    const target: readonly [number, number] = chasing ? [playerPos[0], playerPos[2]] : searchCenter;
    const cruisers = ctx.scene.entity.list().filter((e) => e.id.startsWith("cruiser_"));

    if (level >= PURSUIT_STARS && cruisers.length < level - 1 && cruiserClock.due(ctx.time.now()).length > 0) {
      cruiserCounter += 1;
      const angle = rng() * Math.PI * 2;
      const x = target[0] + Math.sin(angle) * 60;
      const z = target[1] + Math.cos(angle) * 60;
      const id = `cruiser_${cruiserCounter}`;
      ctx.scene.entity.spawn("car_cop", { id, position: [x, ctx.world.groundHeightAt(x, z), z], role: "prop" });
      const copDef = vehicleById("car_cop")!;
      if (copDef.dynamics.type === "ground") {
        driving.cruiserVehicles.set(
          id,
          driving.makeCarSim(id, copDef.dynamics.tuning, copDef.collisionRadius, [x, 0, z], Math.atan2(target[0] - x, target[1] - z)),
        );
        cruiserDrivers.set(id, createDriverState(target[0], target[1]));
      }
    }

    const skill = cruiserSkill(level);
    for (const cruiser of cruisers) {
      const vehicle = driving.cruiserVehicles.get(cruiser.id);
      if (vehicle === undefined) {
        cruiserDrivers.delete(cruiser.id);
        continue;
      }
      const pose = vehicle.pose();
      const dist = Math.hypot(pose.position[0] - playerPos[0], pose.position[2] - playerPos[2]);
      if (level < PURSUIT_STARS) {
        if (dist > 60) {
          ctx.scene.entity.despawn(cruiser.id);
          driving.dropCarSim(cruiser.id);
          cruiserDrivers.delete(cruiser.id);
        }
        continue;
      }
      // Difficulty-aware chase driving: rookie 3★ drivers react late, wobble the wheel, and grind
      // walls before backing out; 5★ interceptors track tight and corner clean.
      let driver = cruiserDrivers.get(cruiser.id);
      if (driver === undefined) {
        driver = createDriverState(target[0], target[1]);
        cruiserDrivers.set(cruiser.id, driver);
      }
      const [vx, vz] = vehicle.velocity();
      const forwardSpeed = vx * Math.sin(pose.heading) + vz * Math.cos(pose.heading);
      const goal: DriverGoal = chasing ? cruiserGoal(pose, playerPos) : { x: target[0], z: target[1] };
      const drive = driveStep(
        driver,
        dt,
        { x: pose.position[0], z: pose.position[2], heading: pose.heading, speed: forwardSpeed },
        goal,
        skill,
        CRUISER_TUNING,
        rng,
      );
      // `driveStep` reports steer as the signed heading error (ai/driver.ts), while the shared
      // steering convention turns the other way (`steerYaw` decreases yaw for +steer), so a cruiser
      // that passes it straight through steers away from the player and never closes.
      const axis = { throttle: drive.throttle, brake: drive.brake, steer: -drive.steer, handbrake: 0 };
      driving.refreshClamp(ctx, cruiser.id, pose.position, dt);
      const result = tickDrivableVehicle(vehicle, dt, axis, {
        groundHeight: (x, z) => ctx.world.groundHeightAt(x, z),
        tires: { id: cruiser.id, time: ctx.time.now(), marks: ctx.tireMarks, particles: ctx.particles },
      });
      ctx.scene.entity.setPose(cruiser.id, result.pose);
      const drivenId = driving.drivingVehicleId();
      if (dist < 4 && drivenId !== null) {
        landHit(ctx, { from: cruiser.id, to: drivenId, type: "impact", base: Math.round(24 * dt * 10) / 10 });
      }
    }
  }

  return {
    addHeat(_ctx, amount) {
      if (amount > 0) alert.report(amount);
    },
    forgiveHeat(ctx, amount) {
      alert.forgive(Math.max(0, amount));
      publishWanted(ctx);
      return starsOf(alert.current().tier);
    },
    setHidden(hidden) {
      hiddenNow = hidden;
    },
    hidden: () => hiddenNow,
    setWitnessFilter(filter) {
      quiet = filter;
    },
    heatForStars,
    clearWanted(ctx) {
      alert = freshAlert();
      witnessRoster = [];
      peakStars = 0;
      lastNoticeTier = 0;
      lastArea = null;
      copPursuit.clear();
      copSearchAngle.clear();
      cruiserDrivers.clear();
      publishWanted(ctx);
    },
    snapshot: () => ({
      alert: alert.state(),
      peakStars,
      lastNoticeTier,
      officerPace: officerClock.snapshot(),
      officerCounter,
      cruiserPace: cruiserClock.snapshot(),
      cruiserCounter,
      ringCursor: ringRng.state(),
    }),
    restore(ctx, state) {
      alert.restore(state.alert);
      peakStars = state.peakStars;
      lastNoticeTier = state.lastNoticeTier;
      officerClock.restore(state.officerPace);
      officerCounter = state.officerCounter;
      cruiserClock.restore(state.cruiserPace);
      cruiserCounter = state.cruiserCounter;
      ringRng.restore(state.ringCursor);
      // A restored document carries the clocks forward from the saved instant, never a fresh start.
      clocksStarted = true;
      lastArea = null;
      // Publish the restored heat so the HUD and every rule read what the reload kept.
      publishWanted(ctx);
    },
    wanted: () => {
      const current = alert.current();
      return {
        heat: current.value,
        stars: starsOf(current.tier),
        peakStars,
        response: current.tier?.response ?? PATROL.response,
        search: lastArea,
      };
    },
    tickWanted,
    tickCops,
    tickCruisers,
  };
}

