import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import {
  createPoliceResponse,
  DEFAULT_POLICE_TUNING,
  type PoliceResponse,
  type PoliceResponseState,
  type PoliceTuning,
} from "@jgengine/core/ai/policeResponse";
import { createPerception, type PerceptionCandidate, type PerceptionService } from "@jgengine/core/sensor/perception";
import { advancePursuit, armPursuit, createPursuitState, type PursuitState } from "@jgengine/core/ai/pursuit";
import { DIFFICULTY_TIERS, type DifficultyProfile } from "@jgengine/core/ai/difficulty";
import { createDriverState, driveStep, type DriverGoal, type DriverState, type DriverTuning, type PaceBand } from "@jgengine/core/ai/driver";
import { seededRng } from "@jgengine/core/random/rng";
import { vehicleById } from "../entities/vehicles/catalog";
import type { Driving } from "./driving";
import { landHit } from "../combat/hitModel";
import { MAX_STARS, PURSUIT_STARS, wantedStore, type WantedSnapshot } from "./shared";

/** Cruiser driving skill by wanted stars: 3★ rookies drive sloppy, 5★ interceptors drive sharp. */
const CRUISER_SKILL: readonly DifficultyProfile[] = [
  DIFFICULTY_TIERS.easy,
  DIFFICULTY_TIERS.standard,
  DIFFICULTY_TIERS.expert,
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

/**
 * Harbor Heat's HHPD policy over the shared response: five tiers, a slow bleed once the trail goes
 * cold, and a spawn ring big enough that a cruiser arrives from the next block rather than on top of
 * the player.
 */
const POLICE_TUNING: Partial<PoliceTuning> = {
  tiers: [
    { response: "investigate", threshold: 50, pursuers: 1, searchRadius: 26, roadblocks: 0 },
    { response: "investigate", threshold: 120, pursuers: 2, searchRadius: 30, roadblocks: 0 },
    { response: "pursue", threshold: 210, pursuers: 2, searchRadius: 34, roadblocks: 0 },
    { response: "pursue", threshold: 320, pursuers: 3, searchRadius: 40, roadblocks: 0 },
    { response: "roadblock", threshold: 450, pursuers: 4, searchRadius: 46, roadblocks: 2 },
  ],
  decayPerSecond: 9,
  decayDelaySeconds: 3,
  escapeSeconds: 8,
  standDownSeconds: 4,
  searchGrowthPerSecond: 1.4,
  searchRadiusMax: 90,
  spawnRingRadius: [44, 62],
  seed: 20260712,
};

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

/**
 * The pursuit slice: HHPD's wanted response over the shared `ai/policeResponse` primitive, the cops
 * that search the last sighting, and the cruiser cars — all keyed off the player's world position,
 * which it reads through the {@link Driving} seam. Heat only rises while a witness has the player in
 * view, the search area sits where that witness last saw them, and the heat bleeds once nobody does.
 * Cruiser cars reuse driving's vehicle registry (`makeCarSim`/`refreshClamp`/`dropCarSim`).
 */
/**
 * What a reload has to keep or the difficulty silently changes: the heat curve, the sight timer, the
 * search area's anchor and the tier's own counters, plus the pursuit's peak tier and cadence clocks.
 * The per-officer AI state (`copPursuit`, `copSearchAngle`, `cruiserDrivers`) is keyed by entity id and
 * rebuilt from the officers that respawn, so it is deliberately not carried.
 */
export interface PursuitSave {
  police: PoliceResponseState;
  peakStars: number;
  lastNoticeTier: number;
  copTimer: number;
  copCounter: number;
  cruiserTimer: number;
  cruiserCounter: number;
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
  function freshPolice(): PoliceResponse {
    return createPoliceResponse({
      witness: perception,
      observers: () => witnessRoster,
      suspectId: "sighting-player",
      ...POLICE_TUNING,
    });
  }
  let police: PoliceResponse = freshPolice();
  let peakStars = 0;
  let copTimer = 0;
  let copCounter = 0;
  let lastNoticeTier = 0;
  const rng = seededRng("harbor-heat-cops");
  let cruiserCounter = 0;
  let cruiserTimer = 0;
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
    const area = police.searchArea();
    wantedStore.write(ctx, {
      heat: police.wanted().heat,
      stars: tierStars(police.wanted().tier?.threshold ?? 0),
      peakStars,
      response: police.wanted().response,
      search: area === null ? null : { center: [area.center[0], area.center[1]], radius: area.radius, lastSeenAt: area.lastSeenAt },
    } satisfies WantedSnapshot);
  }

  /**
   * Tiers are the authored table; stars are its index, so the HUD keeps five pips while every rule
   * (cruisers, arrest fines, courier heat) reads the same 0..5 number.
   */
  function tierStars(threshold: number): number {
    const tiers = POLICE_TUNING.tiers ?? DEFAULT_POLICE_TUNING.tiers;
    let stars = 0;
    for (const tier of tiers) if (threshold >= tier.threshold) stars += 1;
    return Math.min(MAX_STARS, stars);
  }

  function tierThresholdAt(heat: number): number {
    let threshold = 0;
    for (const tier of POLICE_TUNING.tiers ?? DEFAULT_POLICE_TUNING.tiers) if (heat >= tier.threshold) threshold = tier.threshold;
    return threshold;
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

    const area = police.searchArea();
    const around: readonly [number, number] = area === null ? [playerPos[0], playerPos[2]] : area.center;
    const step = police.tick(dt, { nowMs, activePursuers: cops.length, around, hidden: hiddenNow });
    const wanted = police.wanted();
    const stars = tierStars(wanted.tier?.threshold ?? 0);
    peakStars = Math.max(peakStars, stars);
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

    if (step.wantPursuers > 0) {
      copTimer -= dt;
      if (copTimer <= 0) {
        copTimer = Math.max(2, 8 - stars * 1.2);
        copCounter += 1;
        const [x, z] = step.spawnPoints[0] ?? around;
        ctx.scene.entity.spawn(stars >= 4 ? "cop_swat" : "cop_patrol", {
          id: `cop_${copCounter}`,
          position: [x, ctx.world.groundHeightAt(x, z), z],
          role: "npc",
        });
      }
    }
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
    const area = police.searchArea();

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
    const wanted = police.wanted();
    const level = tierStars(wanted.tier?.threshold ?? 0);
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const area = police.searchArea();
    const searchCenter: readonly [number, number] = area === null ? [playerPos[0], playerPos[2]] : area.center;
    /**
     * Cruisers drive to the last sighting; they only turn for the player once they can see them. The
     * chase band belongs to that second leg, so a search leg steers to a point instead of tailing one.
     */
    const chasing =
      area === null || Math.hypot(playerPos[0] - area.center[0], playerPos[2] - area.center[1]) < CHASE_RADIUS;
    const target: readonly [number, number] = chasing ? [playerPos[0], playerPos[2]] : searchCenter;
    const cruisers = ctx.scene.entity.list().filter((e) => e.id.startsWith("cruiser_"));

    if (level >= PURSUIT_STARS) {
      cruiserTimer -= dt;
      if (cruiserTimer <= 0 && cruisers.length < level - 1) {
        cruiserTimer = 9;
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
      const result = tickDrivableVehicle(vehicle, dt, axis, { groundHeight: (x, z) => ctx.world.groundHeightAt(x, z) });
      ctx.scene.entity.setPose(cruiser.id, result.pose);
      const drivenId = driving.drivingVehicleId();
      if (dist < 4 && drivenId !== null) {
        landHit(ctx, { from: cruiser.id, to: drivenId, type: "impact", base: Math.round(24 * dt * 10) / 10 });
      }
    }
  }

  return {
    addHeat(_ctx, amount) {
      if (amount > 0) police.reportCrime(amount);
    },
    forgiveHeat(ctx, amount) {
      const left = police.forgive(Math.max(0, amount));
      publishWanted(ctx);
      return tierStars(tierThresholdAt(left));
    },
    setHidden(hidden) {
      hiddenNow = hidden;
    },
    hidden: () => hiddenNow,
    setWitnessFilter(filter) {
      quiet = filter;
    },
    heatForStars(stars) {
      const tiers = POLICE_TUNING.tiers ?? DEFAULT_POLICE_TUNING.tiers;
      return stars <= 0 ? 0 : (tiers[Math.min(tiers.length, stars) - 1]?.threshold ?? 0);
    },
    clearWanted(ctx) {
      police = freshPolice();
      witnessRoster = [];
      peakStars = 0;
      lastNoticeTier = 0;
      copPursuit.clear();
      copSearchAngle.clear();
      cruiserDrivers.clear();
      publishWanted(ctx);
    },
    snapshot: () => ({
      police: police.state(),
      peakStars,
      lastNoticeTier,
      copTimer,
      copCounter,
      cruiserTimer,
      cruiserCounter,
    }),
    restore(ctx, state) {
      police.restore(state.police);
      peakStars = state.peakStars;
      lastNoticeTier = state.lastNoticeTier;
      copTimer = state.copTimer;
      copCounter = state.copCounter;
      cruiserTimer = state.cruiserTimer;
      cruiserCounter = state.cruiserCounter;
      // Publish the restored heat so the HUD and every rule read what the reload kept.
      publishWanted(ctx);
    },
    wanted: () => {
      const current = police.wanted();
      const area = police.searchArea();
      return {
        heat: current.heat,
        stars: tierStars(current.tier?.threshold ?? 0),
        peakStars,
        response: current.response,
        search: area === null ? null : { center: [area.center[0], area.center[1]], radius: area.radius, lastSeenAt: area.lastSeenAt },
      };
    },
    tickWanted,
    tickCops,
    tickCruisers,
  };
}

