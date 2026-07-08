import type { PadEnvironmentDescriptor, PadSize } from "@jgengine/core/world/features";

export const PAD_THICKNESS = 0.1;

export type PadShape = { circular: true; radius: number } | { circular: false; width: number; depth: number };

export function resolvePadShape(size: PadSize): PadShape {
  return "radius" in size ? { circular: true, radius: size.radius } : { circular: false, width: size[0], depth: size[1] };
}

export function resolvePadSurfaceY(groundHeight: number, pad: Pick<PadEnvironmentDescriptor, "height">): number {
  return groundHeight + pad.height;
}

export function resolvePadMeshY(groundHeight: number, pad: Pick<PadEnvironmentDescriptor, "height">): number {
  return resolvePadSurfaceY(groundHeight, pad) - PAD_THICKNESS / 2;
}
