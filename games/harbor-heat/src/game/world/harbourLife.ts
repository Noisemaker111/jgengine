import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { editorLayers } from "../../editorLayers";

/** Level of the bay's surface the hulls float on: the ocean's `level`, plus the draught the models carry. */
const WATER_LEVEL = -0.4;

/** One straight leg of a circuit and the distance run when it begins. */
interface Leg {
  from: readonly [number, number];
  to: readonly [number, number];
  start: number;
  length: number;
}

/** One authored `boat_route` or `air_route` path as a closed circuit a vessel runs at its own speed. */
interface Circuit {
  id: string;
  vessel: string;
  speed: number;
  /** Metres above the route's ground (air routes) or the water (boat routes). */
  altitude: number;
  legs: readonly Leg[];
  /** The whole loop's length, metres. */
  total: number;
}

function circuitOf(path: { id: string; points: readonly { x: number; z: number }[]; meta?: Record<string, unknown> }): Circuit | null {
  const meta = path.meta ?? {};
  const vessel = meta["vessel"];
  const speed = meta["speed"];
  if (typeof vessel !== "string" || typeof speed !== "number" || path.points.length < 3) return null;
  const legs: Leg[] = [];
  let total = 0;
  path.points.forEach((point, index) => {
    const next = path.points[(index + 1) % path.points.length] ?? point;
    const length = Math.hypot(next.x - point.x, next.z - point.z);
    legs.push({ from: [point.x, point.z], to: [next.x, next.z], start: total, length });
    total += length;
  });
  const altitude = typeof meta["altitude"] === "number" ? meta["altitude"] : 0;
  return { id: path.id, vessel, speed, altitude, legs, total };
}

/** Every ambient circuit the scene document authors: boats in the bay, a helicopter over the city. */
export const CIRCUITS: readonly Circuit[] = editorLayers.paths
  .filter((path) => path.kind === "boat_route" || path.kind === "air_route")
  .map(circuitOf)
  .filter((circuit): circuit is Circuit => circuit !== null);

/** Where a vessel is after running `distance` metres of a circuit, and the heading it holds there. */
export function circuitPose(circuit: Circuit, distance: number): { x: number; z: number; heading: number } {
  const along = ((distance % circuit.total) + circuit.total) % circuit.total;
  const leg = circuit.legs.find((candidate) => along < candidate.start + candidate.length) ?? circuit.legs[circuit.legs.length - 1];
  if (leg === undefined) return { x: 0, z: 0, heading: 0 };
  const t = leg.length <= 0 ? 0 : (along - leg.start) / leg.length;
  const [ax, az] = leg.from;
  const [bx, bz] = leg.to;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
}

const lifeStore = perContext(() => ({ ids: new Map<string, string>(), run: new Map<string, number>() }));

function poseOf(ctx: GameContext, circuit: Circuit, distance: number): { position: [number, number, number]; rotationY: number } {
  const { x, z, heading } = circuitPose(circuit, distance);
  const base = circuit.id.startsWith("air") ? ctx.world.groundHeightAt(x, z) : WATER_LEVEL;
  return { position: [x, base + circuit.altitude, z], rotationY: heading };
}

/** Put every authored vessel on its circuit, each starting at its own spot so no two sail in step. */
export function setupHarbourLife(ctx: GameContext): void {
  const life = lifeStore(ctx);
  CIRCUITS.forEach((circuit, index) => {
    const distance = ((index * 0.37) % 1) * circuit.total;
    life.run.set(circuit.id, distance);
    life.ids.set(circuit.id, ctx.scene.entity.spawn(circuit.vessel, { id: `ambient_${circuit.id}`, ...poseOf(ctx, circuit, distance), role: "prop" }));
  });
}

/** Run the boats and the helicopter along their circuits. */
export function tickHarbourLife(ctx: GameContext, dt: number): void {
  const life = lifeStore(ctx);
  for (const circuit of CIRCUITS) {
    const id = life.ids.get(circuit.id);
    if (id === undefined) continue;
    const distance = (life.run.get(circuit.id) ?? 0) + circuit.speed * dt;
    life.run.set(circuit.id, distance);
    ctx.scene.entity.setPose(id, poseOf(ctx, circuit, distance));
  }
}
