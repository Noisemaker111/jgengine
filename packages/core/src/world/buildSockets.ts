/**
 * Data-driven modular build-piece snap system: a catalog of piece types, each declaring named
 * sockets (local position + outward facing + a generic "kind"), plus a connection-rule table saying
 * which socket kinds may mate. Given a placed piece and a candidate type it resolves every valid
 * snap — the world transform that lands the candidate's socket exactly on the placed piece's socket,
 * facing back into it. Genre-agnostic: foundation/wall/ceiling/pillar/edge snapping falls out of the
 * catalog data, with no game-specific piece names baked in. Pure and serializable; composes with
 * `world/footprintGrid` occupancy (via an injected `isFree` predicate — never imported) and with
 * `scene/modelSockets` named attach points (via {@link pieceSocketsFromModel}).
 */

/** A local- or world-space position/offset, matching the `[x, y, z]` triple used across core. */
export type SocketVec3 = readonly [number, number, number];

/** One named socket on a piece: where it sits and which horizontal direction it faces (yaw about Y). */
export interface SocketDef {
  /** Stable socket name, unique within its piece. */
  name: string;
  /** Generic connection kind — e.g. "top", "bottom", "edge", "side". Matched by the rule table. */
  kind: string;
  /** Local offset from the piece origin. */
  position: SocketVec3;
  /** Outward-facing yaw in radians (rotation about +Y), local to the piece. Default `0`. */
  yaw?: number;
}

/** A rectangular footprint (world units) a piece occupies on the build grid — the occupancy bridge. */
export interface BuildFootprint {
  w: number;
  d: number;
}

/** A registered piece type: its named sockets and, optionally, the footprint it claims when placed. */
export interface BuildPieceDef {
  /** Stable piece-type id, unique within the catalog. */
  type: string;
  sockets: readonly SocketDef[];
  /** Grid footprint for occupancy checks; omit for pieces that don't reserve cells. */
  footprint?: BuildFootprint;
}

/** Declares that two socket kinds may snap together; `mutual` (default `true`) also allows `b`→`a`. */
export interface ConnectionRule {
  a: string;
  b: string;
  /** When `false` the rule is directional: an `a`-kind candidate socket may mate onto a `b`-kind placed socket, but not the reverse. */
  mutual?: boolean;
}

/** World transform of a placed piece: position plus a yaw about +Y. */
export interface PieceTransform {
  position: SocketVec3;
  /** Rotation about +Y in radians. Default `0`. */
  yaw?: number;
}

/** An already-placed piece the resolver snaps candidates against. */
export interface PlacedPiece {
  type: string;
  transform: PieceTransform;
}

/** A piece's socket resolved into world space. */
export interface PlacedSocket {
  name: string;
  kind: string;
  /** World-space socket position. */
  position: SocketVec3;
  /** World-space outward facing yaw (radians). */
  yaw: number;
}

/** One integer grid cell — structurally the `GridCell` of `world/footprintGrid` (no import needed). */
export interface BuildCell {
  col: number;
  row: number;
}

/** A resolved snap: which sockets mate and the world transform that lands the candidate onto the target. */
export interface SnapCandidate {
  candidateType: string;
  /** Name of the socket on the already-placed piece. */
  targetSocket: string;
  /** Name of the candidate's socket that mates onto it. */
  candidateSocket: string;
  /** Where to place the candidate so its socket aligns onto the target socket. */
  transform: { position: SocketVec3; yaw: number };
  /** Shared world position of the mated sockets. */
  point: SocketVec3;
  /** Distance from the resolve `cursor` to `point`, or `0` when no cursor was given. */
  distance: number;
}

/** Options for {@link BuildSocketCatalog.resolveSnaps}. */
export interface ResolveSnapsOptions {
  /** Cursor point; when given, candidates are ordered nearest-first by mate-point distance. */
  cursor?: SocketVec3;
  /**
   * Occupancy predicate — return `false` to reject a snap whose target cells are taken. Only applied
   * to candidate pieces that declare a `footprint`. Compose with `world/footprintGrid` via
   * `(cell) => grid.isFree([cell])`; the catalog never imports the grid.
   */
  isFree?: (cell: BuildCell) => boolean;
}

/** Serializable catalog config; also the shape returned by {@link BuildSocketCatalog.toJSON}. */
export interface BuildSocketCatalogConfig {
  pieces: readonly BuildPieceDef[];
  rules: readonly ConnectionRule[];
  /** World units per grid cell for footprint occupancy. Default `1`. */
  cellSize?: number;
}

/** Handle returned by {@link createBuildSocketCatalog}. */
export interface BuildSocketCatalog {
  readonly cellSize: number;
  has(type: string): boolean;
  piece(type: string): BuildPieceDef | null;
  /** Registered piece-type ids, in declaration order. */
  types(): readonly string[];
  /** True when a `candidateKind` socket may mate onto a `placedKind` socket. */
  canConnect(candidateKind: string, placedKind: string): boolean;
  /** Every socket of `placed` resolved into world space. */
  worldSockets(placed: PlacedPiece): PlacedSocket[];
  /** Every valid snap of `candidateType` onto `placed`, ordered deterministically. */
  resolveSnaps(placed: PlacedPiece, candidateType: string, options?: ResolveSnapsOptions): SnapCandidate[];
  /** Plain, serializable snapshot — feed straight back into {@link createBuildSocketCatalog}. */
  toJSON(): BuildSocketCatalogConfig;
}

/** Length-prefixed composite key (avoids delimiter collisions without any control characters). */
function pairKey(a: string, b: string): string {
  return `${a.length}:${a}:${b}`;
}

/** Rotate a local offset about +Y by `yaw` radians (affects X/Z, leaves Y). */
function rotateY(v: SocketVec3, yaw: number): SocketVec3 {
  if (yaw === 0) return [v[0], v[1], v[2]];
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [v[0] * cos - v[2] * sin, v[1], v[0] * sin + v[2] * cos];
}

function cloneSocket(socket: SocketDef): SocketDef {
  return {
    name: socket.name,
    kind: socket.kind,
    position: [socket.position[0], socket.position[1], socket.position[2]],
    ...(socket.yaw === undefined ? {} : { yaw: socket.yaw }),
  };
}

function clonePiece(piece: BuildPieceDef): BuildPieceDef {
  return {
    type: piece.type,
    sockets: piece.sockets.map(cloneSocket),
    ...(piece.footprint === undefined ? {} : { footprint: { w: piece.footprint.w, d: piece.footprint.d } }),
  };
}

/**
 * The grid cells a piece `footprint` centered on `position` (world units) covers, honoring `yaw`
 * (snapped to the nearest quarter turn). Mirrors `world/footprintGrid`'s `cellsFor` so a game can
 * feed the result straight into `grid.isFree`/`grid.reserve` after committing a resolved snap —
 * without this module importing the grid.
 *
 * @capability build-footprint-cells grid cells a snapped build piece footprint covers (footprintGrid occupancy bridge)
 */
export function footprintCells(
  position: SocketVec3,
  footprint: BuildFootprint,
  yaw = 0,
  cellSize = 1,
): BuildCell[] {
  const quarterTurns = Math.round(yaw / (Math.PI / 2));
  const turned = (((quarterTurns % 2) + 2) % 2) === 1;
  const cols = Math.max(1, Math.round((turned ? footprint.d : footprint.w) / cellSize));
  const rows = Math.max(1, Math.round((turned ? footprint.w : footprint.d) / cellSize));
  const originCol = Math.round(position[0] / cellSize - cols / 2);
  const originRow = Math.round(position[2] / cellSize - rows / 2);
  const cells: BuildCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) cells.push({ col: originCol + col, row: originRow + row });
  }
  return cells;
}

/** A `{ name, offset }` attach point — structurally the `ModelSocket` of `scene/modelSockets`. */
export interface ModelSocketLike {
  name: string;
  offset: SocketVec3;
}

/**
 * Turn a model's named attach points (from `scene/modelSockets`' `readNamedSockets`) into
 * {@link SocketDef}s, classifying each into a connection `kind` via `kindOf` and, optionally, an
 * outward `yaw` via `yawOf`. Lets an artist author snap sockets as empties in a GLB instead of by
 * hand in the catalog. Pure and structural — no three.js or scene import.
 *
 * @capability piece-sockets-from-model derive build-piece snap sockets from a model's named attach points
 */
export function pieceSocketsFromModel(
  sockets: readonly ModelSocketLike[],
  kindOf: (name: string) => string,
  yawOf?: (name: string) => number,
): SocketDef[] {
  return sockets.map((socket) => ({
    name: socket.name,
    kind: kindOf(socket.name),
    position: [socket.offset[0], socket.offset[1], socket.offset[2]] as SocketVec3,
    ...(yawOf === undefined ? {} : { yaw: yawOf(socket.name) }),
  }));
}

/**
 * Build a modular snap catalog from piece definitions and a connection-rule table. Resolves the set
 * of valid snap transforms when hovering a candidate piece near a placed one: for every compatible
 * socket pair it computes the world transform that seats the candidate's socket onto the placed
 * socket, oriented to face back into it. Deterministic ordering (nearest a cursor when given, else
 * declaration order) and an optional occupancy predicate keep it drop-in for a build-mode controller.
 *
 * @capability build-socket-catalog data-driven named-socket snap catalog for modular base building
 */
export function createBuildSocketCatalog(config: BuildSocketCatalogConfig): BuildSocketCatalog {
  const cellSize = config.cellSize ?? 1;
  const pieces = new Map<string, BuildPieceDef>();
  const order: string[] = [];
  for (const piece of config.pieces) {
    const clone = clonePiece(piece);
    pieces.set(clone.type, clone);
    order.push(clone.type);
  }

  const compatible = new Set<string>();
  const rules: ConnectionRule[] = [];
  for (const rule of config.rules) {
    compatible.add(pairKey(rule.a, rule.b));
    if (rule.mutual !== false) compatible.add(pairKey(rule.b, rule.a));
    rules.push({ a: rule.a, b: rule.b, ...(rule.mutual === undefined ? {} : { mutual: rule.mutual }) });
  }

  const canConnect = (candidateKind: string, placedKind: string): boolean =>
    compatible.has(pairKey(candidateKind, placedKind));

  const worldSockets = (placed: PlacedPiece): PlacedSocket[] => {
    const def = pieces.get(placed.type);
    if (def === undefined) return [];
    const baseYaw = placed.transform.yaw ?? 0;
    const origin = placed.transform.position;
    return def.sockets.map((socket) => {
      const rotated = rotateY(socket.position, baseYaw);
      return {
        name: socket.name,
        kind: socket.kind,
        position: [origin[0] + rotated[0], origin[1] + rotated[1], origin[2] + rotated[2]],
        yaw: baseYaw + (socket.yaw ?? 0),
      };
    });
  };

  return {
    cellSize,
    has(type) {
      return pieces.has(type);
    },
    piece(type) {
      const def = pieces.get(type);
      return def === undefined ? null : clonePiece(def);
    },
    types() {
      return order.slice();
    },
    canConnect,
    worldSockets,
    resolveSnaps(placed, candidateType, options = {}) {
      const candidateDef = pieces.get(candidateType);
      if (candidateDef === undefined) return [];
      const targets = worldSockets(placed);
      const cursor = options.cursor;
      const isFree = options.isFree;

      const out: SnapCandidate[] = [];
      for (const target of targets) {
        for (const socket of candidateDef.sockets) {
          if (!canConnect(socket.kind, target.kind)) continue;

          // Seat the candidate socket onto the target: same world point, facing opposite.
          const candidateYaw = target.yaw + Math.PI - (socket.yaw ?? 0);
          const rotated = rotateY(socket.position, candidateYaw);
          const positionX = target.position[0] - rotated[0];
          const positionY = target.position[1] - rotated[1];
          const positionZ = target.position[2] - rotated[2];
          const position: SocketVec3 = [positionX, positionY, positionZ];

          if (isFree !== undefined && candidateDef.footprint !== undefined) {
            const cells = footprintCells(position, candidateDef.footprint, candidateYaw, cellSize);
            if (!cells.every((cell) => isFree(cell))) continue;
          }

          const distance =
            cursor === undefined
              ? 0
              : Math.hypot(
                  target.position[0] - cursor[0],
                  target.position[1] - cursor[1],
                  target.position[2] - cursor[2],
                );

          out.push({
            candidateType,
            targetSocket: target.name,
            candidateSocket: socket.name,
            transform: { position, yaw: candidateYaw },
            point: [target.position[0], target.position[1], target.position[2]],
            distance,
          });
        }
      }

      // Nearest-first when a cursor is given; Array.sort is stable so equal distances keep
      // declaration order. Without a cursor the array is already in declaration order.
      if (cursor !== undefined) out.sort((x, y) => x.distance - y.distance);
      return out;
    },
    toJSON() {
      return {
        cellSize,
        pieces: order.map((type) => clonePiece(pieces.get(type)!)),
        rules: rules.map((rule) => ({
          a: rule.a,
          b: rule.b,
          ...(rule.mutual === undefined ? {} : { mutual: rule.mutual }),
        })),
      };
    },
  };
}
