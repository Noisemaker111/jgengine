import * as THREE from "three";

import type { GeneratorMeshSource } from "@jgengine/core/generator/generatorMesh.draw";
import { toonRampKey } from "@jgengine/core/material/toonRamp";
import { toonRampMaterial, toonRampTexture } from "@jgengine/core/material/toonRamp.draw";
import { natureGeometry, natureMaterial } from "@jgengine/core/nature/natureMesh.draw";
import type { LeafShapeParams } from "../species/plantSpecies";
import { plantLeafAtlas, plantLeafAtlasKey } from "./plantLeafAtlas";
import type { PlantMesh, PlantMeshLook } from "./plantMesh";

/** Below this atlas alpha a leaf texel is cut away. */
const LEAF_ALPHA_TEST = 0.45;

let litLeaves: THREE.MeshStandardMaterial | null = null;
let litWood: THREE.MeshStandardMaterial | null = null;
const atlases = new Map<string, THREE.DataTexture>();
const leafMaterials = new Map<string, THREE.Material>();

/** The baked leaf atlas of a leaf shape as one shared texture per shape. */
function leafAtlasTexture(shape: LeafShapeParams): THREE.DataTexture {
  const key = plantLeafAtlasKey(shape);
  const known = atlases.get(key);
  if (known !== undefined) return known;
  const atlas = plantLeafAtlas(shape);
  const texture = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  atlases.set(key, texture);
  return texture;
}

function texturedLeaves(look: PlantMeshLook, shape: LeafShapeParams): THREE.Material {
  const key = `${look.shading === "ramp" ? toonRampKey(look.ramp) : "lit"}|${plantLeafAtlasKey(shape)}`;
  const known = leafMaterials.get(key);
  if (known !== undefined) return known;
  const map = leafAtlasTexture(shape);
  const material = look.shading === "ramp"
    ? new THREE.MeshToonMaterial({ vertexColors: true, map, alphaTest: LEAF_ALPHA_TEST, gradientMap: toonRampTexture(look.ramp), side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ vertexColors: true, map, alphaTest: LEAF_ALPHA_TEST, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  leafMaterials.set(key, material);
  return material;
}

/**
 * The shared materials a plant mesh's wood and foliage draw with for its look: lit vertex colour
 * (with generated bark grain when asked) or one cel-shading ramp for both. Foliage with a leaf atlas
 * samples the atlas baked from its species' leaf shape and cuts leaves out by its alpha.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function plantMeshMaterials(look: PlantMeshLook): { bark: THREE.Material; leaves: THREE.Material } {
  if (look.shading === "ramp") {
    const ramp = toonRampMaterial(look.ramp);
    return { bark: ramp, leaves: look.leafAtlas === null ? ramp : texturedLeaves(look, look.leafAtlas) };
  }
  litLeaves ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  litWood ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  return {
    bark: look.barkGrain ? natureMaterial("bark") : litWood,
    leaves: look.leafAtlas === null ? litLeaves : texturedLeaves(look, look.leafAtlas),
  };
}

/**
 * A plant mesh as instanceable draws, wood then foliage; the geometries belong to the caller.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function plantMeshSources(mesh: PlantMesh): GeneratorMeshSource[] {
  const materials = plantMeshMaterials(mesh.look);
  const sources: GeneratorMeshSource[] = [];
  if (mesh.bark.triangles > 0) sources.push({ geometry: natureGeometry(mesh.bark), material: materials.bark });
  if (mesh.leaves.triangles > 0) {
    const geometry = natureGeometry(mesh.leaves);
    if (mesh.leafUvs.length > 0) geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.leafUvs, 2));
    sources.push({ geometry, material: materials.leaves });
  }
  return sources;
}
