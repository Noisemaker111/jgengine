import type { PhysicsWorld } from "./physicsWorld";
import type { AxisInput } from "../input/axisInput";

export interface GripCurve {
  points: readonly (readonly [number, number])[];
}

/**
 * Piecewise-linear tire-grip curve: normalized lateral slip → available grip (0..1). Grip peaks near
 * the breakaway slip then falls off as the tire slides — the shape that separates a planted corner
 * from a drift. Points are read in ascending slip order; ends clamp.
 */
export function sampleGripCurve(curve: GripCurve, slip: number): number {
  const pts = curve.points;
  if (pts.length === 0) return 1;
  const s = Math.abs(slip);
  if (s <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i += 1) {
    const [x1, y1] = pts[i]!;
    if (s <= x1) {
      const [x0, y0] = pts[i - 1]!;
      const span = x1 - x0;
      const t = span <= 0 ? 0 : (s - x0) / span;
      return y0 + (y1 - y0) * t;
    }
  }
  return pts[pts.length - 1]![1];
}

export const DEFAULT_GRIP_CURVE: GripCurve = {
  points: [
    [0, 1],
    [0.2, 1],
    [0.45, 0.78],
    [1, 0.55],
  ],
};

export interface WheelSpec {
  offset: readonly [number, number, number];
  radius?: number;
  restLength?: number;
  steered?: boolean;
  powered?: boolean;
  handbrakeLocks?: boolean;
}

export interface WheelState {
  worldX: number;
  worldY: number;
  worldZ: number;
  grounded: boolean;
  compression: number;
  steerAngle: number;
}

export interface VehicleBodyConfig {
  position: readonly [number, number, number];
  heading?: number;
  chassisHalfExtents?: readonly [number, number, number];
  mass?: number;
  wheels?: readonly WheelSpec[];
  engineAccel?: number;
  brakeAccel?: number;
  topSpeed?: number;
  reverseSpeed?: number;
  turnRate?: number;
  turnSpeedRef?: number;
  grip?: GripCurve;
  gripStrength?: number;
  handbrakeGrip?: number;
  rollingResistance?: number;
  suspensionRest?: number;
  suspensionStiffness?: number;
  suspensionDamping?: number;
  groundHeight?: (x: number, z: number) => number;
  surfaceFriction?: (x: number, z: number) => number;
}

function cornerWheels(half: readonly [number, number, number], rest: number, radius: number): WheelSpec[] {
  const x = half[0];
  const z = half[2];
  const y = -half[1];
  return [
    { offset: [-x, y, z], steered: true, restLength: rest, radius },
    { offset: [x, y, z], steered: true, restLength: rest, radius },
    { offset: [-x, y, -z], powered: true, handbrakeLocks: true, restLength: rest, radius },
    { offset: [x, y, -z], powered: true, handbrakeLocks: true, restLength: rest, radius },
  ];
}

/**
 * Arcade vehicle over the {@link PhysicsWorld} rigid-body sim. The chassis is a single box body driven
 * by an {@link AxisInput}: per-wheel suspension is a spring-damper held with G3's `springJoint` against
 * the sampled ground, drive/brake push along the heading, and a tire-grip curve bleeds lateral velocity
 * (cornering, and drift under handbrake). Because the chassis is a physics body it still collides — that
 * contact feeds crash damage. Call `update(dt, input)` before the shared `world.step(dt)`.
 */
export class VehicleBody {
  heading: number;
  readonly chassis: number;
  private readonly world: PhysicsWorld;
  private readonly wheels: readonly WheelSpec[];
  private readonly springs: number[];
  private readonly wheelStates: WheelState[];
  private readonly engineAccel: number;
  private readonly brakeAccel: number;
  private readonly topSpeed: number;
  private readonly reverseSpeed: number;
  private readonly turnRate: number;
  private readonly turnSpeedRef: number;
  private readonly grip: GripCurve;
  private readonly gripStrength: number;
  private readonly handbrakeGrip: number;
  private readonly rollingResistance: number;
  private readonly suspensionRest: number;
  private readonly groundHeight: (x: number, z: number) => number;
  private readonly surfaceFriction: (x: number, z: number) => number;
  private groundedCount = 0;

  constructor(world: PhysicsWorld, config: VehicleBodyConfig) {
    this.world = world;
    this.heading = config.heading ?? 0;
    const half = config.chassisHalfExtents ?? [0.9, 0.35, 1.8];
    this.suspensionRest = config.suspensionRest ?? 0.55;
    const radius = 0.35;
    this.wheels = config.wheels ?? cornerWheels(half, this.suspensionRest, radius);
    this.engineAccel = config.engineAccel ?? 18;
    this.brakeAccel = config.brakeAccel ?? 26;
    this.topSpeed = config.topSpeed ?? 28;
    this.reverseSpeed = config.reverseSpeed ?? 10;
    this.turnRate = config.turnRate ?? 1.6;
    this.turnSpeedRef = config.turnSpeedRef ?? 8;
    this.grip = config.grip ?? DEFAULT_GRIP_CURVE;
    this.gripStrength = config.gripStrength ?? 8;
    this.handbrakeGrip = config.handbrakeGrip ?? 0.35;
    this.rollingResistance = config.rollingResistance ?? 0.6;
    const stiffness = config.suspensionStiffness ?? 60;
    const damping = config.suspensionDamping ?? 8;
    this.groundHeight = config.groundHeight ?? (() => 0);
    this.surfaceFriction = config.surfaceFriction ?? (() => 1);

    this.chassis = world.addBody({
      position: config.position,
      halfExtents: half,
      mass: config.mass ?? 4,
    });

    this.springs = [];
    this.wheelStates = [];
    for (const wheel of this.wheels) {
      const worldPos = this.wheelMount(wheel);
      const rest = wheel.restLength ?? this.suspensionRest;
      const id = world.springJoint({
        bodyA: this.chassis,
        anchorA: this.rotateOffset(wheel.offset),
        anchorB: [worldPos[0], worldPos[1] - rest, worldPos[2]],
        restLength: rest,
        stiffness,
        damping,
      });
      this.springs.push(id);
      this.wheelStates.push({
        worldX: worldPos[0],
        worldY: worldPos[1],
        worldZ: worldPos[2],
        grounded: false,
        compression: 0,
        steerAngle: 0,
      });
    }
  }

  /**
   * A wheel's local offset rotated by the current heading — the ground-side mount and the
   * chassis-side spring anchor both derive from this, so the suspension axis stays vertical (not a
   * mix of rotated and unrotated ends) as the chassis turns.
   */
  private rotateOffset(offset: readonly [number, number, number]): [number, number, number] {
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const [ox, oy, oz] = offset;
    return [ox * cos + oz * sin, oy, -ox * sin + oz * cos];
  }

  private wheelMount(wheel: WheelSpec): [number, number, number] {
    const [dx, dy, dz] = this.rotateOffset(wheel.offset);
    return [this.world.posX[this.chassis]! + dx, this.world.posY[this.chassis]! + dy, this.world.posZ[this.chassis]! + dz];
  }

  get position(): [number, number, number] {
    return [this.world.posX[this.chassis]!, this.world.posY[this.chassis]!, this.world.posZ[this.chassis]!];
  }

  get forward(): [number, number] {
    return [Math.sin(this.heading), Math.cos(this.heading)];
  }

  /** Signed forward speed along the heading (negative = reversing). */
  get speed(): number {
    const [fx, fz] = this.forward;
    return this.world.velX[this.chassis]! * fx + this.world.velZ[this.chassis]! * fz;
  }

  get grounded(): boolean {
    return this.groundedCount > 0;
  }

  wheelState(index: number): WheelState | null {
    return this.wheelStates[index] ?? null;
  }

  get wheelCount(): number {
    return this.wheels.length;
  }

  resetTo(position: readonly [number, number, number], heading: number): void {
    this.world.teleport(this.chassis, position[0], position[1], position[2]);
    this.heading = heading;
  }

  update(dt: number, input: AxisInput): void {
    const w = this.world;
    const c = this.chassis;

    this.updateSuspension(input.steer);

    const speed = this.speed;
    const grounded = this.groundedCount > 0;

    if (grounded) {
      const steerScale = Math.min(1, Math.abs(speed) / this.turnSpeedRef);
      const dir = speed >= 0 ? 1 : -1;
      this.heading += input.steer * this.turnRate * steerScale * dir * dt;
    }

    const [fx, fz] = this.forward;

    if (grounded) {
      let accel = 0;
      if (input.throttle > 0 && speed < this.topSpeed) accel += input.throttle * this.engineAccel;
      if (input.brake > 0) {
        if (speed > 0.2) accel -= input.brake * this.brakeAccel;
        else if (speed > -this.reverseSpeed) accel -= input.brake * this.engineAccel;
      }
      w.velX[c]! += fx * accel * dt;
      w.velZ[c]! += fz * accel * dt;

      const roll = Math.max(0, 1 - this.rollingResistance * dt * (input.throttle > 0 ? 0 : 1));
      const forwardSpeed = w.velX[c]! * fx + w.velZ[c]! * fz;
      const rolled = forwardSpeed * roll;

      const lateralSpeed = -w.velX[c]! * fz + w.velZ[c]! * fx;
      const surface = this.surfaceFriction(w.posX[c]!, w.posZ[c]!);
      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const handbrake = 1 - input.handbrake * (1 - this.handbrakeGrip);
      const grip = sampleGripCurve(this.grip, slip) * surface * handbrake;
      const keep = Math.max(0, 1 - grip * this.gripStrength * dt);
      const newLateral = lateralSpeed * keep;

      w.velX[c] = fx * rolled - fz * newLateral;
      w.velZ[c] = fz * rolled + fx * newLateral;
      w.wake(c);
    }
  }

  private updateSuspension(steer: number): void {
    this.groundedCount = 0;
    const w = this.world;
    for (let i = 0; i < this.wheels.length; i += 1) {
      const wheel = this.wheels[i]!;
      const state = this.wheelStates[i]!;
      const mount = this.wheelMount(wheel);
      const radius = wheel.radius ?? 0.35;
      const rest = wheel.restLength ?? this.suspensionRest;
      const groundY = this.groundHeight(mount[0], mount[2]);
      const gap = mount[1] - (groundY + radius);
      const maxTravel = rest + radius;
      const grounded = gap <= maxTravel;
      const anchorA = this.rotateOffset(wheel.offset);
      w.setJointAnchorA(this.springs[i]!, anchorA[0], anchorA[1], anchorA[2]);
      w.setJointAnchor(this.springs[i]!, mount[0], groundY + radius, mount[2]);
      state.worldX = mount[0];
      state.worldY = groundY + radius;
      state.worldZ = mount[2];
      state.grounded = grounded;
      state.compression = Math.max(0, rest - gap);
      state.steerAngle = wheel.steered === true ? steer : 0;
      if (grounded) this.groundedCount += 1;
    }
  }

  remove(): void {
    for (const id of this.springs) this.world.removeJoint(id);
    this.springs.length = 0;
  }
}

export function createVehicleBody(world: PhysicsWorld, config: VehicleBodyConfig): VehicleBody {
  return new VehicleBody(world, config);
}
