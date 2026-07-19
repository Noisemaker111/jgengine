/**
 * The landing hero: a real city generated in this tab by the published
 * `@jgengine/core` generators, one scenario per rotating pitch. The React
 * side owns the sentence typing and seed chip; this module owns generation,
 * growth animation, palette, and the drifting camera.
 */
import * as THREE from "three";

import { generateCity } from "@jgengine/core/world/cityGenerator";
import { HERO_SCENARIOS } from "../lib/heroScenarios";
import { buildCityModel, buildGround, type CityModel, type CityStats } from "./cityScene";
import { disposeObject, mountLive, type LiveHandle } from "./mount";

const INK = 0x04060c;

export interface HeroWorldCallbacks {
  /** Fired after every regeneration with the real generated numbers. */
  onStats(stats: CityStats, seed: string): void;
}

export interface HeroWorldHandle {
  setScenario(index: number, seed: string): void;
  /** Pointer position in [-1, 1] for parallax; call from React's pointermove. */
  setPointer(x: number, y: number): void;
  dispose(): void;
}

export function createHeroWorld(container: HTMLElement, callbacks: HeroWorldCallbacks): HeroWorldHandle {
  let model: CityModel | null = null;
  let ground: THREE.Group | null = null;
  let modelElapsed = 0;
  let scenarioIndex = 0;
  let theta = 0.65;
  let pointerX = 0;
  let pointerY = 0;
  let smoothedX = 0;
  let smoothedY = 0;
  let captureFlagged = false;

  const handle: LiveHandle = mountLive(container, {
    fov: 44,
    far: 2600,
    frame(dt, _elapsed) {
      modelElapsed += dt;
      model?.update(dt, modelElapsed);
      if (!handle.reducedMotion) theta += dt * 0.032;
      smoothedX += (pointerX - smoothedX) * Math.min(1, dt * 2.5);
      smoothedY += (pointerY - smoothedY) * Math.min(1, dt * 2.5);
      placeCamera();
      if (!captureFlagged && model?.settled() === true) {
        captureFlagged = true;
        // Screenshot tooling (jgengine-verify) waits for this flag.
        document.documentElement.dataset.jgCapture = "ready";
      }
    },
  });

  handle.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  handle.scene.fog = new THREE.FogExp2(INK, 0.003);

  const hemisphere = new THREE.HemisphereLight(0x5f7590, 0x0a0e18, 1.25);
  const moon = new THREE.DirectionalLight(0xa8bcd8, 1.3);
  moon.position.set(180, 320, -140);
  handle.scene.add(hemisphere, moon);

  function placeCamera() {
    const scenario = HERO_SCENARIOS[scenarioIndex]!;
    const radius = scenario.camera.radius;
    const height = scenario.camera.height + smoothedY * 18;
    const angle = theta + smoothedX * 0.16;
    handle.camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    // Aim above the city center so the skyline settles into the lower half
    // of the frame, under the headline instead of behind it.
    handle.camera.lookAt(0, 52, 0);
  }

  return {
    setScenario(index, seed) {
      scenarioIndex = ((index % HERO_SCENARIOS.length) + HERO_SCENARIOS.length) % HERO_SCENARIOS.length;
      const scenario = HERO_SCENARIOS[scenarioIndex]!;
      model?.dispose();
      const city = generateCity(
        { seed, streets: scenario.streets, lots: scenario.lots },
        scenario.halfExtent,
        scenario.halfExtent,
      );
      model = buildCityModel(
        city,
        {
          building: scenario.palette.building,
          streets: {
            boulevard: scenario.palette.boulevard,
            avenue: scenario.palette.avenue,
            street: scenario.palette.street,
            lane: scenario.palette.lane,
          },
          glow: scenario.palette.glow,
          windowWarm: scenario.palette.windowWarm,
          windowCool: scenario.palette.windowCool,
          trafficA: scenario.palette.trafficA,
          trafficB: scenario.palette.trafficB,
          lightA: scenario.palette.lightA,
          lightB: scenario.palette.lightB,
          fogDensity: scenario.palette.fogDensity,
        },
        { seed, instant: handle.reducedMotion, heightScale: scenario.heightScale },
      );
      handle.scene.add(model.group);
      (handle.scene.fog as THREE.FogExp2).density = scenario.palette.fogDensity;
      if (ground === null || model.radius + 80 > (ground.userData.radius as number)) {
        if (ground !== null) {
          handle.scene.remove(ground);
          disposeObject(ground);
        }
        ground = buildGround(model.radius + 120, scenario.palette.glow);
        ground.userData.radius = model.radius + 120;
        handle.scene.add(ground);
      }
      modelElapsed = 0;
      callbacks.onStats(model.stats, seed);
      handle.invalidate();
    },
    setPointer(x, y) {
      pointerX = x;
      pointerY = y;
    },
    dispose() {
      model?.dispose();
      handle.dispose();
    },
  };
}
