import * as THREE from "three";

import type { GeneratorMeshSource } from "@jgengine/core/generator/generatorMesh.draw";
import { toonRampMaterial } from "@jgengine/core/material/toonRamp.draw";
import { natureGeometry, natureMaterial } from "@jgengine/core/nature/natureMesh.draw";
import type { PlantMesh, PlantMeshLook } from "./plantMesh";

let litLeaves: THREE.MeshStandardMaterial | null = null;
let litWood: THREE.MeshStandardMaterial | null = null;

/**
 * The shared materials a plant mesh's wood and foliage draw with for its look: lit vertex colour
 * (with generated bark grain when asked) or one cel-shading ramp for both.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function plantMeshMaterials(look: PlantMeshLook): { bark: THREE.Material; leaves: THREE.Material } {
  if (look.shading === "ramp") {
    const ramp = toonRampMaterial(look.ramp);
    return { bark: ramp, leaves: ramp };
  }
  litLeaves ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  litWood ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  return { bark: look.barkGrain ? natureMaterial("bark") : litWood, leaves: litLeaves };
}

/**
 * A plant mesh as instanceable draws, wood then foliage; the geometries belong to the caller.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function plantMeshSources(mesh: PlantMesh): GeneratorMeshSource[] {
  const materials = plantMeshMaterials(mesh.look);
  const sources: GeneratorMeshSource[] = [];
  if (mesh.bark.triangles > 0) sources.push({ geometry: natureGeometry(mesh.bark), material: materials.bark });
  if (mesh.leaves.triangles > 0) sources.push({ geometry: natureGeometry(mesh.leaves), material: materials.leaves });
  return sources;
}
