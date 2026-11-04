import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { resolveDecalObject, type DecalRules, type ResolvedDecal } from "@jgengine/core/world/decalKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import type { TerrainHeightSampler } from "@jgengine/core/terrain/terrainMath.draw";

import { createDecalDrapeGeometry } from "@jgengine/core/scene/decalGeometry.draw";
import { createDecalTexture } from "@jgengine/core/scene/decalTexture";
import { registerSceneKindRenderer } from "./sceneKindRenderers.draw";

/** Tilts at or above this stand the decal up on a wall instead of draping it on the ground. */
const WALL_TILT = 45;
/** Edge in texels of one baked decal. */
const DECAL_TILE = 128;
/** Texels each tile repeats its edge into, so mip levels do not bleed one decal into the next. */
const DECAL_GUTTER = 8;
const DECAL_STRIDE = DECAL_TILE + 2 * DECAL_GUTTER;
/** Tiles per atlas row; a page holds `DECAL_COLUMNS`² decal looks. */
const DECAL_COLUMNS = 8;
const DECAL_PAGE_SLOTS = DECAL_COLUMNS * DECAL_COLUMNS;
/** Edge in metres of the world cell one merged decal draw covers, so an unseen cell still culls whole. */
export const DECAL_CELL = 128;

/** Every decal of a scene as a few draws: one per (atlas page, world cell). @internal */
export interface DecalBatches {
  /** Atlas pages holding every distinct decal look once. */
  pages: THREE.DataTexture[];
  /** Merged world-space decal geometry, one per page and cell. */
  draws: { key: string; page: number; geometry: THREE.BufferGeometry }[];
}

interface DecalLook {
  rules: DecalRules;
  slot: number;
}

function bakePage(looks: readonly DecalLook[]): THREE.DataTexture {
  const columns = Math.min(DECAL_COLUMNS, looks.length);
  const rows = Math.ceil(looks.length / DECAL_COLUMNS);
  const width = columns * DECAL_STRIDE;
  const height = rows * DECAL_STRIDE;
  const data = new Uint8Array(width * height * 4);
  for (const look of looks) {
    const baked = createDecalTexture(look.rules.style, look.rules.seed, DECAL_TILE, { text: look.rules.text, color: look.rules.color });
    const cell = look.slot % DECAL_PAGE_SLOTS;
    const left = (cell % DECAL_COLUMNS) * DECAL_STRIDE;
    const bottom = Math.floor(cell / DECAL_COLUMNS) * DECAL_STRIDE;
    for (let y = 0; y < DECAL_STRIDE; y += 1) {
      const sy = Math.min(DECAL_TILE - 1, Math.max(0, y - DECAL_GUTTER));
      for (let x = 0; x < DECAL_STRIDE; x += 1) {
        const sx = Math.min(DECAL_TILE - 1, Math.max(0, x - DECAL_GUTTER));
        data.set(baked.data.subarray((sy * DECAL_TILE + sx) * 4, (sy * DECAL_TILE + sx) * 4 + 4), ((bottom + y) * width + left + x) * 4);
      }
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** One decal's geometry in world space, its UVs moved onto its atlas tile and its opacity in the vertex alpha. */
function decalGeometry(resolved: ResolvedDecal, heightAt: TerrainHeightSampler, slot: number, pageLooks: number): { geometry: THREE.BufferGeometry; cell: string } {
  const { rules } = resolved;
  const [px, py, pz] = resolved.position;
  let geometry: THREE.BufferGeometry;
  if (rules.tilt >= WALL_TILT) {
    // A standing decal is pushed out along its own normal so it clears the wall it describes.
    geometry = new THREE.PlaneGeometry(rules.size, rules.size);
    const normalX = Math.sin(resolved.rotationY);
    const normalZ = Math.cos(resolved.rotationY);
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(px + normalX * rules.offset, py + rules.lift, pz + normalZ * rules.offset),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rules.tilt - 90), resolved.rotationY, 0)),
      new THREE.Vector3(1, 1, 1),
    ));
  } else {
    const draped = createDecalDrapeGeometry({ size: rules.size, rotationY: resolved.rotationY, heightAt, lift: rules.lift });
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(draped.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(draped.normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(draped.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(draped.indices, 1));
    geometry.translate(px, py, pz);
  }
  const columns = Math.min(DECAL_COLUMNS, pageLooks);
  const rows = Math.ceil(pageLooks / DECAL_COLUMNS);
  const cell = slot % DECAL_PAGE_SLOTS;
  const left = (cell % DECAL_COLUMNS) * DECAL_STRIDE + DECAL_GUTTER;
  const bottom = Math.floor(cell / DECAL_COLUMNS) * DECAL_STRIDE + DECAL_GUTTER;
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (left + uv.getX(i) * DECAL_TILE) / (columns * DECAL_STRIDE), (bottom + uv.getY(i) * DECAL_TILE) / (rows * DECAL_STRIDE));
  }
  const color = new Float32Array(uv.count * 4).fill(1);
  for (let i = 0; i < uv.count; i += 1) color[i * 4 + 3] = rules.opacity;
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 4));
  return { geometry, cell: `${Math.floor(px / DECAL_CELL)},${Math.floor(pz / DECAL_CELL)}` };
}

/**
 * Lays every decal into shared atlas pages and merges their geometry per page and world cell, so a
 * yard of stains costs a handful of draws rather than one draw, texture and material each.
 * @internal
 */
export function buildDecalBatches(objects: readonly SceneKindObject[], heightAt: TerrainHeightSampler): DecalBatches {
  const looks = new Map<string, DecalLook>();
  const placed: { resolved: ResolvedDecal; look: DecalLook }[] = [];
  for (const object of objects) {
    const resolved = resolveDecalObject(object);
    if (resolved === null) continue;
    const { style, seed, text, color } = resolved.rules;
    const key = JSON.stringify([style, seed, text, color]);
    let look = looks.get(key);
    if (look === undefined) {
      look = { rules: resolved.rules, slot: looks.size };
      looks.set(key, look);
    }
    placed.push({ resolved, look });
  }
  const all = [...looks.values()];
  const pages: THREE.DataTexture[] = [];
  for (let start = 0; start < all.length; start += DECAL_PAGE_SLOTS) pages.push(bakePage(all.slice(start, start + DECAL_PAGE_SLOTS)));
  const pageLooks = (page: number) => Math.min(DECAL_PAGE_SLOTS, all.length - page * DECAL_PAGE_SLOTS);
  const groups = new Map<string, { page: number; parts: THREE.BufferGeometry[] }>();
  for (const { resolved, look } of placed) {
    const page = Math.floor(look.slot / DECAL_PAGE_SLOTS);
    const part = decalGeometry(resolved, heightAt, look.slot, pageLooks(page));
    const key = `${page}:${part.cell}`;
    const group = groups.get(key) ?? { page, parts: [] };
    group.parts.push(part.geometry);
    groups.set(key, group);
  }
  const draws: DecalBatches["draws"] = [];
  for (const [key, { page, parts }] of groups) {
    const [first] = parts;
    const merged = parts.length === 1 && first !== undefined ? first : mergeGeometries(parts);
    if (merged !== first) for (const part of parts) part.dispose();
    if (merged === null) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    draws.push({ key, page, geometry: merged });
  }
  return { pages, draws };
}

function decalMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

function Decals({ objects, heightAt }: { objects: readonly SceneKindObject[]; heightAt: TerrainHeightSampler }) {
  const batches = useMemo(() => buildDecalBatches(objects, heightAt), [objects, heightAt]);
  const materials = useMemo(() => batches.pages.map(decalMaterial), [batches]);
  useEffect(() => () => {
    for (const page of batches.pages) page.dispose();
    for (const draw of batches.draws) draw.geometry.dispose();
  }, [batches]);
  useEffect(() => () => { for (const material of materials) material.dispose(); }, [materials]);
  return <>{batches.draws.map((draw) => {
    const material = materials[draw.page];
    return material === undefined ? null : <mesh key={draw.key} geometry={draw.geometry} material={material} receiveShadow frustumCulled />;
  })}</>;
}

/** Registers the `decal` marker renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerDecalRenderer(): void {
  registerSceneKindRenderer("decal", ({ objects, context }) => <Decals objects={objects} heightAt={context.field.sampleHeight} />);
}
