/**
 * The playground's 3D viewer: the dials regenerate a GeneratedCity (or a
 * closed circuit) and this module rebuilds the merged city model around an
 * orbit camera. First build grows in; slider drags rebuild instantly.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { GeneratedCity } from "@jgengine/core/world/cityGenerator";
import { buildCityModel, buildGround, type CityModel, type CityPalette } from "./cityScene";
import { disposeObject, mountLive, type LiveHandle } from "./mount";

const INK = 0x04060c;

const PALETTE: CityPalette = {
  building: 0x38465c,
  streets: { boulevard: 0x33465f, avenue: 0x2a3a50, street: 0x223043, lane: 0x1a2534 },
  glow: 0x34d399,
  windowWarm: 0xffd9a0,
  windowCool: 0x67e8f9,
  trafficA: 0xfff3d6,
  trafficB: 0xf87171,
  lightA: 0x34d399,
  lightB: 0x22d3ee,
  fogDensity: 0.0014,
};

export interface PlaygroundWorldHandle {
  setCity(city: GeneratedCity, options: { seed: string; heightScale?: number; animate?: boolean }): void;
  dispose(): void;
}

export function createPlaygroundWorld(container: HTMLElement): PlaygroundWorldHandle {
  let model: CityModel | null = null;
  let ground: THREE.Group | null = null;
  let modelElapsed = 0;

  const handle: LiveHandle = mountLive(container, {
    fov: 46,
    far: 2600,
    frame(dt) {
      modelElapsed += dt;
      controls.update();
      model?.update(dt, modelElapsed);
    },
    onDispose() {
      controls.dispose();
    },
  });

  handle.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  handle.scene.fog = new THREE.FogExp2(INK, PALETTE.fogDensity);
  const hemisphere = new THREE.HemisphereLight(0x5f7590, 0x0a0e18, 1.25);
  const moon = new THREE.DirectionalLight(0xa8bcd8, 1.3);
  moon.position.set(180, 320, -140);
  handle.scene.add(hemisphere, moon);

  handle.camera.position.set(240, 190, 240);
  const controls = new OrbitControls(handle.camera, handle.renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 60;
  controls.maxDistance = 900;
  if (handle.reducedMotion) {
    // No RAF loop under reduced motion — render on demand as the user orbits.
    controls.addEventListener("change", () => handle.invalidate());
  }

  return {
    setCity(city, options) {
      model?.dispose();
      model = buildCityModel(city, PALETTE, {
        seed: options.seed,
        instant: handle.reducedMotion || options.animate !== true,
        heightScale: options.heightScale ?? 1,
      });
      handle.scene.add(model.group);
      if (options.animate === true) {
        // First build: frame the whole generated extent once; after that the
        // camera belongs to the user.
        const r = model.radius;
        handle.camera.position.set(r * 0.95, r * 0.68, r * 0.95);
        controls.target.set(0, 10, 0);
        controls.update();
      }
      const wantRadius = model.radius + 120;
      if (ground === null || Math.abs(wantRadius - (ground.userData.radius as number)) > 60) {
        if (ground !== null) {
          handle.scene.remove(ground);
          disposeObject(ground);
        }
        ground = buildGround(wantRadius, PALETTE.glow);
        ground.userData.radius = wantRadius;
        handle.scene.add(ground);
      }
      modelElapsed = 0;
      handle.invalidate();
    },
    dispose() {
      model?.dispose();
      handle.dispose();
    },
  };
}
