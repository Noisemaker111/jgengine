export type ConnectorVec3 = readonly [number, number, number];

export interface ConnectorSocket {
  id: string;
  type: string;
  offset: ConnectorVec3;
  accepts?: readonly string[];
}

export interface ConnectorPieceDef {
  kind: string;
  sockets: readonly ConnectorSocket[];
}

export interface PlacedPiece {
  id: string;
  kind: string;
  position: ConnectorVec3;
  rotationY: number;
}

export interface WorldSocket {
  pieceId: string;
  socket: ConnectorSocket;
  position: ConnectorVec3;
}

export interface SnapResult {
  socketId: string;
  targetPieceId: string;
  targetSocketId: string;
  position: ConnectorVec3;
  rotationY: number;
  distance: number;
}

export interface SnapOptions {
  snapDistance?: number;
  rotationY?: number;
}

export function socketsCompatible(a: ConnectorSocket, b: ConnectorSocket): boolean {
  const aAccepts = a.accepts ?? [a.type];
  const bAccepts = b.accepts ?? [b.type];
  return aAccepts.includes(b.type) && bAccepts.includes(a.type);
}

function rotateY(offset: ConnectorVec3, rotationY: number): ConnectorVec3 {
  if (rotationY === 0) return offset;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [offset[0] * cos + offset[2] * sin, offset[1], -offset[0] * sin + offset[2] * cos];
}

export function socketWorldPosition(
  socket: ConnectorSocket,
  origin: ConnectorVec3,
  rotationY: number,
): ConnectorVec3 {
  const rotated = rotateY(socket.offset, rotationY);
  return [origin[0] + rotated[0], origin[1] + rotated[1], origin[2] + rotated[2]];
}

export function worldSockets(def: ConnectorPieceDef, piece: PlacedPiece): WorldSocket[] {
  return def.sockets.map((socket) => ({
    pieceId: piece.id,
    socket,
    position: socketWorldPosition(socket, piece.position, piece.rotationY),
  }));
}

export type ConnectorRegistry = (kind: string) => ConnectorPieceDef | null;

export function collectWorldSockets(
  registry: ConnectorRegistry,
  pieces: readonly PlacedPiece[],
): WorldSocket[] {
  const out: WorldSocket[] = [];
  for (const piece of pieces) {
    const def = registry(piece.kind);
    if (def === null) continue;
    for (const world of worldSockets(def, piece)) out.push(world);
  }
  return out;
}

export function snapToNearest(
  registry: ConnectorRegistry,
  placed: readonly PlacedPiece[],
  movingDef: ConnectorPieceDef,
  cursor: ConnectorVec3,
  options: SnapOptions = {},
): SnapResult | null {
  const snapDistance = options.snapDistance ?? 1.5;
  const rotationY = options.rotationY ?? 0;
  const targets = collectWorldSockets(registry, placed);
  let best: SnapResult | null = null;
  for (const socket of movingDef.sockets) {
    const socketWorld = socketWorldPosition(socket, cursor, rotationY);
    for (const target of targets) {
      if (!socketsCompatible(socket, target.socket)) continue;
      const distance = Math.hypot(
        socketWorld[0] - target.position[0],
        socketWorld[1] - target.position[1],
        socketWorld[2] - target.position[2],
      );
      if (distance > snapDistance) continue;
      if (best !== null && distance >= best.distance) continue;
      const localRotated = rotateY(socket.offset, rotationY);
      const position: ConnectorVec3 = [
        target.position[0] - localRotated[0],
        target.position[1] - localRotated[1],
        target.position[2] - localRotated[2],
      ];
      best = {
        socketId: socket.id,
        targetPieceId: target.pieceId,
        targetSocketId: target.socket.id,
        position,
        rotationY,
        distance,
      };
    }
  }
  return best;
}
