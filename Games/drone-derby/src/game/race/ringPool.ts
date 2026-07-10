export interface RingDef {
  id: string;
  x: number;
  z: number;
  altitude: number;
  radius: number;
}

export const RING_POOL: readonly RingDef[] = [
  { id: "r1", x: 0, z: 45, altitude: 4, radius: 4 },
  { id: "r2", x: 30, z: 75, altitude: 6, radius: 4 },
  { id: "r3", x: 65, z: 95, altitude: 9, radius: 3.5 },
  { id: "r4", x: 100, z: 80, altitude: 11, radius: 4 },
  { id: "r5", x: 125, z: 50, altitude: 7, radius: 4 },
  { id: "r6", x: 135, z: 10, altitude: 3, radius: 3 },
  { id: "r7", x: 120, z: -30, altitude: 13, radius: 4 },
  { id: "r8", x: 85, z: -60, altitude: 17, radius: 5 },
  { id: "r9", x: 45, z: -80, altitude: 15, radius: 4 },
  { id: "r10", x: 5, z: -95, altitude: 9, radius: 3.5 },
  { id: "r11", x: -35, z: -85, altitude: 7, radius: 3.5 },
  { id: "r12", x: -70, z: -55, altitude: 11, radius: 4 },
  { id: "r13", x: -95, z: -15, altitude: 16, radius: 5 },
  { id: "r14", x: -90, z: 30, altitude: 8, radius: 4 },
  { id: "r15", x: -60, z: 65, altitude: 5, radius: 4 },
  { id: "r16", x: -25, z: 85, altitude: 4, radius: 4 },
];

export const SPAWN_XZ: readonly [number, number] = [0, 8];

export interface PadDef {
  id: string;
  x: number;
  z: number;
  altitude: number;
  radius: number;
  elevated: boolean;
}

export const CHARGE_PADS: readonly PadDef[] = [
  { id: "pad-a", x: 55, z: 60, altitude: 0.3, radius: 5, elevated: false },
  { id: "pad-b", x: -35, z: -65, altitude: 0.3, radius: 5, elevated: false },
  { id: "pad-c", x: 85, z: -60, altitude: 14, radius: 5, elevated: true },
  { id: "pad-d", x: -95, z: -15, altitude: 15, radius: 5, elevated: true },
];

export interface CraneDef {
  id: string;
  x: number;
  z: number;
  height: number;
  armLength: number;
  armFacing: number;
}

export const CRANES: readonly CraneDef[] = [
  { id: "crane-1", x: 100, z: 60, height: 18, armLength: 22, armFacing: 0 },
  { id: "crane-2", x: -70, z: -35, height: 18, armLength: 22, armFacing: Math.PI },
  { id: "crane-3", x: 150, z: 30, height: 16, armLength: 18, armFacing: Math.PI / 2 },
  { id: "crane-4", x: -150, z: -30, height: 16, armLength: 18, armFacing: -Math.PI / 2 },
  { id: "crane-5", x: 30, z: -140, height: 15, armLength: 16, armFacing: Math.PI },
  { id: "crane-6", x: -30, z: 140, height: 15, armLength: 16, armFacing: 0 },
];
