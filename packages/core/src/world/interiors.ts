import { resolveMove, type Aabb, type Vec2 } from "./geometry";

export type SpaceRef = { kind: "exterior" } | { kind: "interior"; id: string };

export interface EntityLocation {
  space: SpaceRef;
  position: Vec2;
}

export interface Interior {
  id: string;
  origin: Vec2;
  rotation?: number;
  bounds: Aabb;
  obstacles?: readonly Aabb[];
}

export interface Exterior {
  bounds?: Aabb;
  obstacles?: readonly Aabb[];
}

export interface InteriorsConfig {
  exterior?: Exterior;
  interiors?: readonly Interior[];
  radius?: number;
}

export interface Interiors {
  move(location: EntityLocation, delta: Vec2): EntityLocation;
  enter(location: EntityLocation, id: string): EntityLocation | null;
  leave(location: EntityLocation): EntityLocation | null;
  toInterior(id: string, exterior: Vec2): Vec2 | null;
  toExterior(id: string, interior: Vec2): Vec2 | null;
}

function rotate(point: Vec2, angle: number): Vec2 {
  if (angle === 0) return point;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
}

function toInteriorFrame(interior: Interior, exterior: Vec2): Vec2 {
  const local: Vec2 = [exterior[0] - interior.origin[0], exterior[1] - interior.origin[1]];
  return rotate(local, -(interior.rotation ?? 0));
}

function toExteriorFrame(interior: Interior, local: Vec2): Vec2 {
  const rotated = rotate(local, interior.rotation ?? 0);
  return [rotated[0] + interior.origin[0], rotated[1] + interior.origin[1]];
}

export function createInteriors(config: InteriorsConfig = {}): Interiors {
  const radius = config.radius ?? 0;
  const exterior = config.exterior ?? {};
  const byId = new Map<string, Interior>();
  for (const interior of config.interiors ?? []) byId.set(interior.id, interior);

  return {
    move(location, delta) {
      if (location.space.kind === "exterior") {
        const position = resolveMove(location.position, delta, exterior.obstacles ?? [], {
          bounds: exterior.bounds,
          radius,
        });
        return { space: { kind: "exterior" }, position };
      }
      const interior = byId.get(location.space.id);
      if (interior === undefined) return location;
      const position = resolveMove(location.position, delta, interior.obstacles ?? [], {
        bounds: interior.bounds,
        radius,
      });
      return { space: { kind: "interior", id: interior.id }, position };
    },
    enter(location, id) {
      if (location.space.kind !== "exterior") return null;
      const interior = byId.get(id);
      if (interior === undefined) return null;
      return { space: { kind: "interior", id }, position: toInteriorFrame(interior, location.position) };
    },
    leave(location) {
      if (location.space.kind !== "interior") return null;
      const interior = byId.get(location.space.id);
      if (interior === undefined) return null;
      return { space: { kind: "exterior" }, position: toExteriorFrame(interior, location.position) };
    },
    toInterior(id, exterior) {
      const interior = byId.get(id);
      return interior === undefined ? null : toInteriorFrame(interior, exterior);
    },
    toExterior(id, interior) {
      const frame = byId.get(id);
      return frame === undefined ? null : toExteriorFrame(frame, interior);
    },
  };
}
