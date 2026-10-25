import { NEUTRAL_AXIS } from "@jgengine/core/input/axisInput";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import {
  createKinematicVehicle,
  type KinematicVehicle,
  type KinematicVehicleModifiers,
  type KinematicVehicleTuning,
} from "@jgengine/core/physics/kinematicVehicle";
import type { CourseFix } from "@jgengine/core/world/routeCourse";

import { blockedZ, courseBlock } from "../route/gates";
import { CORRIDOR_DRIVE_HALF_WIDTH } from "../run/constants";
import type { KartTuning } from "../parts/build";
import type { ActiveHazard, Track } from "../tracks/catalog";
import { hazardFeel, surfaceAt, surfaceFrictionAt } from "./surface";

const METERS_PER_SECOND_TO_KMH = 3.6;
/** Baseline hop every kart gets before `jumpPower` from installed springs is added. */
const STUB_HOP_IMPULSE = 3.2;
const BRACE_ACCEL_BONUS = 0.18;
const BRACE_TURN_PENALTY = 0.25;

export interface DriveAxis {
  throttle: number;
  brake: number;
  steer: number;
  /** Pulled only when the driver asks for it; absent means no handbrake. */
  handbrake?: number;
}

export interface VehiclePose {
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
  /** Lateral/forward slip ratio this tick - drives drift reads and evidence. */
  slip: number;
  /** Surface grip multiplier the sim sampled under the kart this tick. */
  surface: number;
  /** Grip left after weight transfer this tick (1 = a straight, unloaded kart). */
  loadGrip: number;
  airborne: boolean;
  blockedByGate: boolean;
  /** Run metres along the track (world z when no track is laid). */
  run?: number;
  /** Metres left of the track's centreline (world x when no track is laid). */
  lateral?: number;
  /** Route the kart is on: the main line or a shortcut. */
  route?: string;
  /** Height of the road under the kart, metres. */
  roadY?: number;
  /** A train on a crossing stopped this move. */
  blockedByTrain?: string | null;
  /** Hazards under the kart this tick. */
  hazards?: readonly ActiveHazard[];
}

export interface VehicleController {
  tick(
    dt: number,
    axis: DriveAxis,
    tuning: KartTuning,
    input: { jumpPressed: boolean; plowBracing: boolean; time?: number },
    groundHeightAt: (x: number, z: number) => number,
  ): VehiclePose;
  resetTo(position: readonly [number, number, number], heading: number): void;
  /** Displace the kart without costing it its momentum - a shove from another bumper. */
  shove(dx: number, dz: number): void;
  /** Where the kart sits on the track, or `null` off a track. */
  fix(): CourseFix | null;
}

/** A braced plow stiffens the whole drivetrain: more push and stopping power, less turn-in. */
const BRACED: KinematicVehicleModifiers = {
  accelScale: 1 + BRACE_ACCEL_BONUS,
  topSpeedScale: 1 + BRACE_ACCEL_BONUS,
  brakeScale: 1 + BRACE_ACCEL_BONUS,
  turnRateScale: 1 - BRACE_TURN_PENALTY,
};

/**
 * `track` lays the kart on a route course: the course's walls clamp every move, its barricades and
 * crossings veto the moves that would pass them, and its hazards set the grip, drag and belt push.
 * Without one the kart drives Row Six's legacy straight corridor (the feel-parity tests use that).
 */
export function createVehicleController(
  spawn: {
    position: readonly [number, number, number];
    heading: number;
  },
  track?: Track,
): VehicleController {
  /**
   * The walls and the barricades are the same thing to the sim: a veto on where this tick's move may
   * land. Routing both through `clampMove` means velocity is rederived from the displacement actually
   * permitted, so a kart pinned against a gate stops dead instead of grinding its stored velocity into
   * it. `frameTuning` is refreshed each tick because which barricades are open depends on the parts.
   */
  let frameTuning: KartTuning | null = null;
  let blockedByGate = false;
  let blockedByTrain: string | null = null;
  let airHeight = 0;
  let time = 0;
  let fix: CourseFix | null = track === undefined ? null : track.locate(spawn.position[0], spawn.position[2]);
  let grip = 1;
  let drag = 0;

  const clampTrack = (course: Track, x: number, z: number): readonly [number, number] => {
    const clamped = course.course.clamp(x, z, fix);
    if (frameTuning === null || fix === null) {
      fix = clamped.fix;
      return [clamped.x, clamped.z];
    }
    const block = courseBlock(course, fix, clamped.fix, frameTuning, airHeight, time);
    if (block === null) {
      fix = clamped.fix;
      return [clamped.x, clamped.z];
    }
    blockedByGate = block.gate !== null;
    blockedByTrain = block.train;
    const stop = course.point(clamped.fix.route, block.run, clamped.fix.offset);
    const held = course.course.clamp(stop.x, stop.z, fix);
    fix = held.fix;
    return [held.x, held.z];
  };

  const vehicle: KinematicVehicle = createKinematicVehicle(
    // Placeholder handling: the first tick retunes to the kart's real, parts-composed tuning.
    { engineAccel: 1, brakeAccel: 1, topSpeed: 1, reverseSpeed: 0, turnRate: 1, turnSpeedRef: 6, gripStrength: 7, handbrakeGrip: 1 },
    {
      position: spawn.position,
      heading: spawn.heading,
      // The yard's own surfaces: oil, concrete and gravel grip differently, and the shoulders outside
      // the paved strip grip less than all three. On a track the grip is read from this tick's fix.
      surfaceFriction: track === undefined ? surfaceFrictionAt : () => grip,
      dragAt: () => drag,
      clampMove: (from, to) => {
        if (track !== undefined) return clampTrack(track, to[0], to[1]);
        const x = Math.max(-CORRIDOR_DRIVE_HALF_WIDTH, Math.min(CORRIDOR_DRIVE_HALF_WIDTH, to[0]));
        if (frameTuning === null) return [x, to[1]];
        const allowedZ = blockedZ(x, from[1], to[1], frameTuning, airHeight);
        blockedByGate = allowedZ < to[1] - 1e-6;
        return [x, Math.min(to[1], allowedZ)];
      },
    },
  );

  let appliedHandling: KinematicVehicleTuning | null = null;

  const shove = (dx: number, dz: number): void => {
    // `restore` carries velocity, so a knock moves the kart and leaves the wheel and pedal work
    // the driver had built up intact; `resetTo` would stop it dead. The knock still respects the
    // walls and an uncleared barricade, so contact can never push a kart through a gate.
    const state = vehicle.snapshot();
    if (track !== undefined) {
      const [x, z] = clampTrack(track, state.x + dx, state.z + dz);
      vehicle.restore({ ...state, x, z });
      return;
    }
    const x = Math.max(-CORRIDOR_DRIVE_HALF_WIDTH, Math.min(CORRIDOR_DRIVE_HALF_WIDTH, state.x + dx));
    const candidateZ = state.z + dz;
    const z = frameTuning === null ? candidateZ : Math.min(candidateZ, blockedZ(x, state.z, candidateZ, frameTuning, airHeight));
    vehicle.restore({ ...state, x, z });
  };


  return {
    tick(dt, axis, tuning, input, groundHeightAt) {
      // Parts installed mid-run, and damage bent into the frame, arrive as a fresh composed tuning
      // object; `retune` swaps it in without costing the kart the momentum a rebuilt sim would drop.
      if (tuning.handling !== appliedHandling) {
        vehicle.retune(tuning.handling);
        appliedHandling = tuning.handling;
      }
      frameTuning = tuning;
      blockedByGate = false;
      blockedByTrain = null;
      time = input.time ?? time;

      // Hazards are read where the kart stands at the start of the tick: grip, drag, a slowed engine.
      const hazards = track !== undefined && fix !== null ? track.hazardsAt(fix, time) : [];
      const feel = hazardFeel(hazards);
      if (track !== undefined && fix !== null) {
        grip = surfaceAt(fix.offset, track.run(fix), track, hazards).grip;
        drag = feel.drag;
      }

      const braced = input.plowBracing && tuning.hasPlow;
      if (input.jumpPressed) vehicle.hop(STUB_HOP_IMPULSE + tuning.jumpPower);
      const modifiers: KinematicVehicleModifiers | undefined =
        feel.topSpeedScale < 1 ? { ...(braced ? BRACED : {}), topSpeedScale: (braced ? BRACED.topSpeedScale! : 1) * feel.topSpeedScale } : braced ? BRACED : undefined;

      const drive = tickDrivableVehicle(
        vehicle,
        dt,
        {
          ...NEUTRAL_AXIS,
          throttle: axis.throttle,
          brake: axis.brake,
          steer: axis.steer,
          handbrake: axis.handbrake ?? 0,
        },
        { groundHeight: groundHeightAt, modifiers },
      );
      airHeight = drive.step.airOffset;
      let position = drive.pose.position;

      // A belt carries the kart along (or against) the road without touching its own velocity.
      if (track !== undefined && fix !== null && feel.push !== 0) {
        const heading = fix.heading;
        shove(Math.sin(heading) * feel.push * dt, Math.cos(heading) * feel.push * dt);
        const state = vehicle.snapshot();
        position = [state.x, position[1], state.z];
      }

      return {
        position,
        heading: drive.step.heading,
        speedKmh: Math.abs(drive.step.forwardSpeed) * METERS_PER_SECOND_TO_KMH,
        slip: drive.step.slip,
        surface: drive.step.surface,
        loadGrip: drive.step.loadGrip,
        airborne: drive.step.airborne,
        blockedByGate,
        run: fix === null || track === undefined ? position[2] : track.run(fix),
        lateral: fix === null ? position[0] : fix.offset,
        route: fix?.route ?? "main",
        roadY: fix?.elevation ?? 0,
        blockedByTrain,
        hazards,
      };
    },
    resetTo(position, resetHeading) {
      vehicle.resetTo(position, resetHeading);
      blockedByGate = false;
      blockedByTrain = null;
      airHeight = 0;
      if (track !== undefined) fix = track.locate(position[0], position[2]);
    },
    shove,
    fix() {
      return fix;
    },
  };
}
