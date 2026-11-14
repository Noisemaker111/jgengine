import type { GameContext } from "../runtime/gameContext";
import type { WorldSolid } from "../world/worldSolids";

/**
 * A deck on top of a moving body (a walking whale, a barge, a lift): its half-size in the carrier's own
 * frame (+X right, +Z forward), and the height of its top above the carrier's origin.
 */
export interface CarrierDeck {
  halfX: number;
  halfZ: number;
  /** Deck top above the carrier's position, metres. */
  height: number;
  /** Slab thickness under the top, metres. Default 0.4. */
  thickness?: number;
  /** How far above the deck top a body still counts as standing on it, metres. Default 0.6. */
  standTolerance?: number;
  /** Where on the deck its centre sits, forward of the carrier's origin, metres. Default 0. */
  offsetZ?: number;
}

/** Something fixed to a carrier: kept at a local offset and turn as the carrier moves. */
export interface CarrierAttachment {
  carrierId: string;
  local: readonly [number, number, number];
  yaw: number;
}

/** Serializable carrier state: decks, attachments and each carrier's last pose. */
export interface CarrierState {
  decks: Record<string, CarrierDeck>;
  attached: Record<string, CarrierAttachment>;
  poses: Record<string, { position: [number, number, number]; yaw: number }>;
}

export interface CarrierFieldConfig {
  /** The world solids layer the decks occupy, so walkers stand on them. Default `"carriers"`. */
  solidsLayer?: string;
  /** Who may ride a carrier: candidate entity ids near it. Default every entity within the deck's reach. */
  candidates?: (ctx: GameContext, carrierId: string, reach: number) => Iterable<string>;
}

export interface CarrierField {
  /** Make `carrierId` a carrier with this deck. */
  add(carrierId: string, deck: CarrierDeck): void;
  remove(carrierId: string): void;
  has(carrierId: string): boolean;
  /** Fix `entityId` to a carrier at a local offset (and turn); it moves with it until detached. */
  attach(carrierId: string, entityId: string, local: readonly [number, number, number], yaw?: number): void;
  detach(entityId: string): void;
  /**
   * Move everything standing on each deck, and everything attached, by how its carrier moved since the
   * last step, and refresh the deck solids. Returns the ids carried this step.
   */
  step(ctx: GameContext): string[];
  /** Who stood on `carrierId`'s deck at the last step. */
  passengersOf(carrierId: string): readonly string[];
  /** Whether `entityId` is standing on (or attached to) `carrierId` right now. */
  carries(ctx: GameContext, carrierId: string, entityId: string): boolean;
  snapshot(): CarrierState;
  restore(state: CarrierState): void;
}

type V3 = [number, number, number];

/** A world point in a pose's local frame (+X right, +Z forward). */
function toLocal(pose: { position: readonly number[]; yaw: number }, point: readonly number[]): V3 {
  const dx = point[0]! - pose.position[0]!;
  const dz = point[2]! - pose.position[2]!;
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  return [dx * cos - dz * sin, point[1]! - pose.position[1]!, dx * sin + dz * cos];
}

/** A local point back into the world from a pose. */
function toWorld(pose: { position: readonly number[]; yaw: number }, local: readonly number[]): V3 {
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  return [pose.position[0]! + local[0]! * cos + local[2]! * sin, pose.position[1]! + local[1]!, pose.position[2]! - local[0]! * sin + local[2]! * cos];
}

/**
 * Bodies that carry others: a deck on a moving entity that what stands on it rides along with (position
 * and turn), things fixed to it that keep their place, and a moving solid so walkers stand on the deck
 * rather than fall through. Run `step` after movement each tick.
 *
 * @capability moving-carrier a moving body with a deck that carries standing actors and attached props, and a solid to stand on
 */
export function createCarrierField(config: CarrierFieldConfig = {}): CarrierField {
  const layer = config.solidsLayer ?? "carriers";
  let decks = new Map<string, CarrierDeck>();
  let attached = new Map<string, CarrierAttachment>();
  let poses = new Map<string, { position: V3; yaw: number }>();
  const passengers = new Map<string, string[]>();

  const deckPose = (deck: CarrierDeck, pose: { position: readonly number[]; yaw: number }) => ({ position: toWorld(pose, [0, 0, deck.offsetZ ?? 0]), yaw: pose.yaw });
  const onDeck = (deck: CarrierDeck, pose: { position: readonly number[]; yaw: number }, point: readonly number[]): boolean => {
    const local = toLocal(deckPose(deck, pose), point);
    const above = local[1] - deck.height;
    return Math.abs(local[0]) <= deck.halfX && Math.abs(local[2]) <= deck.halfZ && above >= -0.25 && above <= (deck.standTolerance ?? 0.6);
  };
  const candidatesOf = (ctx: GameContext, carrierId: string, deck: CarrierDeck): Iterable<string> => {
    const reach = Math.hypot(deck.halfX, deck.halfZ) + Math.abs(deck.offsetZ ?? 0) + 1;
    return config.candidates?.(ctx, carrierId, reach) ?? ctx.scene.entity.inRadius(carrierId, reach);
  };

  return {
    add(carrierId, deck) {
      decks.set(carrierId, deck);
    },
    remove(carrierId) {
      decks.delete(carrierId);
      poses.delete(carrierId);
      passengers.delete(carrierId);
      for (const [id, entry] of attached) if (entry.carrierId === carrierId) attached.delete(id);
    },
    has: (carrierId) => decks.has(carrierId),
    attach(carrierId, entityId, local, yaw = 0) {
      attached.set(entityId, { carrierId, local: [local[0], local[1], local[2]], yaw });
    },
    detach(entityId) {
      attached.delete(entityId);
    },
    step(ctx) {
      const carried: string[] = [];
      const solids: WorldSolid[] = [];
      for (const [carrierId, deck] of decks) {
        const entity = ctx.scene.entity.get(carrierId);
        if (entity === null) continue;
        const now = { position: [entity.position[0], entity.position[1], entity.position[2]] as V3, yaw: entity.rotationY };
        const before = poses.get(carrierId) ?? now;
        const riding: string[] = [];
        for (const id of candidatesOf(ctx, carrierId, deck)) {
          if (id === carrierId || attached.has(id)) continue;
          const body = ctx.scene.entity.get(id);
          if (body === null || !onDeck(deck, before, body.position)) continue;
          // Ride the deck rigidly: same place in the carrier's frame, turned by as much as it turned.
          const local = toLocal(before, body.position);
          const moved = toWorld(now, local);
          ctx.scene.entity.setPose(id, { position: moved, rotationY: body.rotationY + (now.yaw - before.yaw) });
          riding.push(id);
          carried.push(id);
        }
        passengers.set(carrierId, riding);
        poses.set(carrierId, now);
        const thickness = deck.thickness ?? 0.4;
        const centre = toWorld(deckPose(deck, now), [0, deck.height - thickness / 2, 0]);
        solids.push({ center: centre, halfExtents: [deck.halfX, thickness / 2, deck.halfZ], rotationY: now.yaw });
      }
      for (const [id, entry] of attached) {
        const carrier = ctx.scene.entity.get(entry.carrierId);
        if (carrier === null || ctx.scene.entity.get(id) === null) continue;
        const pose = { position: carrier.position, yaw: carrier.rotationY };
        ctx.scene.entity.setPose(id, { position: toWorld(pose, entry.local), rotationY: carrier.rotationY + entry.yaw });
        carried.push(id);
      }
      ctx.world.solids.set(layer, solids);
      return carried;
    },
    passengersOf: (carrierId) => passengers.get(carrierId) ?? [],
    carries(ctx, carrierId, entityId) {
      if (attached.get(entityId)?.carrierId === carrierId) return true;
      const deck = decks.get(carrierId);
      const carrier = ctx.scene.entity.get(carrierId);
      const body = ctx.scene.entity.get(entityId);
      return deck !== undefined && carrier !== null && body !== null && onDeck(deck, { position: carrier.position, yaw: carrier.rotationY }, body.position);
    },
    snapshot: () => ({
      decks: Object.fromEntries(decks),
      attached: Object.fromEntries([...attached].map(([id, entry]) => [id, { ...entry, local: [...entry.local] as V3 }])),
      poses: Object.fromEntries([...poses].map(([id, pose]) => [id, { position: [...pose.position] as V3, yaw: pose.yaw }])),
    }),
    restore(state) {
      decks = new Map(Object.entries(state.decks));
      attached = new Map(Object.entries(state.attached));
      poses = new Map(Object.entries(state.poses).map(([id, pose]) => [id, { position: [...pose.position] as V3, yaw: pose.yaw }]));
      passengers.clear();
    },
  };
}
