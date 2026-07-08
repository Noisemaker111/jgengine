export type BlockMaterial = "wood" | "stone";

export interface MaterialProfile {
  mass: number;
  breakImpulse: number;
  restitution: number;
  color: readonly [number, number, number];
}

export const MATERIALS: Readonly<Record<BlockMaterial, MaterialProfile>> = {
  wood: { mass: 1, breakImpulse: 7, restitution: 0.18, color: [0.56, 0.38, 0.21] },
  stone: { mass: 2.6, breakImpulse: 16, restitution: 0.08, color: [0.55, 0.55, 0.58] },
};

export const DUMMY_BREAK_IMPULSE = 6;
export const DUMMY_COLOR: readonly [number, number, number] = [0.78, 0.2, 0.14];
export const PROJECTILE_COLOR: readonly [number, number, number] = [0.16, 0.16, 0.18];
export const GROUND_COLOR: readonly [number, number, number] = [0.28, 0.24, 0.16];

export function resolveBlockImpact(material: BlockMaterial, impulse: number): boolean {
  return impulse >= MATERIALS[material].breakImpulse;
}

export function resolveDummyImpact(impulse: number): boolean {
  return impulse >= DUMMY_BREAK_IMPULSE;
}
