/**
 * Procedural diorama props.
 *
 * Each map prop (car, furniture, server rows, etc.) is composed from primitives
 * in the Style Bible palette — no external GLB fetches. MapDecor routes a decor
 * item's modelKey here instead of loading a (missing) GLB, so every prop reads
 * as the same toy-model lab.
 *
 * Props are authored in local space, base at Y=0, facing +Z (North). MapDecor
 * applies the decor position/rotation/scale around the chosen component.
 */

import type { ComponentType, ReactNode } from "react";
import { getMaterialPreset, MATERIAL_PRESET, type MaterialPreset } from "@/world/diorama/palette";

/** Shared toy-scale geometry reused across procedural props. */
const PROP_TRIM = 0.12;
const PROP_THIN = 0.05;
const PROP_PANEL = 0.04;
const PROP_SHALLOW = 0.08;
const PROP_FOOT_H = 0.18;
const PROP_LAMP_W = 0.3;
const PROP_LAMP_TAIL_H = 0.16;
const PROP_WHEEL_R = 0.34;
const PROP_WHEEL_W = 0.22;
const PROP_DEPTH_M = 0.9;
const PROP_DEPTH_L = 1.9;
const PROP_HALF_W = 0.45;
const PROP_LAMP_SIDE_X = 0.6;
const PROP_WHEEL_SIDE_X = 0.95;
const CAR_BODY_W = 1.8;
const CAR_BODY_L = 4.2;
const CAR_BODY_RAISE = 0.55;
const CAR_CABIN_W = 1.6;
const CAR_CABIN_H = 0.55;
const CAR_CABIN_L = 2.0;
const CAR_GLASS_W = 1.4;
const CAR_GLASS_H = 0.4;
const CAR_GLASS_L = 1.8;
const CAR_FRONT_Z = 2.1;
const CAR_REAR_Z = -2.1;
const CAR_WHEEL_Z = 1.4;
const BENCH_TOP_H = 0.9;
const BENCH_LEG_H = 0.9;
const BENCH_BACK_Z = -0.45;
const BENCH_LEG_X = 0.85;
const BENCH_LEG_Z = 0.35;
const PROP_MEDIUM = 0.6;
const BOOKSHELF_HEIGHT = 2.0;
const BOOK_SPINE_W = 0.1;
const BOOK_SPINE_H = 0.28;
const BOOKSHELF_CENTER_Y = 1.0;
const BOOK_ROW_START_X = -0.35;
const BOOK_ROW_SPACING = 0.13;
interface PropProps {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function Mat({ preset }: { preset: MaterialPreset }) {
  const p = getMaterialPreset(preset);
  return (
    <meshStandardMaterial
      color={p.color}
      roughness={p.roughness}
      metalness={p.metalness}
      emissive={p.emissive}
      emissiveIntensity={p.emissiveIntensity}
      transparent={p.transparent}
      opacity={p.opacity}
    />
  );
}

interface BoxProps {
  args: [number, number, number];
  position?: [number, number, number];
  preset: MaterialPreset;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function Box({ args, position = [0, 0, 0], preset, castShadow = true, receiveShadow = true }: BoxProps) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={args} />
      <Mat preset={preset} />
    </mesh>
  );
}

interface CylProps {
  args: [number, number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  preset: MaterialPreset;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function Cyl({ args, position = [0, 0, 0], rotation, preset, castShadow = true, receiveShadow = true }: CylProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow={receiveShadow}>
      <cylinderGeometry args={args} />
      <Mat preset={preset} />
    </mesh>
  );
}

/** garage_car — scrappy compact hatchback, cream body + teal accent, ~1.8 x 4.2 m. */
function GarageCar({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  const wheelArgs: [number, number, number, number] = [PROP_WHEEL_R, PROP_WHEEL_R, PROP_WHEEL_W, 16];
  const lampArgs: [number, number, number] = [PROP_LAMP_W, PROP_FOOT_H, PROP_SHALLOW];
  const tailLampArgs: [number, number, number] = [PROP_LAMP_W, PROP_LAMP_TAIL_H, PROP_SHALLOW];
  return (
    <group>
      <Box args={[CAR_BODY_W, 0.5, CAR_BODY_L]} position={[0, CAR_BODY_RAISE, 0]} preset={MATERIAL_PRESET.painted} {...s} />
      <Box args={[CAR_CABIN_W, CAR_CABIN_H, CAR_CABIN_L]} position={[0, 1.05, -0.1]} preset={MATERIAL_PRESET.painted} {...s} />
      {/* windows */}
      <Box args={[CAR_GLASS_W, CAR_GLASS_H, CAR_GLASS_L]} position={[0, 1.1, -0.1]} preset={MATERIAL_PRESET.glass} {...s} />
      {/* teal accent stripe */}
      <Box args={[1.82, PROP_TRIM, 4.22]} position={[0, 0.5, 0]} preset={MATERIAL_PRESET.accentTeal} castShadow={false} receiveShadow={false} />
      {/* headlights (front = +Z) */}
      <Box args={lampArgs} position={[-PROP_LAMP_SIDE_X, PROP_LAMP_SIDE_X, CAR_FRONT_Z]} preset={MATERIAL_PRESET.emissiveWarm} {...s} />
      <Box args={lampArgs} position={[PROP_LAMP_SIDE_X, PROP_LAMP_SIDE_X, CAR_FRONT_Z]} preset={MATERIAL_PRESET.emissiveWarm} {...s} />
      {/* taillights */}
      <Box args={tailLampArgs} position={[-PROP_LAMP_SIDE_X, PROP_LAMP_SIDE_X, CAR_REAR_Z]} preset={MATERIAL_PRESET.accentCoral} {...s} />
      <Box args={tailLampArgs} position={[PROP_LAMP_SIDE_X, PROP_LAMP_SIDE_X, CAR_REAR_Z]} preset={MATERIAL_PRESET.accentCoral} {...s} />
      {/* wheels */}
      <Cyl args={wheelArgs} position={[-PROP_WHEEL_SIDE_X, PROP_WHEEL_R, CAR_WHEEL_Z]} rotation={[0, 0, Math.PI / 2]} preset={MATERIAL_PRESET.metalDark} {...s} />
      <Cyl args={wheelArgs} position={[PROP_WHEEL_SIDE_X, PROP_WHEEL_R, CAR_WHEEL_Z]} rotation={[0, 0, Math.PI / 2]} preset={MATERIAL_PRESET.metalDark} {...s} />
      <Cyl args={wheelArgs} position={[-PROP_WHEEL_SIDE_X, PROP_WHEEL_R, -CAR_WHEEL_Z]} rotation={[0, 0, Math.PI / 2]} preset={MATERIAL_PRESET.metalDark} {...s} />
      <Cyl args={wheelArgs} position={[PROP_WHEEL_SIDE_X, PROP_WHEEL_R, -CAR_WHEEL_Z]} rotation={[0, 0, Math.PI / 2]} preset={MATERIAL_PRESET.metalDark} {...s} />
    </group>
  );
}

/** garage_workbench — wood top, pegboard back, shelf, 2 x 1 m. */
function GarageWorkbench({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  const legArgs: [number, number, number] = [PROP_SHALLOW, BENCH_LEG_H, PROP_SHALLOW];
  const hookArgs: [number, number, number] = [PROP_THIN, PROP_TRIM, PROP_THIN];
  return (
    <group>
      <Box args={[PROP_DEPTH_L, PROP_SHALLOW, PROP_DEPTH_M]} position={[0, BENCH_TOP_H, 0]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_DEPTH_L, PROP_MEDIUM, PROP_THIN]} position={[0, 1.2, BENCH_BACK_Z]} preset={MATERIAL_PRESET.painted} {...s} />
      <Box args={[PROP_DEPTH_L, PROP_PANEL, 0.8]} position={[0, PROP_HALF_W, 0]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={legArgs} position={[-BENCH_LEG_X, PROP_HALF_W, BENCH_LEG_Z]} preset={MATERIAL_PRESET.metalDark} {...s} />
      <Box args={legArgs} position={[BENCH_LEG_X, PROP_HALF_W, BENCH_LEG_Z]} preset={MATERIAL_PRESET.metalDark} {...s} />
      <Box args={legArgs} position={[-BENCH_LEG_X, PROP_HALF_W, -BENCH_LEG_Z]} preset={MATERIAL_PRESET.metalDark} {...s} />
      <Box args={legArgs} position={[BENCH_LEG_X, PROP_HALF_W, -BENCH_LEG_Z]} preset={MATERIAL_PRESET.metalDark} {...s} />
      {/* pegboard hooks */}
      <Box args={hookArgs} position={[-0.5, 1.0, -0.42]} preset={MATERIAL_PRESET.metal} {...s} />
      <Box args={hookArgs} position={[PROP_LAMP_W, 1.0, -0.42]} preset={MATERIAL_PRESET.accentAmber} {...s} />
    </group>
  );
}

/** garage_bookshelf — frame + shelves + colored book spines, 1 x 1 x 2 m. */
function GarageBookshelf({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  const spines: MaterialPreset[] = [
    MATERIAL_PRESET.accentTeal,
    MATERIAL_PRESET.accentCoral,
    MATERIAL_PRESET.accentAmber,
    MATERIAL_PRESET.wood,
    MATERIAL_PRESET.painted,
  ];
  const shelfHeights = [BENCH_LEG_Z, 0.85, 1.35, CAR_BODY_W] as const;
  return (
    <group>
      <Box args={[PROP_DEPTH_M, BOOKSHELF_HEIGHT, PROP_THIN]} position={[0, BOOKSHELF_CENTER_Y, BENCH_BACK_Z]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_THIN, BOOKSHELF_HEIGHT, PROP_DEPTH_M]} position={[-PROP_HALF_W, BOOKSHELF_CENTER_Y, 0]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_THIN, BOOKSHELF_HEIGHT, PROP_DEPTH_M]} position={[PROP_HALF_W, BOOKSHELF_CENTER_Y, 0]} preset={MATERIAL_PRESET.wood} {...s} />
      {shelfHeights.map((y, i) => (
        <Box key={i} args={[PROP_DEPTH_M, PROP_PANEL, PROP_DEPTH_M]} position={[0, y, 0]} preset={MATERIAL_PRESET.wood} {...s} />
      ))}
      {shelfHeights.map((y, shelf) =>
        Array.from({ length: 6 }, (_, i) => (
          <Box
            key={`${shelf}-${i}`}
            args={[BOOK_SPINE_W, BOOK_SPINE_H, PROP_MEDIUM]}
            position={[BOOK_ROW_START_X + i * BOOK_ROW_SPACING, y + PROP_FOOT_H, 0]}
            preset={spines[(i + shelf) % spines.length]}
            {...s}
          />
        )),
      )}
    </group>
  );
}

/** house_worktable — walnut top + sturdy legs, 3.2 x 2.2 m. */
function HouseWorktable({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  return (
    <group>
      <Box args={[3.0, 0.1, 2.0]} position={[0, 0.75, 0]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_TRIM, 0.75, PROP_TRIM]} position={[-CAR_GLASS_W, 0.375, BENCH_LEG_X]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_TRIM, 0.75, PROP_TRIM]} position={[CAR_GLASS_W, 0.375, BENCH_LEG_X]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_TRIM, 0.75, PROP_TRIM]} position={[-CAR_GLASS_W, 0.375, -BENCH_LEG_X]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_TRIM, 0.75, PROP_TRIM]} position={[CAR_GLASS_W, 0.375, -BENCH_LEG_X]} preset={MATERIAL_PRESET.wood} {...s} />
      {/* brass accent trim */}
      <Box args={[3.02, 0.03, 2.02]} position={[0, 0.81, 0]} preset={MATERIAL_PRESET.accentAmber} castShadow={false} receiveShadow={false} />
    </group>
  );
}

/** house_couch — upholstered two-seat, wood feet, 2.2 x 1 m. */
function HouseCouch({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  return (
    <group>
      <Box args={[2.0, BENCH_LEG_Z, PROP_DEPTH_M]} position={[0, BENCH_LEG_Z, 0]} preset={MATERIAL_PRESET.fabric} {...s} />
      <Box args={[2.0, 0.5, 0.2]} position={[0, 0.65, BENCH_BACK_Z]} preset={MATERIAL_PRESET.fabric} {...s} />
      <Box args={[0.2, PROP_HALF_W, PROP_DEPTH_M]} position={[-1.0, 0.5, 0]} preset={MATERIAL_PRESET.fabric} {...s} />
      <Box args={[0.2, PROP_HALF_W, PROP_DEPTH_M]} position={[1.0, 0.5, 0]} preset={MATERIAL_PRESET.fabric} {...s} />
      <Box args={[PROP_MEDIUM, PROP_TRIM, 0.7]} position={[-0.5, PROP_MEDIUM, PROP_THIN]} preset={MATERIAL_PRESET.fabric} {...s} />
      <Box args={[PROP_MEDIUM, PROP_TRIM, 0.7]} position={[0.5, PROP_MEDIUM, PROP_THIN]} preset={MATERIAL_PRESET.fabric} {...s} />
      {/* wood feet */}
      <Box args={[PROP_TRIM, PROP_FOOT_H, PROP_TRIM]} position={[-0.9, 0.09, BENCH_LEG_Z]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_TRIM, PROP_FOOT_H, PROP_TRIM]} position={[0.9, 0.09, BENCH_LEG_Z]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_TRIM, PROP_FOOT_H, PROP_TRIM]} position={[-0.9, 0.09, -BENCH_LEG_Z]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[PROP_TRIM, PROP_FOOT_H, PROP_TRIM]} position={[0.9, 0.09, -BENCH_LEG_Z]} preset={MATERIAL_PRESET.wood} {...s} />
    </group>
  );
}

/** house_tall_storage — cabinet + doors + brass handles, 1.5 x 0.67 x 1.83 m. */
function HouseTallStorage({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  return (
    <group>
      <Box args={[CAR_GLASS_W, 1.7, PROP_MEDIUM]} position={[0, 0.95, 0]} preset={MATERIAL_PRESET.wood} {...s} />
      <Box args={[0.68, 1.6, PROP_PANEL]} position={[-0.36, 0.95, 0.31]} preset={MATERIAL_PRESET.woodLight} {...s} />
      <Box args={[0.68, 1.6, PROP_PANEL]} position={[0.36, 0.95, 0.31]} preset={MATERIAL_PRESET.woodLight} {...s} />
      <Box args={[PROP_PANEL, 0.25, PROP_THIN]} position={[-PROP_THIN, 0.95, PROP_WHEEL_R]} preset={MATERIAL_PRESET.accentAmber} {...s} />
      <Box args={[PROP_PANEL, 0.25, PROP_THIN]} position={[PROP_THIN, 0.95, PROP_WHEEL_R]} preset={MATERIAL_PRESET.accentAmber} {...s} />
      <Box args={[1.5, 0.06, 0.67]} position={[0, 0.03, 0]} preset={MATERIAL_PRESET.wood} {...s} />
    </group>
  );
}

/** datacenter_server_row — long enterprise cabinet aisle, 1.83 x 2 x 8.33 m. */
function DatacenterServerRow({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  const panels = 7;
  return (
    <group>
      <Box args={[1.7, 2.0, 8.2]} position={[0, 1.0, 0]} preset={MATERIAL_PRESET.metalDark} {...s} />
      {/* front face panels (front = +X so the row reads along Z) */}
      {Array.from({ length: panels }, (_, i) => (
        <group key={i}>
          <Box args={[PROP_PANEL, 1.7, 1.0]} position={[0.86, 1.0, -3.5 + i * 1.17]} preset={MATERIAL_PRESET.metal} castShadow={false} receiveShadow={false} />
          <Box args={[PROP_PANEL, PROP_SHALLOW, PROP_DEPTH_M]} position={[0.87, 1.7, -3.5 + i * 1.17]} preset={MATERIAL_PRESET.emissiveCool} castShadow={false} receiveShadow={false} />
          <Box args={[0.03, 0.03, 0.03]} position={[0.88, 1.5, -3.9 + i * 1.17]} preset={MATERIAL_PRESET.emissiveWarm} castShadow={false} receiveShadow={false} />
          <Box args={[0.03, 0.03, 0.03]} position={[0.88, 1.5, -3.1 + i * 1.17]} preset={MATERIAL_PRESET.emissiveCool} castShadow={false} receiveShadow={false} />
        </group>
      ))}
    </group>
  );
}

/** datacenter_loading_platform — low steel deck, 8.33 x 0.17 x 1.67 m. */
function DatacenterLoadingPlatform({ castShadow, receiveShadow }: PropProps) {
  const s = { castShadow, receiveShadow };
  return (
    <group>
      <Box args={[8.2, PROP_LAMP_TAIL_H, 1.55]} position={[0, PROP_SHALLOW, 0]} preset={MATERIAL_PRESET.metalDark} {...s} />
      <Box args={[8.22, PROP_PANEL, 1.57]} position={[0, 0.17, 0]} preset={MATERIAL_PRESET.accentTeal} castShadow={false} receiveShadow={false} />
      {[-3, -1, 1, 3].map((x) => (
        <Box key={x} args={[0.1, PROP_FOOT_H, 0.1]} position={[x, 0.09, 0.7]} preset={MATERIAL_PRESET.metal} {...s} />
      ))}
    </group>
  );
}

const PROP_REGISTRY: Record<string, ComponentType<PropProps>> = {
  garage_car: GarageCar,
  garage_workbench: GarageWorkbench,
  garage_bookshelf: GarageBookshelf,
  house_worktable: HouseWorktable,
  house_couch: HouseCouch,
  house_tall_storage: HouseTallStorage,
  datacenter_server_row: DatacenterServerRow,
  datacenter_loading_platform: DatacenterLoadingPlatform,
};

export function getProceduralProp(modelKey: string): ComponentType<PropProps> | null {
  return PROP_REGISTRY[modelKey] ?? null;
}

export interface ProceduralPropProps {
  modelKey: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  children?: ReactNode;
}

export function ProceduralProp({
  modelKey,
  position,
  rotation,
  scale,
  castShadow = true,
  receiveShadow = true,
}: ProceduralPropProps) {
  const Comp = getProceduralProp(modelKey);
  if (!Comp) return null;
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <Comp castShadow={castShadow} receiveShadow={receiveShadow} />
    </group>
  );
}
