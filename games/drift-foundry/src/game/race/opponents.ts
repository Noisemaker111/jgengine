import { difficultyProfile, type DifficultyProfile, type DifficultyTier } from "@jgengine/core/ai/difficulty";
import {
  createDriverState,
  driveStep,
  pathTargetAhead,
  type DrivePathPoint,
  type DriverState,
  type DriverTuning,
  type PaceBand,
} from "@jgengine/core/ai/driver";
import { seededRng, type SeededRng } from "@jgengine/core/random/rng";

import { MAIN_ROUTE } from "@jgengine/core/world/routeCourse";

import { tuningFrom, type KartTuning } from "../parts/build";
import { partById, type PartIconId } from "../parts/catalog";
import { ROUTE_GATES } from "../route/gates";
import { EXIT_Z, RUN_SEED, SPAWN_Z } from "../run/constants";
import { ROW_SIX_TRACK, type Track } from "../tracks/catalog";
import { createVehicleController, type VehicleController, type VehiclePose } from "../vehicle/controller";

/**
 * Three yard karts that race the same authored corridor as the player. The driving itself is the
 * shared brain (`@jgengine/core/ai/driver`): `pathTargetAhead` walks the rival's line and `driveStep`
 * turns pose + goal + a `DifficultyProfile` into throttle/brake/steer for the same composed
 * `KinematicVehicle` the player drives. This module is the grid, the lines, and the contact rule.
 */

/** The kart a rival drives, and the line it drives. All numbers are authored feel. */
export interface RivalDef {
  id: string;
  name: string;
  entityKind: string;
  /** Decision quality: reaction delay, steering wobble, how late obstacles are perceived. */
  tier: DifficultyTier;
  /** Fraction of the composed top speed the driver holds on a straight. */
  pace: number;
  /** Pure-pursuit distance, metres. Longer cuts a wide, clean entry; shorter hunts segment to segment. */
  lookahead: number;
  /** The build bolted onto this kart - the same parts and the same composer the player uses. */
  parts: readonly PartIconId[];
  /**
   * How much of the field's pace aid this driver accepts, 0..1. The yard champion runs honest and
   * barely concedes a lead; the rookie takes the full band, so a bad start is recoverable from.
   */
  band: number;
  /** Grid slot: `x` metres left of the centreline, `z` run metres past the start line. */
  grid: { x: number; z: number };
  /**
   * Lateral offset from the centreline at spawn, then at each Row Six gate, then the exit. On another
   * track the same knots are spread evenly down the run and scaled to that road's width.
   */
  line: readonly number[];
}

export const RIVAL_DEFS: readonly RivalDef[] = [
  {
    id: "rival_tally",
    name: "TALLY",
    entityKind: "kart_rival_tally",
    tier: "easy",
    pace: 0.9,
    lookahead: 5,
    parts: ["ev_conversion", "plow_blade", "coil_springs", "scrap_frame"],
    band: 1,
    grid: { x: -3.4, z: 12 },
    // No rhythm: drifts across the haul strip gate to gate, so it sheds speed in every correction.
    line: [0, -5, -3.4, -4.6, -3, -4.8, -3.2, -4.4, -3, 0],
  },
  {
    id: "rival_moss",
    name: "MOSS",
    entityKind: "kart_rival_moss",
    tier: "standard",
    pace: 0.97,
    lookahead: 9,
    parts: ["salvage_v6", "plow_blade", "coil_springs", "scrap_frame"],
    band: 0.8,
    grid: { x: 3.4, z: 17 },
    // A weaver: takes the free side of each barricade, so it is often off-line and re-aiming.
    line: [0, 3, -2.4, 2.6, -3, 3.2, -2.4, 2.8, -3, 0],
  },
  {
    id: "rival_hobbs",
    name: "HOBBS",
    entityKind: "kart_rival_hobbs",
    tier: "expert",
    pace: 1,
    lookahead: 15,
    parts: ["truck_engine", "plow_blade", "coil_springs", "roll_cage"],
    band: 0.5,
    grid: { x: 0, z: 24 },
    // Holds one wide outside line the whole way: fewest heading changes, so it brakes least.
    line: [0, 5, 5, 4.6, 5, 4.8, 5, 4.8, 5, 0],
  },
];

export const RIVAL_IDS = RIVAL_DEFS.map((def) => def.id);

/** Combined body radius two karts must keep apart, metres. */
const CONTACT_RADIUS = 1.7;
/** A rival keeps this long off its line after a knock - what the HUD reads as `recovering`. */
const RECOVER_SECONDS = 1.2;
/** Cars this far ahead in the same lane are what a rival perceives as a blocker. */
const CAR_SIGHT = 12;

/**
 * The field's pace aid, as a shared `PaceBand` on the driver goal: a kart far ahead of the player
 * eases off, a kart far behind gets a push, and the dead zone keeps a side-by-side fight decided by
 * driving. Per-car `band` is the share of that aid the driver accepts, so the expert concedes least.
 */
const RIVAL_PACE: PaceBand = { tolerance: 0, easeAt: 30, ease: 0.12, pushAt: 20, push: 0.08 };
export interface RivalBody {
  id: string;
  name: string;
  entityKind: string;
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
  /** Shoved off its line, or backing out of something it ground against. */
  recovering: boolean;
  /** Run metres along the track and the road height under the kart. */
  run: number;
  roadY: number;
}

export interface OpponentField {
  /**
   * Advance every rival one tick. `player` is the player's world position, for contact; `playerRun`
   * their run metres (default: world z, Row Six's run metres); `time` the run clock for timed hazards.
   */
  tick(dt: number, player: readonly [number, number, number], playerRun?: number, time?: number): void;
  bodies(): readonly RivalBody[];
  /** Racer id → world position, the map the race state machine reads. */
  positions(): Record<string, readonly [number, number, number]>;
  /** Push a rival by a world-space offset - a knock from contact. False when it was out of reach. */
  knock(id: string, dx: number, dz: number): boolean;
  /** Back to the grid, every driver state fresh. */
  reset(): void;
}

/** Rivals roll past the arch and park in the run-out, so they never stop on the finish line. */
export const RIVAL_ROLLOUT = 24;

/** The authored route with this rival's lateral bias sampled in: spawn, each barricade, the exit. */
export function rivalLine(def: RivalDef, track: Track = ROW_SIX_TRACK): readonly DrivePathPoint[] {
  if (track.id === ROW_SIX_TRACK.id) {
    const zs = [SPAWN_Z, ...ROUTE_GATES.map((gate) => gate.atZ), EXIT_Z];
    const line = zs.map((z, index) => [def.line[index] ?? def.line[def.line.length - 1] ?? 0, z] as const);
    return [...line, [0, EXIT_Z + RIVAL_ROLLOUT] as const];
  }
  const knots = def.line.length - 1;
  const scale = Math.min(1, Math.max(0.2, (track.def.halfWidth - 3) / 16));
  const offset = (progress: number): number => {
    const run = progress - track.origin;
    const at = Math.max(0, Math.min(knots, (run / track.exitAt) * knots));
    const low = Math.floor(at);
    const high = Math.min(knots, low + 1);
    return (def.line[low]! + (def.line[high]! - def.line[low]!) * (at - low)) * scale;
  };
  const take = track.def.rivalTake[def.id] ?? [];
  return track.course.line({ take, offset, step: 3 }).filter((point) => {
    const run = track.locate(point[0], point[1]).progress - track.origin;
    return run >= SPAWN_Z - 2 && run <= track.exitAt + RIVAL_ROLLOUT;
  });
}

/** Where the rival's line sits laterally at `z` - the reference an off-line kart is judged against. */
export function lineOffsetAt(def: RivalDef, z: number): number {
  const line = rivalLine(def);
  for (let index = 0; index < line.length - 1; index += 1) {
    const a = line[index]!;
    const b = line[index + 1]!;
    if (z < a[1] || z > b[1]) continue;
    const span = b[1] - a[1];
    return span === 0 ? b[0] : a[0] + ((b[0] - a[0]) * (z - a[1])) / span;
  }
  return line[line.length - 1]![0];
}

interface Rival {
  def: RivalDef;
  tuning: KartTuning;
  profile: DifficultyProfile;
  driving: DriverTuning;
  /** This kart's share of the field's pace aid, built once so the tick allocates nothing. */
  pace: PaceBand;
  driver: DriverState;
  rng: SeededRng;
  line: readonly DrivePathPoint[];
  vehicle: VehicleController;
  pose: VehiclePose;
  recoverSeconds: number;
}

function createRival(def: RivalDef, groundHeightAt: (x: number, z: number) => number, seed: string, track: Track): Rival {
  const tuning = tuningFrom(def.parts.map((id) => partById(id)!));
  const profile = difficultyProfile(def.tier);
  const grid = track.point(MAIN_ROUTE, def.grid.z, def.grid.x);
  const aim = track.point(MAIN_ROUTE, def.grid.z + def.lookahead, def.grid.x);
  return {
    def,
    tuning,
    profile,
    driving: {
      maxSpeed: tuning.topSpeed * def.pace,
      steerGain: 1.8,
      cornerSlowdown: 0.8,
      arriveRadius: 3,
      brakeMargin: 5,
      stuckSeconds: 1.2,
      reverseSeconds: 0.9,
    },
    pace: { ...RIVAL_PACE, scale: def.band },
    driver: createDriverState(aim.x, aim.z),
    rng: seededRng(`${seed}:rival:${def.id}`),
    line: rivalLine(def, track),
    vehicle: createVehicleController({ position: [grid.x, groundHeightAt(grid.x, grid.z), grid.z], heading: grid.heading }, track),
    pose: { position: [grid.x, grid.elevation, grid.z], heading: grid.heading, speedKmh: 0, slip: 0, surface: 1, loadGrip: 1, airborne: false, blockedByGate: false, run: def.grid.z, lateral: def.grid.x, route: MAIN_ROUTE, roadY: grid.elevation },
    recoverSeconds: 0,
  };
}

/** Springs under the nose: a rival hops the ramp it is about to reach, exactly like the HUD cue tells the player to. */
function rampAhead(pose: VehiclePose, track: Track): boolean {
  const run = pose.run ?? pose.position[2];
  const route = pose.route ?? MAIN_ROUTE;
  const gate = track.gates.find((entry) => entry.requirement === "jump" && entry.route === route && entry.atZ >= run);
  if (gate === undefined) return false;
  const lead = Math.max(5, (pose.speedKmh / 3.6) * 0.5);
  return gate.atZ - run <= lead;
}

/** `others` in track terms - lateral offset and run metres - so a switchback's next leg is never "ahead". */
function gapToCarAhead(rival: Rival, others: readonly { x: number; z: number }[]): number | null {
  let nearest: number | null = null;
  const run = rival.pose.run ?? rival.pose.position[2];
  const lateral = rival.pose.lateral ?? rival.pose.position[0];
  for (const other of others) {
    const dz = other.z - run;
    if (dz <= 0 || dz > CAR_SIGHT) continue;
    if (Math.abs(other.x - lateral) > CONTACT_RADIUS) continue;
    if (nearest === null || dz < nearest) nearest = dz;
  }
  return nearest;
}

/** Deterministic contact rule: a pair inside the body radius is pushed apart, rivals only. */
function separate(a: { x: number; z: number }, b: { x: number; z: number }, push: (dx: number, dz: number) => void): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= CONTACT_RADIUS) return false;
  const nx = distance === 0 ? 1 : dx / distance;
  const nz = distance === 0 ? 0 : dz / distance;
  const overlap = CONTACT_RADIUS - distance;
  push(nx * overlap, nz * overlap);
  return true;
}

export function createOpponentField(options: {
  groundHeightAt?: (x: number, z: number) => number;
  defs?: readonly RivalDef[];
  /** Seed for every rival's steering jitter. Same seed, same race. */
  seed?: string;
  /** Receives the player's half of a bumper-to-bumper contact, so a shove costs both karts. */
  onPlayerKnock?: (dx: number, dz: number) => void;
  /** The track the field races; Row Six by default. */
  track?: Track;
} = {}): OpponentField {
  const groundHeightAt = options.groundHeightAt ?? (() => 0);
  const defs = options.defs ?? RIVAL_DEFS;
  const seed = options.seed ?? RUN_SEED;
  const track = options.track ?? ROW_SIX_TRACK;
  let rivals = defs.map((def) => createRival(def, groundHeightAt, seed, track));

  const nudge = (rival: Rival, dx: number, dz: number): void => {
    rival.vehicle.shove(dx, dz);
    rival.pose = { ...rival.pose, position: [rival.pose.position[0] + dx, rival.pose.position[1], rival.pose.position[2] + dz] };
    rival.recoverSeconds = RECOVER_SECONDS;
  };

  const field: OpponentField = {
    tick(dt, player, playerRun = player[2], time = 0) {
      const playerLateral = track.id === ROW_SIX_TRACK.id ? player[0] : track.locate(player[0], player[2]).offset;
      for (const rival of rivals) {
        const target = pathTargetAhead(rival.line, rival.pose.position[0], rival.pose.position[2], rival.def.lookahead);
        const goal = {
          x: target?.[0] ?? rival.pose.position[0],
          z: target?.[1] ?? rival.pose.position[2],
          // The field's catch-up band on the shared goal: the kart stays reachable without ever
          // driving faster than its authored build allows.
          paceGap: (rival.pose.run ?? rival.pose.position[2]) - playerRun,
          paceBand: rival.pace,
        };
        const others = [
          { x: playerLateral, z: playerRun },
          ...rivals.filter((entry) => entry !== rival).map((entry) => ({ x: entry.pose.lateral ?? entry.pose.position[0], z: entry.pose.run ?? entry.pose.position[2] })),
        ];
        const step = driveStep(
          rival.driver,
          dt,
          { x: rival.pose.position[0], z: rival.pose.position[2], heading: rival.pose.heading, speed: rival.pose.speedKmh / 3.6 },
          goal,
          rival.profile,
          rival.driving,
          rival.rng,
          gapToCarAhead(rival, others),
        );
        rival.pose = rival.vehicle.tick(
          dt,
          {
            throttle: step.throttle,
            brake: step.brake,
            // `driveStep` returns steer as the signed heading error (ai/driver.ts:169), but the shared
            // steering convention is the opposite: `steerYaw` decreases yaw for +steer (movement/
            // steering.ts:35) and `steerToward` returns the negated error (:47). Adopting the driver as
            // shipped therefore drives a kart away from its target; delete this negation once
            // ai/driver agrees with steerToward.
            steer: -step.steer,
            handbrake: step.handbrake,
          },
          rival.tuning,
          { jumpPressed: rampAhead(rival.pose, track), plowBracing: false, time },
          groundHeightAt,
        );
        if (rival.recoverSeconds > 0) rival.recoverSeconds = Math.max(0, rival.recoverSeconds - dt);
      }

      for (let index = 0; index < rivals.length; index += 1) {
        const rival = rivals[index]!;
        // Both karts move half the overlap: bumper contact costs the player time too, instead of the
        // field being free wrecking balls for them to bulldoze.
        separate({ x: player[0], z: player[2] }, { x: rival.pose.position[0], z: rival.pose.position[2] }, (dx, dz) => {
          nudge(rival, dx / 2, dz / 2);
          options.onPlayerKnock?.(-dx / 2, -dz / 2);
        });
        for (let other = index + 1; other < rivals.length; other += 1) {
          const second = rivals[other]!;
          separate(
            { x: rival.pose.position[0], z: rival.pose.position[2] },
            { x: second.pose.position[0], z: second.pose.position[2] },
            (dx, dz) => {
              nudge(rival, dx / 2, dz / 2);
              nudge(second, -dx / 2, -dz / 2);
            },
          );
        }
      }
    },
    bodies() {
      return rivals.map((rival) => ({
        id: rival.def.id,
        name: rival.def.name,
        entityKind: rival.def.entityKind,
        position: rival.pose.position,
        heading: rival.pose.heading,
        speedKmh: rival.pose.speedKmh,
        recovering: rival.recoverSeconds > 0 || rival.driver.reverseRemaining > 0,
        run: rival.pose.run ?? rival.pose.position[2],
        roadY: rival.pose.roadY ?? 0,
      }));
    },
    positions() {
      const map: Record<string, readonly [number, number, number]> = {};
      for (const rival of rivals) map[rival.def.id] = rival.pose.position;
      return map;
    },
    knock(id, dx, dz) {
      const rival = rivals.find((entry) => entry.def.id === id);
      if (rival === undefined) return false;
      nudge(rival, dx, dz);
      return true;
    },
    reset() {
      rivals = defs.map((def) => createRival(def, groundHeightAt, seed, track));
    },
  };
  return field;
}
