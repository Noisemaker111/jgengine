import * as THREE from "three";

import type { BuildingKit, BuildingKitFit, BuildingKitPart } from "@jgengine/core/world/buildingKit";
import { resolveBuildingKitPart } from "@jgengine/core/world/buildingKit";

import type {
  BuildingFacade,
  BuildingPartKind,
  BuildingPartPlacement,
  InstancedBuildingPlacement,
} from "./GeneratedBuilding";

/**
 * One kit-bound part resolved to the world slot the fallback box would have filled, carrying the
 * binding that replaces it. `slotScale` is the slot box in world units; `yaw` already includes the
 * whole-building rotation.
 * @internal
 */
export interface BuildingKitInstance {
  position: readonly [number, number, number];
  yaw: number;
  slotScale: readonly [number, number, number];
  part: BuildingKitPart;
  fit: BuildingKitFit;
}

/** A kit model's native extents, measured once per URL from the harvested root. @internal */
export interface BuildingKitModelBounds {
  size: readonly [number, number, number];
  center: readonly [number, number, number];
}

/** Box-path matrices per part kind plus kit-bound instances per resolved model URL. @internal */
export interface BuildingPartBuckets {
  boxes: Map<BuildingPartKind, THREE.Matrix4[]>;
  models: Map<string, BuildingKitInstance[]>;
}

const CLOTHESLINE_ROW_OFFSETS = [-0.09, 0.09] as const;

/** Outward XZ normal of a facade; `roof` has none. @internal */
export function normalFor(facade: BuildingFacade): readonly [number, number] {
  if (facade === "front") return [0, 1];
  if (facade === "back") return [0, -1];
  if (facade === "left") return [-1, 0];
  if (facade === "right") return [1, 0];
  return [0, 0];
}

/** How far a part sits proud of its facade, so decor never z-fights the wall behind it. @internal */
export function outwardOffset(part: BuildingPartPlacement): number {
  if (part.kind === "wall" || part.kind === "roof" || part.kind === "corner") return 0;
  if (part.kind === "window" || part.kind === "shutter" || part.kind === "storefront") return 0.025;
  if (part.kind === "awning" || part.kind === "storeSign") return 0.09;
  return 0.12;
}

/**
 * Splits every placed part into the two render paths: parts a kit binds to a model land in a bucket
 * keyed by their resolved URL, everything else keeps today's per-kind box matrices. With no kit every
 * part resolves to `box`, so the box path is untouched.
 * @internal
 */
export function bucketBuildingParts(
  buildings: readonly InstancedBuildingPlacement[],
  visible: ReadonlySet<BuildingPartKind> | null,
  kit?: BuildingKit,
  resolveModelUrl?: (model: string) => string,
): BuildingPartBuckets {
  const dummy = new THREE.Object3D();
  const boxes = new Map<BuildingPartKind, THREE.Matrix4[]>();
  const models = new Map<string, BuildingKitInstance[]>();
  for (const placement of buildings) {
    const [ox, oy, oz] = placement.position ?? [0, 0, 0];
    // Building yaw turns the whole massing about its center. Engine Y-rotation convention (matches
    // dummy.rotation.y below): a local vector (x, z) maps to (x·cos + z·sin, −x·sin + z·cos).
    const yaw = placement.rotationY ?? 0;
    const [px0, pz0] = placement.pivot ?? [0, 0];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (const part of placement.building.parts) {
      if (visible !== null && !visible.has(part.kind)) continue;
      const binding = resolveBuildingKitPart(kit, part.kind, part.kit);
      if (binding.type === "omit") continue;
      const [nx, nz] = normalFor(part.facade);
      const offset = outwardOffset(part);
      // Local offset from the pivot (part position + facade-normal nudge), then rotated by the yaw.
      const lx = part.position[0] - px0 + nx * offset;
      const lz = part.position[2] - pz0 + nz * offset;
      const px = ox + px0 + lx * cos + lz * sin;
      const py = oy + part.position[1];
      const pz = oz + pz0 - lx * sin + lz * cos;
      const partYaw = part.rotationY + yaw;
      if (binding.type === "model") {
        const url = resolveModelUrl?.(binding.part.model) ?? binding.part.model;
        const instance: BuildingKitInstance = {
          position: [px, py, pz],
          yaw: partYaw,
          slotScale: part.scale,
          part: binding.part,
          fit: binding.fit,
        };
        const bucket = models.get(url);
        if (bucket === undefined) models.set(url, [instance]);
        else bucket.push(instance);
        continue;
      }
      let bucket = boxes.get(part.kind);
      if (bucket === undefined) {
        bucket = [];
        boxes.set(part.kind, bucket);
      }
      if (part.kind === "clothesline") {
        const rowSin = Math.sin(partYaw);
        const rowCos = Math.cos(partYaw);
        for (const row of CLOTHESLINE_ROW_OFFSETS) {
          dummy.position.set(px + row * rowSin, py, pz + row * rowCos);
          dummy.rotation.set(0, partYaw, 0);
          dummy.scale.set(part.scale[0], Math.max(part.scale[1], 0.025), 0.025);
          dummy.updateMatrix();
          bucket.push(dummy.matrix.clone());
        }
        continue;
      }
      dummy.position.set(px, py, pz);
      dummy.rotation.set(0, partYaw, 0);
      dummy.scale.set(part.scale[0], part.scale[1], part.scale[2]);
      dummy.updateMatrix();
      bucket.push(dummy.matrix.clone());
    }
  }
  return { boxes, models };
}

function ratio(slot: number, native: number): number {
  if (!Number.isFinite(slot) || !Number.isFinite(native) || Math.abs(native) < 1e-6) return 1;
  return slot / native;
}

/**
 * Maps a model's native extents onto the slot box per {@link BuildingKitFit}. Degenerate or
 * non-finite native extents fall back to a ratio of 1 on that axis rather than blowing the model up.
 * @internal
 */
export function buildingKitFitScale(
  fit: BuildingKitFit,
  slotScale: readonly [number, number, number],
  nativeSize: readonly [number, number, number],
): [number, number, number] {
  if (fit === "native") return [1, 1, 1];
  const rx = ratio(slotScale[0], nativeSize[0]);
  const ry = ratio(slotScale[1], nativeSize[1]);
  const rz = ratio(slotScale[2], nativeSize[2]);
  if (fit === "stretch") return [rx, ry, rz];
  const uniform = fit === "cover" ? Math.max(rx, ry, rz) : Math.min(rx, ry, rz);
  return [uniform, uniform, uniform];
}

/** Measures the harvested model root once so every instance of that URL shares one fit basis. @internal */
export function measureBuildingKitModel(root: THREE.Object3D): BuildingKitModelBounds {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return { size: [0, 0, 0], center: [0, 0, 0] };
  return {
    size: [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z],
    center: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2],
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const scratchScale = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchCenter = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchYaw = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();

/**
 * Composes one kit instance's world matrix: fit scale times the binding's `scale`, the binding's
 * Euler XYZ rotation on top of the slot's facade yaw, the binding's slot-local `offset` rotated into
 * world space by that total yaw, and a recentre so the model's bounds center lands on the slot center.
 * @internal
 */
export function composeBuildingKitMatrix(
  instance: BuildingKitInstance,
  bounds: BuildingKitModelBounds,
  target: THREE.Matrix4 = new THREE.Matrix4(),
): THREE.Matrix4 {
  const fit = buildingKitFitScale(instance.fit, instance.slotScale, bounds.size);
  const mul = instance.part.scale ?? [1, 1, 1];
  scratchScale.set(fit[0] * mul[0], fit[1] * mul[1], fit[2] * mul[2]);
  const rotation = instance.part.rotation;
  scratchEuler.set(rotation?.[0] ?? 0, rotation?.[1] ?? 0, rotation?.[2] ?? 0, "XYZ");
  scratchQuat.setFromEuler(scratchEuler);
  scratchQuat.premultiply(scratchYaw.setFromAxisAngle(UP, instance.yaw));
  const offset = instance.part.offset ?? [0, 0, 0];
  const totalYaw = instance.yaw + (rotation?.[1] ?? 0);
  const cos = Math.cos(totalYaw);
  const sin = Math.sin(totalYaw);
  scratchCenter
    .set(bounds.center[0] * scratchScale.x, bounds.center[1] * scratchScale.y, bounds.center[2] * scratchScale.z)
    .applyQuaternion(scratchQuat);
  scratchPosition.set(
    instance.position[0] + offset[0] * cos + offset[2] * sin - scratchCenter.x,
    instance.position[1] + offset[1] - scratchCenter.y,
    instance.position[2] - offset[0] * sin + offset[2] * cos - scratchCenter.z,
  );
  return target.compose(scratchPosition, scratchQuat, scratchScale);
}
