import { createMountController, MountController, type MountedRider, type MountSeat, type RideableConfig } from "./mount";
import type { GameContext } from "../runtime/gameContext";
import type { CameraRigKind } from "../game/cameraConfig";
import { validateCameraRig, validateChaseCameraTuning, type CameraRigConfig, type ChaseCameraTuning } from "../runtime/cameraDirector";
import { forgetPlayerMovement } from "../movement/playerMovement";

/** World-space `[x, y, z]` for a vehicle's current position. */
export type VehiclePosition = readonly [number, number, number];

/** A vehicle's world-space position and heading, used for {@link VehicleSeats.exit}'s dismount placement math. */
export interface VehiclePose {
  position: VehiclePosition;
  rotationY: number;
}

/** Options for {@link VehicleSeats.enter}. */
export interface EnterVehicleOptions {
  /** Specific seat to board; omit to take the first free control seat, else the first free seat. */
  seatId?: string;
}

/** Movement-lock patch for `entities.update(riderId, { movement: { ...current, ...patch } })` (#286.gameplay `movement.frozen`). */
export interface RiderMovementPatch {
  frozen: boolean;
}

/** Result of {@link VehicleSeats.enter} — the resolved seat plus the camera/drive/movement patches to apply. */
export type EnterVehicleResult =
  | {
      ok: true;
      seat: MountSeat;
      /** Feed straight into `ctx.camera.follow(...)` — the vehicle while a control seat is taken, else the rider's own id. */
      cameraTarget: string;
      /** Entity this rider's axis input should now drive (`scene/mount`'s `driveTarget`); `null` for a passenger seat. */
      driveTarget: string | null;
      riderMovementPatch: RiderMovementPatch;
    }
  | { ok: false; reason: string };

/** Result of {@link VehicleSeats.exit} — the side-door placement plus the camera/movement patches to apply. */
export type ExitVehicleResult =
  | {
      ok: true;
      vehicleId: string;
      /** Where to `setPose` the rider — alongside the vehicle's side door, facing its heading. */
      placement: VehiclePose;
      cameraTarget: string;
      riderMovementPatch: RiderMovementPatch;
    }
  | { ok: false; reason: "not_seated" | "invalid_pose" };

/** Where {@link VehicleSeats.exit} steps the rider out, relative to the vehicle's heading. */
export interface DismountOffset {
  /** Lateral distance from the vehicle's centerline; default 2.2. */
  distance?: number;
  /** Which side of the vehicle to step out on, relative to its heading; default `"right"`. */
  side?: "left" | "right";
}

/**
 * Composes `scene/mount`'s control-transfer bookkeeping with the seat/camera/movement-mode transition
 * every enter/exit-vehicle flow needs (#533.2): boarding resolves a free seat and reports the camera
 * target, drive target, and rider movement-lock patch in one call; leaving computes a side-door
 * placement next to the vehicle and reports the same triad in reverse. Pure — no entity/camera side
 * effects — the caller applies `riderMovementPatch`/`placement`/`cameraTarget` via its own `ctx`.
 */
export class VehicleSeats {
  private readonly controller: MountController;

  constructor(controller?: MountController) {
    this.controller = controller ?? createMountController();
  }

  register(config: RideableConfig): void {
    this.controller.register(config);
  }

  enter(riderId: string, vehicleId: string, options: EnterVehicleOptions = {}): EnterVehicleResult {
    const result = this.controller.mount(riderId, vehicleId, options.seatId);
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      seat: result.seat,
      cameraTarget: this.controller.cameraTarget(riderId),
      driveTarget: this.controller.driveTarget(riderId),
      riderMovementPatch: { frozen: true },
    };
  }

  exit(riderId: string, vehiclePose: VehiclePose, offset: DismountOffset = {}): ExitVehicleResult {
    const vehicleId = this.controller.seatOf(riderId)?.mountId;
    if (vehicleId === undefined) return { ok: false, reason: "not_seated" };
    const distance = offset.distance ?? 2.2;
    if (!Array.isArray(vehiclePose.position) || vehiclePose.position.length !== 3 || !vehiclePose.position.every(Number.isFinite) ||
        !Number.isFinite(vehiclePose.rotationY) || !Number.isFinite(distance) ||
        (offset.side !== undefined && offset.side !== "left" && offset.side !== "right")) return { ok: false, reason: "invalid_pose" };
    const sign = offset.side === "left" ? -1 : 1;
    const side = vehiclePose.rotationY + (Math.PI / 2) * sign;
    const x = vehiclePose.position[0] + Math.sin(side) * distance;
    const z = vehiclePose.position[2] + Math.cos(side) * distance;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, reason: "invalid_pose" };
    this.controller.dismount(riderId);
    return {
      ok: true,
      vehicleId,
      placement: { position: [x, vehiclePose.position[1], z], rotationY: vehiclePose.rotationY },
      cameraTarget: riderId,
      riderMovementPatch: { frozen: false },
    };
  }

  isSeated(riderId: string): boolean {
    return this.controller.isSeated(riderId);
  }

  driverOf(vehicleId: string): string | null {
    return this.controller.driver(vehicleId);
  }

  /** The seated rider's controlled mount; `null` for passengers and unseated riders. */
  drivenBy(riderId: string): string | null {
    return this.isSeated(riderId) ? this.controller.driveTarget(riderId) : null;
  }

  snapshot(): MountedRider[] {
    return this.controller.snapshot();
  }

  restore(next: readonly MountedRider[]): void {
    this.controller.restore(next);
  }

  reset(): void {
    this.controller.reset();
  }

  get mounts(): MountController {
    return this.controller;
  }
}

/**
 * Builds a {@link VehicleSeats}, optionally over an existing `MountController` to share its occupancy.
 *
 * @capability vehicle-seats enter, exit and swap seats in a car or mount (GTA-style boarding) with driver and passenger slots
 */
export function createVehicleSeats(controller?: MountController): VehicleSeats {
  return new VehicleSeats(controller);
}

/** Seat selection and optional local camera policy for an explicit rider transition. */
export interface BoardVehicleOptions extends EnterVehicleOptions {
  /** Presentation policy; `false` applies only rider/occupancy patches for authoritative remote riders. */
  camera?: boolean;
  /** Omit to keep the current rig. `null` restores the configured rig. */
  rig?: CameraRigKind | null;
  config?: CameraRigConfig;
  chase?: ChaseCameraTuning | null;
}

/** Exit placement and optional local camera restoration for an explicit rider. */
export interface LeaveVehicleOptions extends DismountOffset {
  camera?: boolean;
  /** Supply a last known vehicle pose when its entity has already been removed. */
  pose?: VehiclePose;
}

function forgetRiderMovement(ctx: GameContext, riderId: string): void {
  const possession = ctx.player.possession;
  if (possession.active(riderId) === riderId) forgetPlayerMovement(ctx, riderId);
  for (const [userId, entityId] of Object.entries(possession.snapshotAll().active)) {
    if (entityId === riderId) forgetPlayerMovement(ctx, userId);
  }
}

/** Apply an existing seat transition to the explicitly named rider. Motor/input policy stays caller-owned.
 * @capability board-vehicle board a rideable, freeze/hide its rider and apply caller camera policy
 */
export function boardVehicle(ctx: GameContext, seats: VehicleSeats, riderId: string, vehicleId: string, options: BoardVehicleOptions = {}): EnterVehicleResult {
  const rider = ctx.scene.entity.get(riderId);
  if (rider === null) return { ok: false, reason: "unknown_rider" };
  if (ctx.scene.entity.get(vehicleId) === null) return { ok: false, reason: "unknown_vehicle" };
  if (options.camera !== false && options.rig !== undefined && options.rig !== null) validateCameraRig(options.rig, options.config);
  if (options.camera !== false && options.chase !== undefined) validateChaseCameraTuning(options.chase);
  const result = seats.enter(riderId, vehicleId, options);
  if (!result.ok) return result;
  ctx.scene.entity.update(riderId, { hidden: true, movement: { ...rider.movement, ...result.riderMovementPatch } });
  ctx.scene.entity.setVelocity(riderId, [0, 0, 0]);
  forgetRiderMovement(ctx, riderId);
  if (options.camera !== false) {
    ctx.camera.follow(result.cameraTarget);
    if (options.rig !== undefined) ctx.camera.setRig(options.rig, options.config);
    if (options.chase !== undefined) ctx.camera.setChaseTuning(structuredClone(options.chase));
  }
  return result;
}

/** Apply dismount placement, restore rider movement/visibility and the configured camera rig.
 * @capability leave-vehicle leave a rideable beside its current pose and restore on-foot camera/movement
 */
export function leaveVehicle(ctx: GameContext, seats: VehicleSeats, riderId: string, options: LeaveVehicleOptions = {}): ExitVehicleResult | { ok: false; reason: "unknown_rider" | "unknown_vehicle" } {
  const rider = ctx.scene.entity.get(riderId);
  if (rider === null) return { ok: false, reason: "unknown_rider" };
  const ref = seats.mounts.seatOf(riderId);
  if (ref === null) return { ok: false, reason: "not_seated" };
  const vehicle = ctx.scene.entity.get(ref.mountId);
  const pose = options.pose ?? (vehicle === null ? undefined : { position: vehicle.position, rotationY: vehicle.rotationY });
  if (pose === undefined) return { ok: false, reason: "unknown_vehicle" };
  const result = seats.exit(riderId, pose, options);
  if (!result.ok) return result;
  ctx.scene.entity.setPose(riderId, result.placement);
  ctx.scene.entity.update(riderId, { hidden: false, movement: { ...rider.movement, ...result.riderMovementPatch } });
  ctx.scene.entity.setVelocity(riderId, [0, 0, 0]);
  forgetRiderMovement(ctx, riderId);
  if (options.camera !== false) {
    ctx.camera.follow(result.cameraTarget);
    ctx.camera.setRig(null);
    ctx.camera.setChaseTuning(null);
  }
  return result;
}
