import type { PhysicsWorld } from "./physicsWorld";
import type { WaterSurface } from "../world/water";
import type { AxisInput } from "../input/axisInput";

export interface BuoyantBodyConfig {
  body: number;
  water: WaterSurface;
  heading?: number;
  hullPoints?: readonly (readonly [number, number])[];
  hullDepth?: number;
  buoyancy?: number;
  verticalDrag?: number;
  linearDrag?: number;
  engineAccel?: number;
  reverseAccel?: number;
  topSpeed?: number;
  turnRate?: number;
  turnSpeedRef?: number;
}

const DEFAULT_HULL: readonly (readonly [number, number])[] = [
  [-0.8, 1.6],
  [0.8, 1.6],
  [-0.8, -1.6],
  [0.8, -1.6],
];

/**
 * Floats a {@link PhysicsWorld} body on a CPU {@link WaterSurface}: each hull sample point pushes the
 * body up by its submerged depth (Archimedes, coarse), with vertical and horizontal water drag so the
 * hull settles at the waterline and rides the Gerstner waves. Passing an {@link AxisInput} drives it as
 * a boat — throttle thrusts along the heading, steer yaws, a keel bleeds sideways slip. Call
 * `update(dt, time, input?)` before the shared `world.step(dt)`.
 */
export class BuoyantBody {
  heading: number;
  private readonly world: PhysicsWorld;
  private readonly water: WaterSurface;
  private readonly body: number;
  private readonly hull: readonly (readonly [number, number])[];
  private readonly hullDepth: number;
  private readonly buoyancy: number;
  private readonly verticalDrag: number;
  private readonly linearDrag: number;
  private readonly engineAccel: number;
  private readonly reverseAccel: number;
  private readonly topSpeed: number;
  private readonly turnRate: number;
  private readonly turnSpeedRef: number;
  private submergedFlag = false;

  constructor(world: PhysicsWorld, config: BuoyantBodyConfig) {
    this.world = world;
    this.heading = config.heading ?? 0;
    this.water = config.water;
    this.body = config.body;
    this.hull = config.hullPoints ?? DEFAULT_HULL;
    this.hullDepth = config.hullDepth ?? 0.5;
    this.buoyancy = config.buoyancy ?? 26;
    this.verticalDrag = config.verticalDrag ?? 3;
    this.linearDrag = config.linearDrag ?? 1.2;
    this.engineAccel = config.engineAccel ?? 10;
    this.reverseAccel = config.reverseAccel ?? 5;
    this.topSpeed = config.topSpeed ?? 14;
    this.turnRate = config.turnRate ?? 1.2;
    this.turnSpeedRef = config.turnSpeedRef ?? 4;
  }

  get position(): [number, number, number] {
    return [this.world.posX[this.body]!, this.world.posY[this.body]!, this.world.posZ[this.body]!];
  }

  get forward(): [number, number] {
    return [Math.sin(this.heading), Math.cos(this.heading)];
  }

  get speed(): number {
    const [fx, fz] = this.forward;
    return this.world.velX[this.body]! * fx + this.world.velZ[this.body]! * fz;
  }

  get submerged(): boolean {
    return this.submergedFlag;
  }

  update(dt: number, time: number, input?: AxisInput): void {
    const w = this.world;
    const b = this.body;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);

    let submergedSum = 0;
    let submergedCount = 0;
    for (const [lx, lz] of this.hull) {
      const px = w.posX[b]! + lx * cos + lz * sin;
      const pz = w.posZ[b]! - lx * sin + lz * cos;
      const surface = this.water.height(px, pz, time);
      const bottom = w.posY[b]! - this.hullDepth;
      const depth = surface - bottom;
      if (depth > 0) {
        submergedSum += depth;
        submergedCount += 1;
      }
    }

    if (submergedCount > 0) {
      const avgDepth = submergedSum / this.hull.length;
      w.velY[b]! += avgDepth * this.buoyancy * dt;
      w.velY[b]! -= w.velY[b]! * Math.min(1, this.verticalDrag * dt);
      const drag = Math.max(0, 1 - this.linearDrag * dt);
      w.velX[b]! *= drag;
      w.velZ[b]! *= drag;
      this.submergedFlag = true;
      w.wake(b);
    } else {
      this.submergedFlag = false;
    }

    if (input !== undefined && this.submergedFlag) {
      const speed = this.speed;
      const steerScale = Math.min(1, Math.abs(speed) / this.turnSpeedRef);
      this.heading += input.steer * this.turnRate * steerScale * dt;
      const [fx, fz] = this.forward;
      let accel = 0;
      if (input.throttle > 0 && speed < this.topSpeed) accel += input.throttle * this.engineAccel;
      if (input.brake > 0 && speed > -this.topSpeed) accel -= input.brake * this.reverseAccel;
      w.velX[b]! += fx * accel * dt;
      w.velZ[b]! += fz * accel * dt;

      const lateral = -w.velX[b]! * fz + w.velZ[b]! * fx;
      const forwardSpeed = w.velX[b]! * fx + w.velZ[b]! * fz;
      const keptLateral = lateral * Math.max(0, 1 - 2 * dt);
      w.velX[b] = fx * forwardSpeed - fz * keptLateral;
      w.velZ[b] = fz * forwardSpeed + fx * keptLateral;
    }
  }
}

export function createBuoyantBody(world: PhysicsWorld, config: BuoyantBodyConfig): BuoyantBody {
  return new BuoyantBody(world, config);
}
