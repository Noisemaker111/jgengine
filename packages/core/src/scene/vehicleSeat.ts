import { createMountController, MountController, type MountSeat, type RideableConfig } from "./mount";

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
  | { ok: false; reason: "not_seated" };

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
    const vehicleId = this.controller.dismount(riderId);
    if (vehicleId === null) return { ok: false, reason: "not_seated" };
    const distance = offset.distance ?? 2.2;
    const sign = offset.side === "left" ? -1 : 1;
    const side = vehiclePose.rotationY + (Math.PI / 2) * sign;
    const x = vehiclePose.position[0] + Math.sin(side) * distance;
    const z = vehiclePose.position[2] + Math.cos(side) * distance;
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

  get mounts(): MountController {
    return this.controller;
  }
}

/** Builds a {@link VehicleSeats}, optionally over an existing `MountController` to share its occupancy. */
export function createVehicleSeats(controller?: MountController): VehicleSeats {
  return new VehicleSeats(controller);
}
