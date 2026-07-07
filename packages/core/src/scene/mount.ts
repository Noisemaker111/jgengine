export type MountKind = "ground" | "boat" | "flying" | "swimming";

export interface MountKit {
  kind: MountKind;
  moveSpeed?: number;
  turnSpeed?: number;
}

export interface MountSeat {
  id: string;
  offset: readonly [number, number, number];
  control?: boolean;
}

export interface RideableConfig {
  id: string;
  kit: MountKit;
  seats?: readonly MountSeat[];
}

export interface SeatRef {
  mountId: string;
  seatId: string;
}

export interface Occupant {
  riderId: string;
  seatId: string;
}

export type MountResult = { ok: true; seat: MountSeat } | { ok: false; reason: string };

const DEFAULT_SEAT: MountSeat = { id: "driver", offset: [0, 0, 0], control: true };

interface Registered {
  config: RideableConfig;
  seats: readonly MountSeat[];
  bySeat: Map<string, string>;
}

/**
 * Mount / rideable control-transfer (issue #83). Registers rideables (each with one or more seats — a
 * control seat drives, the rest ride) and tracks who is on what. It owns no camera or physics: game code
 * reads `cameraTarget(riderId)` to point the follow camera at the mount, and `driveTarget(riderId)` to
 * route that rider's {@link import("../physics/vehicleBody").AxisInput}-driven input at the mount's
 * movement kit — the same seam a horse, a truck, or a shared multi-seat ship all plug into.
 */
export class MountController {
  private readonly mounts = new Map<string, Registered>();
  private readonly seatOfRider = new Map<string, SeatRef>();

  register(config: RideableConfig): void {
    const seats = config.seats !== undefined && config.seats.length > 0 ? config.seats : [DEFAULT_SEAT];
    this.mounts.set(config.id, { config, seats, bySeat: new Map() });
  }

  isRegistered(mountId: string): boolean {
    return this.mounts.has(mountId);
  }

  kitOf(mountId: string): MountKit | null {
    return this.mounts.get(mountId)?.config.kit ?? null;
  }

  seatsOf(mountId: string): readonly MountSeat[] {
    return this.mounts.get(mountId)?.seats ?? [];
  }

  private firstFreeSeat(reg: Registered): MountSeat | null {
    const control = reg.seats.find((s) => s.control === true && !reg.bySeat.has(s.id));
    if (control !== undefined) return control;
    return reg.seats.find((s) => !reg.bySeat.has(s.id)) ?? null;
  }

  mount(riderId: string, mountId: string, seatId?: string): MountResult {
    const reg = this.mounts.get(mountId);
    if (reg === undefined) return { ok: false, reason: "unknown_mount" };
    const seat = seatId !== undefined ? reg.seats.find((s) => s.id === seatId) : this.firstFreeSeat(reg);
    if (seat === undefined) return { ok: false, reason: "unknown_seat" };
    if (seat === null) return { ok: false, reason: "mount_full" };
    if (reg.bySeat.has(seat.id)) return { ok: false, reason: "seat_taken" };
    this.dismount(riderId);
    reg.bySeat.set(seat.id, riderId);
    this.seatOfRider.set(riderId, { mountId, seatId: seat.id });
    return { ok: true, seat };
  }

  dismount(riderId: string): string | null {
    const ref = this.seatOfRider.get(riderId);
    if (ref === undefined) return null;
    this.mounts.get(ref.mountId)?.bySeat.delete(ref.seatId);
    this.seatOfRider.delete(riderId);
    return ref.mountId;
  }

  seatOf(riderId: string): SeatRef | null {
    return this.seatOfRider.get(riderId) ?? null;
  }

  isSeated(riderId: string): boolean {
    return this.seatOfRider.has(riderId);
  }

  seatOffset(riderId: string): readonly [number, number, number] | null {
    const ref = this.seatOfRider.get(riderId);
    if (ref === undefined) return null;
    return this.mounts.get(ref.mountId)?.seats.find((s) => s.id === ref.seatId)?.offset ?? null;
  }

  occupants(mountId: string): readonly Occupant[] {
    const reg = this.mounts.get(mountId);
    if (reg === undefined) return [];
    return reg.seats
      .filter((s) => reg.bySeat.has(s.id))
      .map((s) => ({ riderId: reg.bySeat.get(s.id)!, seatId: s.id }));
  }

  driver(mountId: string): string | null {
    const reg = this.mounts.get(mountId);
    if (reg === undefined) return null;
    for (const seat of reg.seats) {
      if (seat.control === true) {
        const rider = reg.bySeat.get(seat.id);
        if (rider !== undefined) return rider;
      }
    }
    return null;
  }

  /** Entity the follow camera should track for this rider: the mount when seated, else the rider. */
  cameraTarget(riderId: string): string {
    const ref = this.seatOfRider.get(riderId);
    return ref === undefined ? riderId : ref.mountId;
  }

  /**
   * Entity this rider's input drives: the mount when in a control seat, `null` for a passenger seat
   * (they ride but do not steer), and the rider themselves when not mounted at all.
   */
  driveTarget(riderId: string): string | null {
    const ref = this.seatOfRider.get(riderId);
    if (ref === undefined) return riderId;
    const seat = this.mounts.get(ref.mountId)?.seats.find((s) => s.id === ref.seatId);
    return seat?.control === true ? ref.mountId : null;
  }
}

export function createMountController(): MountController {
  return new MountController();
}
