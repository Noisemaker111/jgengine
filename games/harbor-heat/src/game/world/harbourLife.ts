import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { editorLayers } from "../../editorLayers";

/** Level of the bay's surface the hulls float on: the ocean's `level`, plus the draught the models carry. */
const WATER_LEVEL = -0.4;

type Vec2 = readonly [number, number];

/** One authored `boat_route` or `air_route` path as a closed circuit a vessel runs at its own speed. */
interface Circuit {
  id: string;
  vessel: string;
  speed: number;
  /** Metres above the route's ground (air routes) or the water (boat routes). */
  altitude: number;
  points: readonly Vec2[];
  /** Cumulative length at each point, last entry the whole loop. */
  lengths: readonly number[];
}

function circuitOf(path: { id: string; points: readonly { x: number; z: number }[]; meta?: Record<string, unknown> }): Circuit | null {
  const meta = path.meta ?? {};
  const vessel = meta["vessel"];
  const speed = meta["speed"];
  if (typeof vessel !== "string" || typeof speed !== "number" || path.points.length < 3) return null;
  const points = path.points.map((point): Vec2 => [point.x, point.z]);
  const lengths = [0];
  for (let i = 0; i < points.length; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    lengths.push(lengths[i]! + Math.hypot(bx - ax, bz - az));
  }
  const altitude = typeof meta["altitude"] === "number" ? meta["altitude"] : 0;
  return { id: path.id, vessel, speed, altitude, points, lengths };
}

/** Every ambient circuit the scene document authors: boats in the bay, a helicopter over the city. */
export const CIRCUITS: readonly Circuit[] = editorLayers.paths
  .filter((path) => path.kind === "boat_route" || path.kind === "air_route")
  .map(circuitOf)
  .filter((circuit): circuit is Circuit => circuit !== null);

/** Where a vessel is after running `distance` metres of a circuit, and the heading it holds there. */
export function circuitPose(circuit: Circuit, distance: number): { x: number; z: number; heading: number } {
  const total = circuit.lengths[circuit.lengths.length - 1]!;
  const along = ((distance % total) + total) % total;
  let leg = 0;
  while (leg < circuit.points.length - 1 && circuit.lengths[leg + 1]! <= along) leg += 1;
  const [ax, az] = circuit.points[leg]!;
  const [bx, bz] = circuit.points[(leg + 1) % circuit.points.length]!;
  const span = circuit.lengths[leg + 1]! - circuit.lengths[leg]!;
  const t = span <= 0 ? 0 : (along - circuit.lengths[leg]!) / span;
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
    const total = circuit.lengths[circuit.lengths.length - 1]!;
    const distance = ((index * 0.37) % 1) * total;
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
