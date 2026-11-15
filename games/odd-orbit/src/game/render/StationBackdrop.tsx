/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

import { editorLayers } from "../../editorLayers";

/**
 * What surrounds the boarding house: black space — a starfield and the pastel limb of the planet the
 * station orbits — drawn like a sky, plus the markings painted on the authored deck plate.
 */

const DECK = editorLayers.terrain?.bounds ?? { minX: -32, minZ: -32, maxX: 32, maxZ: 32 };

function starfield(): THREE.Points {
  const rng = seededRng("no-vacancy-stars");
  const count = 2400;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tints = [new THREE.Color("#ffffff"), new THREE.Color("#cfe3ff"), new THREE.Color("#ffd9f0"), new THREE.Color("#fff1c9")];
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;
    const theta = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    // Inside the sky dome (radius 260), which draws over anything further out.
    const radius = 210;
    positions.set([Math.cos(theta) * r * radius, u * radius * 0.8, Math.sin(theta) * r * radius], i * 3);
    const tint = tints[Math.floor(rng() * tints.length)]!.clone().multiplyScalar(0.55 + rng() * 0.45);
    colors.set([tint.r, tint.g, tint.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}

function planet(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(-80, -95, -150);
  const body = new THREE.Mesh(new THREE.SphereGeometry(95, 64, 48), new THREE.MeshStandardMaterial({ color: "#7f6fd0", roughness: 0.9, emissive: "#2b1f5a", emissiveIntensity: 0.6, fog: false }));
  g.add(body);
  for (const [y, color] of [[24, "#f6a6cf"], [-6, "#9fe0c4"], [-36, "#ffd98a"]] as const) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(95 * 95 - y * y) + 0.4, 3.5, 8, 96), new THREE.MeshStandardMaterial({ color, roughness: 1, emissive: color, emissiveIntensity: 0.2, transparent: true, opacity: 0.55, fog: false }));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(102, 48, 32), new THREE.MeshBasicMaterial({ color: "#b9a6ff", transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false, fog: false }));
  g.add(glow);
  return g;
}

/**
 * Deck markings painted onto the authored plate: a yellow-and-black hazard band round its edge, a
 * cyan light strip just inside it, and the beacons on the authored light masts, which blink in turn.
 * The hardware itself (trusses, masts, solar wings, the pad and lander) is authored in the scene.
 */
function deckMarkings(beacons: THREE.MeshStandardMaterial[]): THREE.Group {
  const g = new THREE.Group();
  const { minX, maxX, minZ, maxZ } = DECK;
  const inset = 1.2;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const yellow = new THREE.MeshStandardMaterial({ color: "#ffcf3f", roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: "#1d1b26", roughness: 0.7 });
  const strip = new THREE.MeshStandardMaterial({ color: "#6ff3ff", emissive: "#38e8ff", emissiveIntensity: 1.2 });
  const tile = (mat: THREE.Material, w: number, d: number, x: number, z: number, y = 0.03) => {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(w, 0.04, d);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
  };
  const dash = 1.2;
  for (let x = minX + inset; x < maxX - inset; x += dash) {
    const mat = Math.round((x - minX) / dash) % 2 === 0 ? yellow : black;
    tile(mat, dash, 0.7, x + dash / 2, minZ + inset);
    tile(mat, dash, 0.7, x + dash / 2, maxZ - inset);
  }
  for (let z = minZ + inset; z < maxZ - inset; z += dash) {
    const mat = Math.round((z - minZ) / dash) % 2 === 0 ? yellow : black;
    tile(mat, 0.7, dash, minX + inset, z + dash / 2);
    tile(mat, 0.7, dash, maxX - inset, z + dash / 2);
  }
  // Plate seams every four metres on the open deck (the house and its commons keep their own floors).
  const seam = new THREE.MeshStandardMaterial({ color: "#232a3c", roughness: 0.8, metalness: 0.4 });
  const house = (x: number, z: number) => x > -17 && x < 17 && z > -22 && z < 15;
  for (let x = Math.ceil(minX / 4) * 4; x <= maxX - inset - 1; x += 4) {
    for (let z = minZ + inset + 0.6; z < maxZ - inset - 0.6; z += 4) if (!house(x, z + 2)) tile(seam, 0.08, 4, x, z + 2, 0.02);
  }
  for (let z = Math.ceil(minZ / 4) * 4; z <= maxZ - inset - 1; z += 4) {
    for (let x = minX + inset + 0.6; x < maxX - inset - 0.6; x += 4) if (!house(x + 2, z)) tile(seam, 4, 0.08, x + 2, z, 0.02);
  }
  const s = inset + 1.1;
  tile(strip, maxX - minX - 2 * s, 0.14, (minX + maxX) / 2, minZ + s, 0.05);
  tile(strip, maxX - minX - 2 * s, 0.14, (minX + maxX) / 2, maxZ - s, 0.05);
  tile(strip, 0.14, maxZ - minZ - 2 * s, minX + s, (minZ + maxZ) / 2, 0.05);
  tile(strip, 0.14, maxZ - minZ - 2 * s, maxX - s, (minZ + maxZ) / 2, 0.05);
  for (const mast of editorLayers.markers.filter((m) => m.meta?.["object"] === "station_mast")) {
    const lamp = new THREE.MeshStandardMaterial({ color: "#ff5fa8", emissive: "#ff2d7f", emissiveIntensity: 2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), lamp);
    bulb.position.set(mast.position.x, 4.9, mast.position.z);
    g.add(bulb);
    beacons.push(lamp);
  }
  return g;
}

export function stationBackdropDraw(ctx: GameContext | null): EngineDraw {
  const root = new THREE.Group();
  const beacons: THREE.MeshStandardMaterial[] = [];
  const stars = starfield();
  // Deep space behind everything: a dark shell just inside the sky dome, so whatever sky the render
  // tier draws, the house hangs in black with the stars and the planet in front of it.
  const space = new THREE.Mesh(new THREE.SphereGeometry(228, 32, 16), new THREE.MeshBasicMaterial({ color: "#06050f", side: THREE.BackSide, fog: false, toneMapped: false }));
  space.renderOrder = -20;
  space.frustumCulled = false;
  stars.add(space);
  const dressing = deckMarkings(beacons);
  root.add(stars, planet(), dressing);
  return {
    mount(state: EngineFrameState) { state.scene.add(root); },
    frame(state: EngineFrameState) {
      if (ctx !== null) dressing.position.y = ctx.world.groundHeightAt(0, 0);
      stars.position.copy(state.camera.position);
      const t = state.clock.elapsedTime;
      beacons.forEach((lamp, i) => { lamp.emissiveIntensity = Math.sin(t * 2.4 + i * 1.6) > 0.55 ? 3 : 0.15; });
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | undefined;
        material?.dispose();
      });
    },
  };
}

export function StationBackdrop({ ctx }: { ctx: GameContext }) {
  return <EngineDrawMount create={() => stationBackdropDraw(ctx)} deps={[ctx]} />;
}
