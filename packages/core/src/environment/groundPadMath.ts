import type { PadEnvironmentDescriptor, PadSize } from "@jgengine/core/world/features";

/** Thickness in metres of a ground pad slab. */
export const PAD_THICKNESS = 0.1;

/** A pad's resolved footprint: a circle with a radius, or a width by depth rectangle. */
export type PadShape = { circular: true; radius: number } | { circular: false; width: number; depth: number };

/** @internal */
export function resolvePadShape(size: PadSize): PadShape {
  return "radius" in size ? { circular: true, radius: size.radius } : { circular: false, width: size[0], depth: size[1] };
}

/** @internal */
export function resolvePadSurfaceY(
  groundHeight: number,
  pad: Pick<PadEnvironmentDescriptor, "height" | "elevation">,
): number {
  return pad.elevation ?? groundHeight + pad.height;
}

/** @internal */
export function resolvePadMeshY(
  groundHeight: number,
  pad: Pick<PadEnvironmentDescriptor, "height" | "elevation">,
): number {
  return resolvePadSurfaceY(groundHeight, pad) - PAD_THICKNESS / 2;
}
