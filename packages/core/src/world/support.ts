import type { AddBodyOptions } from "../physics/physicsWorld";
import type { ConnectorVec3 } from "./connectors";

export interface SupportPiece {
  id: string;
  grounded?: boolean;
  position?: ConnectorVec3;
  halfExtents?: ConnectorVec3;
  mass?: number;
}

export interface SupportLink {
  a: string;
  b: string;
}

export interface SupportConfig {
  maxDistance?: number;
}

export interface SupportResult {
  supported: readonly string[];
  unsupported: readonly string[];
  distance: Readonly<Record<string, number>>;
}

export function solveSupport(
  pieces: readonly SupportPiece[],
  links: readonly SupportLink[],
  config: SupportConfig = {},
): SupportResult {
  const maxDistance = config.maxDistance ?? Infinity;
  const ids = new Set(pieces.map((piece) => piece.id));
  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const link of links) {
    if (!ids.has(link.a) || !ids.has(link.b)) continue;
    adjacency.get(link.a)!.push(link.b);
    adjacency.get(link.b)!.push(link.a);
  }

  const distance: Record<string, number> = {};
  const queue: string[] = [];
  for (const piece of pieces) {
    if (piece.grounded === true) {
      distance[piece.id] = 0;
      queue.push(piece.id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head]!;
    head += 1;
    const currentDistance = distance[current]!;
    if (currentDistance >= maxDistance) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      const next = currentDistance + 1;
      if (distance[neighbor] === undefined || next < distance[neighbor]!) {
        distance[neighbor] = next;
        queue.push(neighbor);
      }
    }
  }

  const supported: string[] = [];
  const unsupported: string[] = [];
  for (const piece of pieces) {
    const d = distance[piece.id];
    if (d !== undefined && d <= maxDistance) supported.push(piece.id);
    else unsupported.push(piece.id);
  }
  return { supported, unsupported, distance };
}

export interface DebrisOptions {
  scatter?: number;
  seed?: number;
}

function scatterHash(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

export function toDebrisBodies(
  pieces: readonly SupportPiece[],
  collapsedIds: readonly string[],
  options: DebrisOptions = {},
): AddBodyOptions[] {
  const scatter = options.scatter ?? 1.5;
  const seed = options.seed ?? 1;
  const collapse = new Set(collapsedIds);
  const bodies: AddBodyOptions[] = [];
  let index = 0;
  for (const piece of pieces) {
    if (!collapse.has(piece.id)) continue;
    const position = piece.position ?? [0, 0, 0];
    const halfExtents = piece.halfExtents ?? [0.5, 0.5, 0.5];
    const vx = scatterHash(seed, index) * scatter;
    const vz = scatterHash(seed, index + 977) * scatter;
    bodies.push({
      position,
      halfExtents,
      velocity: [vx, 0, vz],
      ...(piece.mass === undefined ? {} : { mass: piece.mass }),
    });
    index += 1;
  }
  return bodies;
}
