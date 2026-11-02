/**
 * Browser side of the impostor bake (`games/shared/impostorBaker.ts`): loads one model file and renders it with
 * the engine's own `bakeImpostor`, the same code a game runs when no baked atlas exists, then hands
 * the atlas pixels back as base64 RGBA rows.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { bakeImpostor, type ImpostorSource } from "@jgengine/core/lod/impostor.draw";

interface BakeAnswer {
  size: number;
  albedo: string;
  normal: string;
  center: [number, number, number];
  radius: number;
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(text);
}

const canvas = document.createElement("canvas");
canvas.width = 64;
canvas.height = 64;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

async function bake(url: string, frames: number, cell: number): Promise<BakeAnswer | null> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const sources: ImpostorSource[] = [];
  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh && node.visible) sources.push({ geometry: node.geometry, material: node.material, localMatrix: node.matrixWorld.clone() });
  });
  const atlas = bakeImpostor(renderer, sources, { frames, cell });
  if (atlas === null || atlas.targets === undefined) return null;
  const size = frames * cell;
  const read = (target: THREE.WebGLRenderTarget): string => {
    const pixels = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    return base64(pixels);
  };
  const answer: BakeAnswer = {
    size,
    albedo: read(atlas.targets.albedo),
    normal: read(atlas.targets.normal),
    center: [atlas.center.x, atlas.center.y, atlas.center.z],
    radius: atlas.radius,
  };
  atlas.dispose();
  return answer;
}

Object.assign(window, { jgBakeImpostor: bake });
