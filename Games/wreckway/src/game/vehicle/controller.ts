import { NEUTRAL_AXIS } from "@jgengine/core/input/axisInput";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import {
  createKinematicVehicle,
  type KinematicVehicle,
  type KinematicVehicleModifiers,
  type KinematicVehicleTuning,
} from "@jgengine/core/physics/kinematicVehicle";

import { blockedZ } from "../route/gates";
import { CORRIDOR_DRIVE_HALF_WIDTH } from "../run/constants";
import type { KartTuning } from "../parts/build";

const METERS_PER_SECOND_TO_KMH = 3.6;
/** Downward acceleration on a hop, world units/s² — snappier than real gravity so airs stay short. */
const HOP_GRAVITY = 22;
/** Baseline hop every kart gets before `jumpPower` from installed springs is added. */
const STUB_HOP_IMPULSE = 3.2;
const BRACE_ACCEL_BONUS = 0.18;
const BRACE_TURN_PENALTY = 0.25;
const GRIP_STRENGTH = 7;
const TURN_SPEED_REF = 6;
/** Flat coast deceleration with throttle and brake released, world units/s². */
const ROLLING_DRAG = 3.5;
/** Brake force as a multiple of engine accel — a kart stops harder than it launches. */
const BRAKE_ACCEL_FACTOR = 1.3;
/** Reverse tops out at this fraction of forward top speed... */
const REVERSE_SPEED_FRACTION = 0.35;
/** ...and pushes at this fraction of engine accel getting there. */
const REVERSE_FORCE_SCALE = 0.6;

export interface DriveAxis {
  throttle: number;
  brake: number;
  steer: number;
}

export interface VehiclePose {
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
  airborne: boolean;
  blockedByGate: boolean;
}

export interface VehicleController {
  tick(
    dt: number,
    axis: DriveAxis,
    tuning: KartTuning,
    input: { jumpPressed: boolean; plowBracing: boolean },
    groundHeightAt: (x: number, z: number) => number,
  ): VehiclePose;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

/**
 * Project a kart's part-derived stats onto the shared arcade car sim. Everything here is a wreckway
 * feel constant; the integration itself — steer-yaw scaled by speed, throttle/brake, grip-curve slip
 * bleed, coast drag, the hop — lives in `@jgengine/core/physics/kinematicVehicle`.
 */
function kinematicTuningFor(kart: KartTuning): KinematicVehicleTuning {
  return {
    engineAccel: kart.engineAccel,
    brakeAccel: kart.engineAccel * BRAKE_ACCEL_FACTOR,
    topSpeed: kart.topSpeed,
    reverseSpeed: kart.topSpeed * REVERSE_SPEED_FRACTION,
    reverseForceScale: REVERSE_FORCE_SCALE,
    turnRate: kart.turnRate,
    turnSpeedRef: TURN_SPEED_REF,
    gripStrength: GRIP_STRENGTH,
    // No handbrake in wreckway — 1 leaves grip untouched even if the axis is ever wired up.
    handbrakeGrip: 1,
    coastDeceleration: ROLLING_DRAG,
    hopGravity: HOP_GRAVITY,
  };
}

/** A braced plow stiffens the whole drivetrain: more push and stopping power, less turn-in. */
const BRACED: KinematicVehicleModifiers = {
  accelScale: 1 + BRACE_ACCEL_BONUS,
  topSpeedScale: 1 + BRACE_ACCEL_BONUS,
  brakeScale: 1 + BRACE_ACCEL_BONUS,
  turnRateScale: 1 - BRACE_TURN_PENALTY,
};

export function createVehicleController(spawn: {
  position: readonly [number, number, number];
  heading: number;
}): VehicleController {
  /**
   * The corridor walls and the route barricades are the same thing to the sim: a veto on where this
   * tick's move may land. Routing both through `clampMove` means velocity is rederived from the
   * displacement actually permitted, so a kart pinned against a gate stops dead instead of grinding
   * its stored velocity into it. `frameTuning` is refreshed each tick because which barricades are
   * open depends on the parts currently installed.
   */
  let frameTuning: KartTuning | null = null;
  let blockedByGate = false;

  const vehicle: KinematicVehicle = createKinematicVehicle(
    // Placeholder stats: the first tick retunes to the kart's real, part-derived numbers.
    kinematicTuningFor({ topSpeed: 1, engineAccel: 1, turnRate: 1, jumpPower: 0, hasPlow: false, armorCharges: 0 }),
    {
      position: spawn.position,
      heading: spawn.heading,
      clampMove: (from, to) => {
        const x = Math.max(-CORRIDOR_DRIVE_HALF_WIDTH, Math.min(CORRIDOR_DRIVE_HALF_WIDTH, to[0]));
        if (frameTuning === null) return [x, to[1]];
        const allowedZ = blockedZ(x, from[1], to[1], frameTuning);
        blockedByGate = allowedZ < to[1] - 1e-6;
        return [x, Math.min(to[1], allowedZ)];
      },
    },
  );

  let appliedTuning: KartTuning | null = null;

  return {
    tick(dt, axis, tuning, input, groundHeightAt) {
      // Parts installed mid-run change the kart's stats; `retune` swaps them in without costing the
      // kart the momentum a rebuilt sim would drop.
      if (appliedTuning === null || !sameKart(appliedTuning, tuning)) {
        vehicle.retune(kinematicTuningFor(tuning));
        appliedTuning = tuning;
      }
      frameTuning = tuning;
      blockedByGate = false;

      const braced = input.plowBracing && tuning.hasPlow;
      if (input.jumpPressed) vehicle.hop(STUB_HOP_IMPULSE + tuning.jumpPower);

      const drive = tickDrivableVehicle(
        vehicle,
        dt,
        { ...NEUTRAL_AXIS, throttle: axis.throttle, brake: axis.brake, steer: axis.steer },
        { groundHeight: groundHeightAt, modifiers: braced ? BRACED : undefined },
      );

      return {
        position: drive.pose.position,
        heading: drive.step.heading,
        speedKmh: Math.abs(drive.step.forwardSpeed) * METERS_PER_SECOND_TO_KMH,
        airborne: drive.step.airborne,
        blockedByGate,
      };
    },
    resetTo(position, resetHeading) {
      vehicle.resetTo(position, resetHeading);
      blockedByGate = false;
    },
  };
}

/** Stats-equal check — avoids rebuilding the tuning block on every tick of an unchanged build. */
function sameKart(a: KartTuning, b: KartTuning): boolean {
  return (
    a.topSpeed === b.topSpeed &&
    a.engineAccel === b.engineAccel &&
    a.turnRate === b.turnRate &&
    a.jumpPower === b.jumpPower &&
    a.hasPlow === b.hasPlow
  );
}
