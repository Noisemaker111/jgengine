import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";

import { MountController, type MountedRider } from "./mount";

/** Where the rider sits on a mount, in the mount's frame: right, up, forward (metres). */
export type SeatOffset = readonly [number, number, number];

export type RideResult = { ok: true } | { ok: false; reason: string };

/**
 * Riding a creature or vehicle: the player's controls and camera move to the mount (through
 * possession), the rider is frozen and carried on the seat every simulation step, and getting off
 * hands control back and sets the rider down beside it. Seat bookkeeping is `scene/mount`'s.
 *
 * @capability riding ride a tamed creature or vehicle: controls and camera follow the mount, the rider sits on its seat, dismount sets them down beside it
 */
export interface Riding {
  /** Put `userId`'s own entity on `mountId` at `seat`, and steer the mount. */
  ride(userId: string, mountId: string, seat: SeatOffset): RideResult;
  /** Get off; returns the mount ridden, or null when not riding. */
  dismount(userId: string): string | null;
  /** The mount `userId` is riding, or null. */
  mountOf(userId: string): string | null;
  /** Who rides `mountId`, or null. */
  riderOf(mountId: string): string | null;
  snapshot(): { riders: MountedRider[]; seats: Record<string, SeatOffset> };
  restore(data: { riders: readonly MountedRider[]; seats: Record<string, SeatOffset> }): void;
  reset(): void;
}

function carry(ctx: GameContext, mounts: MountController, seats: Map<string, SeatOffset>): void {
  for (const { riderId, mountId } of mounts.snapshot()) {
    const mount = ctx.scene.entity.get(mountId);
    const seat = seats.get(mountId);
    if (mount === null || seat === undefined || ctx.scene.entity.get(riderId) === null) continue;
    const yaw = mount.rotationY;
    const [right, up, forward] = seat;
    // rotationY 0 faces +Z, so the mount's right is -X.
    const x = mount.position[0] + Math.sin(yaw) * forward - Math.cos(yaw) * right;
    const z = mount.position[2] + Math.cos(yaw) * forward + Math.sin(yaw) * right;
    ctx.scene.entity.setPose(riderId, { position: [x, mount.position[1] + up, z], rotationY: yaw });
  }
}

/** The context's one riding service; it carries riders after movement on every simulation step. */
export const ridingOf: (ctx: GameContext) => Riding = perContext((ctx: GameContext): Riding => {
  const mounts = new MountController();
  const seats = new Map<string, SeatOffset>();
  ctx.sim.addStage({ id: "riding", phase: "afterMovement", run: () => carry(ctx, mounts, seats) });

  const freeze = (id: string, frozen: boolean): void => {
    const entity = ctx.scene.entity.get(id);
    if (entity !== null) ctx.scene.entity.update(id, { movement: { ...entity.movement, frozen } });
  };

  return {
    ride(userId, mountId, seat) {
      if (mounts.isSeated(userId)) return { ok: false, reason: "already riding" };
      if (ctx.scene.entity.get(mountId) === null) return { ok: false, reason: "nothing to ride" };
      if (!mounts.isRegistered(mountId)) mounts.register({ id: mountId, kit: { kind: "ground" } });
      const seated = mounts.mount(userId, mountId);
      if (!seated.ok) return seated;
      seats.set(mountId, seat);
      ctx.player.possession.own(userId, mountId);
      const refused = ctx.player.possession.possess(userId, mountId);
      if (refused !== null) {
        mounts.dismount(userId);
        return { ok: false, reason: refused.reason };
      }
      freeze(userId, true);
      ctx.scene.entity.setVelocity(userId, [0, 0, 0]);
      carry(ctx, mounts, seats);
      return { ok: true };
    },
    dismount(userId) {
      const mountId = mounts.dismount(userId);
      if (mountId === null) return null;
      ctx.player.possession.possess(userId, userId);
      ctx.player.possession.disown(userId, mountId);
      freeze(userId, false);
      const mount = ctx.scene.entity.get(mountId);
      if (mount !== null) {
        // Step off to the mount's left, on the ground.
        const x = mount.position[0] + Math.cos(mount.rotationY) * 2;
        const z = mount.position[2] - Math.sin(mount.rotationY) * 2;
        ctx.scene.entity.setPose(userId, { position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: mount.rotationY });
        ctx.scene.entity.setVelocity(mountId, [0, 0, 0]);
      }
      return mountId;
    },
    mountOf: (userId) => mounts.seatOf(userId)?.mountId ?? null,
    riderOf: (mountId) => mounts.occupants(mountId)[0]?.riderId ?? null,
    snapshot: () => ({ riders: mounts.snapshot(), seats: Object.fromEntries(seats) }),
    restore(data) {
      for (const [mountId, seat] of Object.entries(data.seats)) {
        seats.set(mountId, seat);
        if (!mounts.isRegistered(mountId)) mounts.register({ id: mountId, kit: { kind: "ground" } });
      }
      mounts.restore(data.riders);
    },
    reset() {
      for (const { riderId } of mounts.snapshot()) {
        ctx.player.possession.possess(riderId, riderId);
        freeze(riderId, false);
      }
      mounts.reset();
      seats.clear();
    },
  };
});
