import { afterEach, expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";

import { environment, road } from "@jgengine/core/world/features";

import { setSurfaceScanLoader } from "../render/surfaceScanTextures";
import { EnvironmentScene } from "./EnvironmentScene";
import { JUNCTION_PAINT } from "./RoadJunctions";
import { mixColor } from "./RoadRibbons";

afterEach(() => setSurfaceScanLoader(null));

async function mountScene(feature: ReturnType<typeof environment>): Promise<{ scene: THREE.Scene; unmount: () => Promise<void> }> {
  const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  env.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never",
    size: { width: 800, height: 450, top: 0, left: 0 },
    dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer,
  });
  let scene!: THREE.Scene;
  await act(async () => {
    scene = root.render(createElement(EnvironmentScene, { feature })).getState().scene;
  });
  // Let the scan loads resolve and the materials rebuild around them.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { scene, unmount: async () => act(async () => root.unmount()) };
}

function materials(scene: THREE.Scene): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) out.push(mesh.material as THREE.MeshStandardMaterial);
  });
  return out;
}

test("a scanned street: asphalt, junctions and paint take the scan, sidewalks get slabs and a kerb face", async () => {
  const loaded: string[] = [];
  setSurfaceScanLoader((url, onLoad) => {
    loaded.push(url);
    queueMicrotask(() => onLoad(new THREE.Texture()));
  });
  const asphalt = { maps: { color: "/materials/a/color.jpg", normal: "/materials/a/normal.jpg" }, repeat: 4 };
  const feature = environment({
    roads: [
      road({ path: [[-40, 0], [40, 0]], width: 12, sidewalk: { width: 4 }, materials: { road: asphalt } }),
      road({ path: [[0, -40], [0, 40]], width: 12, sidewalk: { width: 4 }, materials: { road: asphalt } }),
    ],
  });
  const { scene, unmount } = await mountScene(feature);
  try {
    // Every layer naming the same URLs shares one decode.
    expect(new Set(loaded)).toEqual(new Set([asphalt.maps.color, asphalt.maps.normal]));
    expect(loaded.length).toBe(2);
    const all = materials(scene);
    const scanned = all.filter((m) => m.defines?.["JG_SCAN"] === "");
    // Two carriageways, the welded junction, two dash sets and the junction stop lines + crosswalks.
    expect(scanned.length).toBeGreaterThanOrEqual(5);
    expect(all.some((m) => m.defines?.["JG_RIBBON_PAINT"] === "" && m.defines?.["JG_SCAN"] === "")).toBe(true);
    expect(all.filter((m) => m.defines?.["JG_RIBBON_SLABS"] === "").length).toBe(2);
    // The junction's stop lines and crosswalks are worn paint over the same asphalt scan.
    const junctionPaint = all.filter((m) => new THREE.Color(m.color as THREE.ColorRepresentation).getHexString() === JUNCTION_PAINT.slice(1));
    expect(junctionPaint.length).toBeGreaterThan(0);
    expect(junctionPaint.every((m) => m.defines?.["JG_RIBBON_PAINT"] === "" && m.defines?.["JG_SCAN"] === "")).toBe(true);
    // The kerb face is plain vertical geometry with a darker sidewalk tone.
    const kerbTone = mixColor("#a7adb8", "#000000", 0.12).slice(1);
    expect(all.filter((m) => new THREE.Color(m.color as THREE.ColorRepresentation).getHexString() === kerbTone).length).toBe(2);
  } finally {
    await unmount();
  }
});

test("a scan that fails to load keeps the procedural street", async () => {
  setSurfaceScanLoader((_url, _onLoad, onError) => queueMicrotask(onError));
  const original = console.warn;
  console.warn = () => {};
  try {
    const feature = environment({
      roads: [road({ path: [[-40, 0], [40, 0]], width: 12, materials: { road: { maps: { color: "/x/color.jpg", normal: "/x/normal.jpg" } } } })],
    });
    const { scene, unmount } = await mountScene(feature);
    try {
      const all = materials(scene);
      expect(all.some((m) => m.defines?.["JG_SCAN"] === "")).toBe(false);
      expect(all.some((m) => m.defines?.["JG_RIBBON_PAVED"] === "")).toBe(true);
    } finally {
      await unmount();
    }
  } finally {
    console.warn = original;
  }
});
