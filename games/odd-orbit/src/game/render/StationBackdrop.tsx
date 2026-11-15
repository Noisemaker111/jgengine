/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

import { editorLayers } from "../../editorLayers";

/**
 * What surrounds the boarding house: the station's hull plate ends at a ring of trusses, beacons
 * blink on its corners, a docking arm reaches out past the back row with a little shuttle moored to
 * it, and beyond all of it is black space — a starfield and the pastel limb of the planet the
 * station orbits. Pure set dressing around the authored deck, drawn like a sky.
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

function trusses(beacons: THREE.MeshStandardMaterial[]): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: "#5a5578", metalness: 0.6, roughness: 0.4 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const beam = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(box, steel);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  };
  const { minX, maxX, minZ, maxZ } = DECK;
  // A rail of trusses round the deck's edge, with ribs every few metres.
  for (const z of [minZ, maxZ]) { beam(maxX - minX, 0.35, 0.35, 0, 0.9, z); beam(maxX - minX, 0.35, 0.35, 0, -0.4, z); }
  for (const x of [minX, maxX]) { beam(0.35, 0.35, maxZ - minZ, x, 0.9, 0); beam(0.35, 0.35, maxZ - minZ, x, -0.4, 0); }
  for (let x = minX; x <= maxX; x += 4) for (const z of [minZ, maxZ]) beam(0.2, 1.3, 0.2, x, 0.25, z);
  for (let z = minZ; z <= maxZ; z += 4) for (const x of [minX, maxX]) beam(0.2, 1.3, 0.2, x, 0.25, z);
  // Beacons on the corners, blinking in turn.
  for (const [x, z] of [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]] as const) {
    beam(0.4, 4, 0.4, x, 2, z);
    const lamp = new THREE.MeshStandardMaterial({ color: "#ff5fa8", emissive: "#ff2d7f", emissiveIntensity: 2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), lamp);
    bulb.position.set(x, 4.3, z);
    g.add(bulb);
    beacons.push(lamp);
  }
  // A docking arm off the back of the deck with a little shuttle moored at its end.
  beam(3, 1.2, 26, 0, 1.4, minZ - 13);
  beam(5, 3, 3, 0, 1.6, minZ - 26.5);
  const hull = new THREE.MeshStandardMaterial({ color: "#f4ead8", metalness: 0.2, roughness: 0.45 });
  const shuttle = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 7, 8, 16), hull);
  shuttle.rotation.z = Math.PI / 2;
  shuttle.position.set(6.5, 1.8, minZ - 27);
  g.add(shuttle);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 1.2, 24), new THREE.MeshStandardMaterial({ color: "#f6a6cf", emissive: "#f6a6cf", emissiveIntensity: 0.25 }));
  stripe.rotation.z = Math.PI / 2;
  stripe.position.set(6.5, 1.8, minZ - 27);
  g.add(stripe);
  const windowLamp = new THREE.MeshStandardMaterial({ color: "#ffd98a", emissive: "#ffc35c", emissiveIntensity: 1.4 });
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), windowLamp);
    w.position.set(4 + i * 1.6, 2.6, minZ - 25);
    g.add(w);
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
  const dressing = trusses(beacons);
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
