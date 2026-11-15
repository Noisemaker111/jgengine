// @skill jgengine-gameplay
import type { ThresholdBoundary } from "@jgengine/core/threshold/thresholds";
import { createBuildSocketCatalog, type ConnectionRule, type SocketDef } from "@jgengine/core/placement/buildSockets";
import type { WorldSolid } from "@jgengine/core/world/worldSolids";

/** A `[x, y, z]` triple in metres. */
export type BaseVec3 = readonly [number, number, number];

/** One solid box of a piece, in the piece's local space (origin at the piece's snap origin). */
export interface StructureBox {
  min: BaseVec3;
  max: BaseVec3;
}

/** Where a shape may stand without snapping to another piece. */
export interface StructureGroundRule {
  /** Metres the origin sits above the highest ground under the piece. Default `0`. */
  lift?: number;
  /** Largest ground height difference under the piece's corners before it is too steep. Default `1`. */
  maxStep?: number;
}

/**
 * A piece shape: its solid boxes (the same boxes collide, raycast and draw), its snap sockets and where
 * it may stand. Socket positions are local; socket `yaw` follows `placement/buildSockets` (the angle
 * `atan2(z, x)` of the socket's outward direction).
 */
export interface StructureShapeDef {
  id: string;
  boxes: readonly StructureBox[];
  sockets?: readonly SocketDef[];
  /** Boxes while toggled open (a door swung on its hinge); omit for shapes with no open state. */
  openBoxes?: readonly StructureBox[];
  /** Placeable on bare terrain. */
  ground?: StructureGroundRule;
  /** Placeable freely on top of another piece (a campfire on a floor). */
  floor?: boolean;
}

/** A material tier, a Ladder step (`at` is its place in the material order): how much of each damage class reaches its pieces. */
export interface StructureTierDef extends ThresholdBoundary {
  /** Damage class → multiplier; `"*"` is the fallback, default `1`. `0` makes the tier immune to that class. */
  damage?: Readonly<Record<string, number>>;
}

/** One buildable piece: a shape in a tier with its hit points. */
export interface StructurePieceDef {
  id: string;
  shape: string;
  tier: string;
  health: number;
}

/** Everything a base-building model is made from. */
export interface BaseBuildingConfig {
  shapes: readonly StructureShapeDef[];
  tiers: readonly StructureTierDef[];
  pieces: readonly StructurePieceDef[];
  /** Which socket kinds mate, as in `placement/buildSockets`. */
  rules: readonly ConnectionRule[];
  /** Farthest a mate point may sit from the build cursor and still snap. Default `2`. */
  snapDistance?: number;
  /** Share of the smaller piece's volume two pieces may overlap before placement is refused. Default `0.4`. */
  overlapTolerance?: number;
}

/** A piece standing in the world. `rotationY` uses the engine's entity convention. */
export interface BasePiece {
  id: string;
  pieceId: string;
  position: BaseVec3;
  rotationY: number;
  health: number;
  open: boolean;
  /** Stood on terrain: a root of the support graph. */
  grounded: boolean;
  /** The piece it was set down on when placed freely on a floor. */
  restsOn: string | null;
  owner: string | null;
  /**
   * The moving frame it was built on (a carrier's id), or none for the world. Stored in that frame, so
   * {@link BaseBuilding.snapshot} keeps it local; {@link BaseBuilding.list} and `get` hand it back posed in the world.
   */
  parent?: string | null;
}

/** Where a moving frame stands: its origin and its turn (the entity convention). */
export interface StructureFramePose {
  position: BaseVec3;
  yaw: number;
}

/** The flat deck on a moving frame that pieces stand on as ground: half-size in the frame (+X right, +Z forward) and its top. */
export interface StructureFrameDeck {
  halfX: number;
  halfZ: number;
  /** Deck top above the frame's origin, metres. */
  height: number;
  /** Deck centre forward of the frame's origin, metres. Default 0. */
  offsetZ?: number;
}

/** Why a plan cannot be placed: an unknown piece, something in the way, nothing to stand on, or ground too steep. */
export type StructurePlanBlock = "unknown-piece" | "overlap" | "no-support" | "too-steep";

/** Where a piece would go for a cursor, and whether it may. */
export interface StructurePlan {
  pieceId: string;
  position: BaseVec3;
  rotationY: number;
  valid: boolean;
  reason?: StructurePlanBlock;
  /** How it stands: snapped to another piece, on terrain, or on a floor. */
  mode: "snap" | "ground" | "floor";
  /** The piece it snaps to or rests on. */
  targetId: string | null;
  /** Reaches the terrain, so it holds itself up (a foundation snapped beside another still touches ground). */
  grounded: boolean;
  /** The moving frame it would be built on, when it stands on a deck or snaps to a piece that does. */
  parent?: string | null;
}

/** Options for {@link BaseBuilding.plan}. */
export interface StructurePlanOptions {
  /** Yaw for a piece stood on terrain or a floor (engine convention). Default `0`. */
  rotationY?: number;
  /** Picks among equally near snaps (a door's swing side, a ramp's direction); counts up with each rotate press. Default `0`. */
  variant?: number;
  /** Terrain height; required for ground placement. */
  groundHeightAt?: (x: number, z: number) => number;
}

/** A piece hit by {@link BaseBuilding.raycast}. */
export interface StructureHit {
  id: string;
  distance: number;
  point: BaseVec3;
}

/** What a removal or a destroying blow took down: the piece itself first, then everything that lost support. */
export interface StructureRemoval {
  removed: readonly BasePiece[];
}

/** Result of {@link BaseBuilding.damage}. */
export interface StructureDamage extends StructureRemoval {
  /** Hit points actually taken off after the tier's multiplier. */
  applied: number;
}

/** Serializable contents of a {@link BaseBuilding}. */
export interface BaseBuildingState {
  pieces: readonly BasePiece[];
  nextId: number;
}

/** A world box of a placed or planned piece, ready for a mesh or a solid. */
export interface StructureWorldBox {
  center: BaseVec3;
  halfExtents: BaseVec3;
  rotationY: number;
}

/** Handle returned by {@link createBaseBuilding}. */
export interface BaseBuilding {
  piece(pieceId: string): StructurePieceDef | null;
  shape(pieceId: string): StructureShapeDef | null;
  /** Where `pieceId` would go for a cursor: the nearest free snap, else terrain or floor when the shape allows. */
  plan(pieceId: string, cursor: BaseVec3, options?: StructurePlanOptions): StructurePlan;
  /** Stand a valid plan up; `null` when the plan is invalid or no longer fits. */
  place(plan: StructurePlan, options?: { owner?: string }): BasePiece | null;
  /** Take a piece down, and everything that only stood because of it. */
  remove(id: string): StructureRemoval;
  /** Hit a piece with `amount` of `damageClass`; at zero health it falls, with whatever it held up. */
  damage(id: string, amount: number, damageClass: string): StructureDamage;
  /** Swing an openable piece; returns the new open state, or `null` when it has none. */
  toggle(id: string): boolean | null;
  get(id: string): BasePiece | null;
  list(): readonly BasePiece[];
  /** Nearest piece a ray hits within `maxDistance`. */
  raycast(origin: BaseVec3, direction: BaseVec3, maxDistance: number): StructureHit | null;
  /** World boxes of a placed piece (open or shut) or of a plan. */
  worldBoxes(item: { pieceId: string; position: BaseVec3; rotationY: number; open?: boolean }): StructureWorldBox[];
  /** Every placed box as a world solid, for `ctx.world.solids`. */
  solids(): WorldSolid[];
  /**
   * Pose a moving frame (a walking carrier) pieces can be built on, every tick it moves. Its deck, when
   * given, is ground a piece can stand on; pieces built there keep their place on it as it walks and turns.
   */
  setFrame(id: string, pose: StructureFramePose, deck?: StructureFrameDeck): void;
  /** The frame is gone (the carrier died or was released): everything built on it falls. */
  removeFrame(id: string): StructureRemoval;
  /** Bumps on every change; a cheap cache key. */
  version(): number;
  snapshot(): BaseBuildingState;
  restore(state: BaseBuildingState): void;
  clear(): void;
}

const SOCKET_GRID = 0.1;
const MATCH = 1e-3;

function rotate(local: BaseVec3, rotationY: number): BaseVec3 {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [local[0] * cos + local[2] * sin, local[1], -local[0] * sin + local[2] * cos];
}

function unrotate(world: BaseVec3, rotationY: number): BaseVec3 {
  return rotate(world, -rotationY);
}

interface Aabb {
  min: BaseVec3;
  max: BaseVec3;
}

function worldAabb(box: StructureBox, position: BaseVec3, rotationY: number): Aabb {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const x of [box.min[0], box.max[0]]) {
    for (const z of [box.min[2], box.max[2]]) {
      const turned = rotate([x, 0, z], rotationY);
      xs.push(turned[0]);
      zs.push(turned[2]);
    }
  }
  return {
    min: [position[0] + Math.min(...xs), position[1] + box.min[1], position[2] + Math.min(...zs)],
    max: [position[0] + Math.max(...xs), position[1] + box.max[1], position[2] + Math.max(...zs)],
  };
}

function volume(box: Aabb | StructureBox): number {
  return Math.max(0, box.max[0] - box.min[0]) * Math.max(0, box.max[1] - box.min[1]) * Math.max(0, box.max[2] - box.min[2]);
}

function intersection(a: Aabb, b: Aabb): number {
  let total = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const span = Math.min(a.max[axis]!, b.max[axis]!) - Math.max(a.min[axis]!, b.min[axis]!);
    if (span <= 0) return 0;
    total *= span;
  }
  return total;
}

/** Ray against a local box: entry distance or null (slab test). */
function rayBox(origin: BaseVec3, direction: BaseVec3, box: StructureBox, maxDistance: number): number | null {
  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis]!;
    const d = direction[axis]!;
    const lo = box.min[axis]!;
    const hi = box.max[axis]!;
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  return near;
}

function copyPlaced(piece: BasePiece): BasePiece {
  return { ...piece, position: [piece.position[0], piece.position[1], piece.position[2]] };
}

/**
 * Snap-together base building: pieces of a shape and a material tier, snapped socket to socket through
 * `placement/buildSockets` or stood on terrain, refused when they overlap what stands, held up by a
 * support graph that drops whatever loses its last path to the ground, damaged per tier and damage
 * class, with doors that swing and solids that collide. Pure and serializable; the game owns items,
 * costs and input, `BaseStructures.draw` draws it.
 *
 * @capability base-building snap-together base pieces with tiers, health, support collapse, doors, overlap rejection and collision solids
 */
export function createBaseBuilding(config: BaseBuildingConfig): BaseBuilding {
  const snapDistance = config.snapDistance ?? 2;
  const overlapTolerance = config.overlapTolerance ?? 0.4;
  const shapes = new Map(config.shapes.map((shape) => [shape.id, shape]));
  const tiers = new Map(config.tiers.map((tier) => [tier.id, tier]));
  const pieces = new Map(config.pieces.map((piece) => [piece.id, piece]));
  const catalog = createBuildSocketCatalog({
    pieces: config.shapes.map((shape) => ({ type: shape.id, sockets: shape.sockets ?? [] })),
    rules: config.rules,
  });

  let placed = new Map<string, BasePiece>();
  let nextId = 1;
  let version = 0;
  const frames = new Map<string, { pose: StructureFramePose; deck: StructureFrameDeck | null }>();

  const frameToWorld = (pose: StructureFramePose, local: BaseVec3): BaseVec3 => {
    const turned = rotate(local, pose.yaw);
    return [pose.position[0] + turned[0], pose.position[1] + turned[1], pose.position[2] + turned[2]];
  };
  const frameToLocal = (pose: StructureFramePose, world: BaseVec3): BaseVec3 =>
    unrotate([world[0] - pose.position[0], world[1] - pose.position[1], world[2] - pose.position[2]], pose.yaw);

  /** A piece where it stands in the world now; `null` while its frame has not been posed. */
  const posed = (piece: BasePiece): BasePiece | null => {
    if (piece.parent === undefined || piece.parent === null) return piece;
    const frame = frames.get(piece.parent);
    if (frame === undefined) return null;
    return { ...piece, position: frameToWorld(frame.pose, piece.position), rotationY: piece.rotationY + frame.pose.yaw };
  };
  const standing = (): BasePiece[] => {
    const out: BasePiece[] = [];
    for (const piece of placed.values()) {
      const here = posed(piece);
      if (here !== null) out.push(here);
    }
    return out;
  };

  /** The highest frame deck over a world point, and its top. */
  const deckAt = (x: number, z: number): { id: string; top: number } | null => {
    let best: { id: string; top: number } | null = null;
    for (const [id, frame] of frames) {
      if (frame.deck === null) continue;
      const local = frameToLocal(frame.pose, [x, frame.pose.position[1], z]);
      if (Math.abs(local[0]) > frame.deck.halfX || Math.abs(local[2] - (frame.deck.offsetZ ?? 0)) > frame.deck.halfZ) continue;
      const top = frame.pose.position[1] + frame.deck.height;
      if (best === null || top > best.top) best = { id, top };
    }
    return best;
  };

  const shapeOf = (pieceId: string): StructureShapeDef | null => {
    const def = pieces.get(pieceId);
    return def === undefined ? null : (shapes.get(def.shape) ?? null);
  };

  const boxesOf = (pieceId: string, open: boolean): readonly StructureBox[] => {
    const shape = shapeOf(pieceId);
    if (shape === null) return [];
    return open && shape.openBoxes !== undefined ? shape.openBoxes : shape.boxes;
  };

  const aabbsOf = (pieceId: string, position: BaseVec3, rotationY: number, open = false): Aabb[] =>
    boxesOf(pieceId, open).map((box) => worldAabb(box, position, rotationY));

  const pieceVolume = (pieceId: string): number => boxesOf(pieceId, false).reduce((sum, box) => sum + volume(box), 0);

  const overlaps = (pieceId: string, position: BaseVec3, rotationY: number): boolean => {
    // Measured in the new piece's own frame: pieces on a grid turned to any heading (a carrier's deck) stay
    // box-exact there, where world-axis bounds of turned boxes would swell and clash with their neighbours.
    const mine = aabbsOf(pieceId, [0, 0, 0], 0);
    const myVolume = pieceVolume(pieceId);
    for (const other of standing()) {
      const offset = unrotate([other.position[0] - position[0], other.position[1] - position[1], other.position[2] - position[2]], rotationY);
      const theirs = aabbsOf(other.pieceId, offset, other.rotationY - rotationY, other.open);
      let shared = 0;
      for (const a of mine) for (const b of theirs) shared += intersection(a, b);
      if (shared <= 0) continue;
      const smaller = Math.min(myVolume, pieceVolume(other.pieceId));
      if (smaller <= 0 || shared / smaller > overlapTolerance) return true;
    }
    return false;
  };

  const center = (pieceId: string, position: BaseVec3, rotationY: number): BaseVec3 => {
    const boxes = aabbsOf(pieceId, position, rotationY);
    if (boxes.length === 0) return position;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const box of boxes) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, box.min[axis]!);
        max[axis] = Math.max(max[axis]!, box.max[axis]!);
      }
    }
    return [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
  };

  interface SnapOption {
    targetId: string;
    position: BaseVec3;
    rotationY: number;
    mateDistance: number;
    score: number;
    valid: boolean;
  }

  const snapOptions = (pieceId: string, shape: StructureShapeDef, cursor: BaseVec3): SnapOption[] => {
    if ((shape.sockets ?? []).length === 0) return [];
    const reach = snapDistance + 8;
    const out: SnapOption[] = [];
    for (const target of standing()) {
      if (Math.hypot(target.position[0] - cursor[0], target.position[2] - cursor[2]) > reach) continue;
      const targetShape = pieces.get(target.pieceId)?.shape;
      if (targetShape === undefined) continue;
      const snaps = catalog.resolveSnaps(
        { type: targetShape, transform: { position: target.position, yaw: -target.rotationY } },
        shape.id,
        { cursor },
      );
      for (const snap of snaps) {
        if (snap.distance > snapDistance) continue;
        const rotationY = -snap.transform.yaw;
        const position = snap.transform.position;
        const middle = center(pieceId, position, rotationY);
        const away = Math.hypot(middle[0] - cursor[0], middle[2] - cursor[2]);
        out.push({
          targetId: target.id,
          position,
          rotationY,
          mateDistance: snap.distance,
          score: snap.distance + 0.5 * away,
          valid: !overlaps(pieceId, position, rotationY),
        });
      }
    }
    return out.sort((a, b) => a.score - b.score);
  };

  const groundPlan = (pieceId: string, shape: StructureShapeDef, cursor: BaseVec3, rotationY: number, groundHeightAt: (x: number, z: number) => number): StructurePlan => {
    const rule = shape.ground!;
    const footprint = aabbsOf(pieceId, [cursor[0], 0, cursor[2]], rotationY);
    const minX = Math.min(...footprint.map((box) => box.min[0]));
    const maxX = Math.max(...footprint.map((box) => box.max[0]));
    const minZ = Math.min(...footprint.map((box) => box.min[2]));
    const maxZ = Math.max(...footprint.map((box) => box.max[2]));
    const heights = [
      groundHeightAt(cursor[0], cursor[2]),
      groundHeightAt(minX, minZ),
      groundHeightAt(minX, maxZ),
      groundHeightAt(maxX, minZ),
      groundHeightAt(maxX, maxZ),
    ];
    const top = Math.max(...heights);
    const position: BaseVec3 = [cursor[0], top + (rule.lift ?? 0), cursor[2]];
    const plan: StructurePlan = { pieceId, position, rotationY, valid: true, mode: "ground", targetId: null, grounded: true };
    if (top - Math.min(...heights) > (rule.maxStep ?? 1)) return { ...plan, valid: false, reason: "too-steep" };
    if (overlaps(pieceId, position, rotationY)) return { ...plan, valid: false, reason: "overlap" };
    return plan;
  };

  const touchesGround = (pieceId: string, position: BaseVec3, rotationY: number, groundHeightAt: (x: number, z: number) => number): boolean => {
    const middle = center(pieceId, position, rotationY);
    const bottom = Math.min(...aabbsOf(pieceId, position, rotationY).map((box) => box.min[1]));
    return bottom <= groundHeightAt(middle[0], middle[2]);
  };

  const floorUnder = (cursor: BaseVec3): { id: string; top: number } | null => {
    let best: { id: string; top: number } | null = null;
    for (const piece of standing()) {
      for (const box of aabbsOf(piece.pieceId, piece.position, piece.rotationY, piece.open)) {
        if (cursor[0] < box.min[0] || cursor[0] > box.max[0] || cursor[2] < box.min[2] || cursor[2] > box.max[2]) continue;
        if (Math.abs(box.max[1] - cursor[1]) > 1.5) continue;
        if (best === null || box.max[1] > best.top) best = { id: piece.id, top: box.max[1] };
      }
    }
    return best;
  };

  const socketKey = (position: BaseVec3): string =>
    `${Math.round(position[0] / SOCKET_GRID)}:${Math.round(position[1] / SOCKET_GRID)}:${Math.round(position[2] / SOCKET_GRID)}`;

  /** Pieces joined by mated sockets or by resting one on another. */
  const neighbours = (): Map<string, Set<string>> => {
    const links = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (a === b) return;
      (links.get(a) ?? links.set(a, new Set()).get(a)!).add(b);
      (links.get(b) ?? links.set(b, new Set()).get(b)!).add(a);
    };
    const buckets = new Map<string, { id: string; kind: string; position: BaseVec3 }[]>();
    for (const piece of standing()) {
      const shape = pieces.get(piece.pieceId)?.shape;
      if (shape === undefined) continue;
      for (const socket of catalog.worldSockets({ type: shape, transform: { position: piece.position, yaw: -piece.rotationY } })) {
        const key = socketKey(socket.position);
        const bucket = buckets.get(key) ?? buckets.set(key, []).get(key)!;
        for (const other of bucket) {
          if (other.id === piece.id) continue;
          if (Math.hypot(other.position[0] - socket.position[0], other.position[1] - socket.position[1], other.position[2] - socket.position[2]) > SOCKET_GRID) continue;
          if (catalog.canConnect(socket.kind, other.kind) || catalog.canConnect(other.kind, socket.kind)) link(piece.id, other.id);
        }
        bucket.push({ id: piece.id, kind: socket.kind, position: socket.position });
      }
      if (piece.restsOn !== null) link(piece.id, piece.restsOn);
    }
    return links;
  };

  /** Drop every piece with no path to a grounded one. */
  const collapse = (): BasePiece[] => {
    const links = neighbours();
    const held = new Set<string>();
    const queue = [...placed.values()].filter((piece) => piece.grounded || posed(piece) === null).map((piece) => piece.id);
    for (const id of queue) held.add(id);
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const next of links.get(id) ?? []) {
        if (held.has(next)) continue;
        held.add(next);
        queue.push(next);
      }
    }
    const fallen: BasePiece[] = [];
    for (const piece of [...placed.values()]) {
      if (held.has(piece.id)) continue;
      fallen.push(posed(piece) ?? piece);
      placed.delete(piece.id);
    }
    return fallen;
  };

  const take = (id: string): BasePiece[] => {
    const piece = placed.get(id);
    if (piece === undefined) return [];
    const where = posed(piece) ?? piece;
    placed.delete(id);
    const removed = [where, ...collapse()];
    version += 1;
    return removed;
  };

  const worldBoxes: BaseBuilding["worldBoxes"] = (item) =>
    boxesOf(item.pieceId, item.open === true).map((box) => {
      const local: BaseVec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
      const turned = rotate(local, item.rotationY);
      return {
        center: [item.position[0] + turned[0], item.position[1] + turned[1], item.position[2] + turned[2]],
        halfExtents: [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2],
        rotationY: item.rotationY,
      };
    });

  return {
    piece: (pieceId) => pieces.get(pieceId) ?? null,
    shape: shapeOf,
    plan(pieceId, cursor, options = {}) {
      const shape = shapeOf(pieceId);
      const rotationY = options.rotationY ?? 0;
      if (shape === null) return { pieceId, position: cursor, rotationY, valid: false, reason: "unknown-piece", mode: "ground", targetId: null, grounded: false };
      // A frame's deck is ground too, wherever it has walked to.
      const terrain = options.groundHeightAt;
      const decked = [...frames.values()].some((frame) => frame.deck !== null);
      const groundHeightAt =
        !decked
          ? terrain
          : (x: number, z: number) => {
              const below = terrain?.(x, z) ?? -Infinity;
              const deck = deckAt(x, z);
              return deck !== null && deck.top >= below ? deck.top : below;
            };
      const parentOf = (id: string | null): string | null => (id === null ? null : (placed.get(id)?.parent ?? null));
      const snaps = snapOptions(pieceId, shape, cursor);
      const free = snaps.filter((option) => option.valid);
      if (free.length > 0) {
        // Snaps that share the best mate point are the same spot turned another way: the variant picks one.
        const best = free[0]!;
        const sameSpot = free.filter((option) => option.targetId === best.targetId && Math.abs(option.mateDistance - best.mateDistance) < MATCH);
        const chosen = sameSpot[((options.variant ?? 0) % sameSpot.length + sameSpot.length) % sameSpot.length]!;
        const grounded = shape.ground !== undefined && groundHeightAt !== undefined && touchesGround(pieceId, chosen.position, chosen.rotationY, groundHeightAt);
        return { pieceId, position: chosen.position, rotationY: chosen.rotationY, valid: true, mode: "snap", targetId: chosen.targetId, grounded, parent: parentOf(chosen.targetId) };
      }
      if (shape.floor === true) {
        const floor = floorUnder(cursor);
        if (floor !== null) {
          const position: BaseVec3 = [cursor[0], floor.top, cursor[2]];
          const plan: StructurePlan = { pieceId, position, rotationY, valid: true, mode: "floor", targetId: floor.id, grounded: false, parent: parentOf(floor.id) };
          return overlaps(pieceId, position, rotationY) ? { ...plan, valid: false, reason: "overlap" } : plan;
        }
      }
      if (shape.ground !== undefined && groundHeightAt !== undefined) {
        const plan = groundPlan(pieceId, shape, cursor, rotationY, groundHeightAt);
        const deck = deckAt(cursor[0], cursor[2]);
        const onDeck = deck !== null && deck.top >= (terrain?.(cursor[0], cursor[2]) ?? -Infinity);
        return onDeck ? { ...plan, parent: deck.id } : plan;
      }
      const blocked = snaps[0];
      if (blocked !== undefined) return { pieceId, position: blocked.position, rotationY: blocked.rotationY, valid: false, reason: "overlap", mode: "snap", targetId: blocked.targetId, grounded: false };
      return { pieceId, position: cursor, rotationY, valid: false, reason: "no-support", mode: "snap", targetId: null, grounded: false };
    },
    place(plan, options = {}) {
      if (!plan.valid || !pieces.has(plan.pieceId)) return null;
      if (plan.targetId !== null && !placed.has(plan.targetId)) return null;
      if (overlaps(plan.pieceId, plan.position, plan.rotationY)) return null;
      const parent = plan.parent ?? null;
      const frame = parent === null ? null : (frames.get(parent) ?? null);
      if (parent !== null && frame === null) return null;
      const piece: BasePiece = {
        id: `s${nextId}`,
        pieceId: plan.pieceId,
        position: frame === null ? [plan.position[0], plan.position[1], plan.position[2]] : frameToLocal(frame.pose, plan.position),
        rotationY: frame === null ? plan.rotationY : plan.rotationY - frame.pose.yaw,
        health: pieces.get(plan.pieceId)!.health,
        open: false,
        grounded: plan.grounded,
        restsOn: plan.mode === "floor" ? plan.targetId : null,
        owner: options.owner ?? null,
        ...(parent === null ? {} : { parent }),
      };
      nextId += 1;
      placed.set(piece.id, piece);
      version += 1;
      return copyPlaced(posed(piece) ?? piece);
    },
    remove: (id) => ({ removed: take(id) }),
    damage(id, amount, damageClass) {
      const piece = placed.get(id);
      if (piece === undefined) return { applied: 0, removed: [] };
      const tier = tiers.get(pieces.get(piece.pieceId)?.tier ?? "");
      const scale = tier?.damage?.[damageClass] ?? tier?.damage?.["*"] ?? 1;
      const applied = Math.min(piece.health, Math.max(0, amount * scale));
      if (applied <= 0) return { applied: 0, removed: [] };
      piece.health -= applied;
      version += 1;
      return { applied, removed: piece.health <= 0 ? take(id) : [] };
    },
    toggle(id) {
      const piece = placed.get(id);
      if (piece === undefined || shapeOf(piece.pieceId)?.openBoxes === undefined) return null;
      piece.open = !piece.open;
      version += 1;
      return piece.open;
    },
    get: (id) => {
      const piece = placed.get(id);
      const here = piece === undefined ? null : posed(piece);
      return here === null ? null : copyPlaced(here);
    },
    list: () => standing().map(copyPlaced),
    raycast(origin, direction, maxDistance) {
      const length = Math.hypot(direction[0], direction[1], direction[2]);
      if (length === 0) return null;
      const dir: BaseVec3 = [direction[0] / length, direction[1] / length, direction[2] / length];
      let best: StructureHit | null = null;
      for (const piece of standing()) {
        const offset: BaseVec3 = [origin[0] - piece.position[0], origin[1] - piece.position[1], origin[2] - piece.position[2]];
        const localOrigin = unrotate(offset, piece.rotationY);
        const localDir = unrotate(dir, piece.rotationY);
        for (const box of boxesOf(piece.pieceId, piece.open)) {
          const t = rayBox(localOrigin, localDir, box, best?.distance ?? maxDistance);
          if (t === null) continue;
          best = { id: piece.id, distance: t, point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t] };
        }
      }
      return best;
    },
    worldBoxes,
    solids: () => standing().flatMap((piece) => worldBoxes(piece)),
    setFrame(id, pose, deck) {
      const before = frames.get(id);
      const next = { pose: { position: [pose.position[0], pose.position[1], pose.position[2]] as BaseVec3, yaw: pose.yaw }, deck: deck ?? null };
      frames.set(id, next);
      const moved =
        before === undefined ||
        before.pose.yaw !== pose.yaw ||
        before.pose.position.some((value, axis) => value !== pose.position[axis]);
      // Only what rides the frame moves with it: a pose change re-draws and re-collides those pieces.
      if (moved && [...placed.values()].some((piece) => piece.parent === id)) version += 1;
    },
    removeFrame(id) {
      const removed: BasePiece[] = [];
      for (const piece of [...placed.values()]) {
        if (piece.parent !== id) continue;
        removed.push(posed(piece) ?? piece);
        placed.delete(piece.id);
      }
      frames.delete(id);
      if (removed.length > 0) {
        removed.push(...collapse());
        version += 1;
      }
      return { removed };
    },
    version: () => version,
    snapshot: () => ({ pieces: [...placed.values()].map(copyPlaced), nextId }),
    restore(state) {
      placed = new Map(state.pieces.filter((piece) => pieces.has(piece.pieceId)).map((piece) => [piece.id, copyPlaced(piece)]));
      nextId = state.nextId;
      version += 1;
    },
    clear() {
      placed = new Map();
      nextId = 1;
      version += 1;
    },
  };
}
