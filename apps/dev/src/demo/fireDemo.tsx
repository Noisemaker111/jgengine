import { useFrame } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";

import type { PlayableGame } from "@jgengine/shell/registry";
import { FireLandscapeView } from "@jgengine/core/fire/FireLandscape.draw";
import { createFireLandscape, type FireLandscape, type FireWeather } from "@jgengine/core/fire/fireLandscape";
import { createFuelMoistureModel, type MoistureWeather } from "@jgengine/core/fire/fuelMoisture";
import { MOISTURE_SCENARIOS } from "@jgengine/core/fire/fuelModels";
import { plantCanopyFuel, rasterizeCanopyFuel, sampleFireGround, sunExposure, type PlantCanopyFuel } from "@jgengine/core/fire/fuelSources";
import { OPEN_TEMPERATE_SITE } from "@jgengine/core/plants/growth/plantEnvironment";
import { createPlantGrowth } from "@jgengine/core/plants/growth/plantGrowth";
import { PINUS_STROBUS } from "@jgengine/core/plants/species/data/pinusStrobus";
import { seededRng } from "@jgengine/core/random/rng";

import { demoGame } from "./demoGame";

const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
/** `?t=600` runs the fire to that many seconds and holds it there, so a capture is reproducible. */
const pinned = params.get("t");
/** Simulated seconds per real second when not pinned. */
const speed = Number(params.get("speed") ?? "20");

const COLS = 200;
const ROWS = 200;
const CELL = 3;
const ORIGIN = -(COLS * CELL) / 2;
const WIND_SPEED = 7;
const WIND: FireWeather = { twentyFootWind: WIND_SPEED, windDirection: 0, airTemperatureC: 32, moisture: MOISTURE_SCENARIOS["D1L1"] ?? { oneHour: 0.03, tenHour: 0.04, hundredHour: 0.05, liveHerb: 0.3, liveWoody: 0.6 } };
const AFTERNOON: MoistureWeather = { airTemperatureC: 32, relativeHumidity: 0.15, rainRateMmPerHour: 0, cloudCover: 0.1, daylight: 1 };

function heightAt(x: number, z: number): number {
  const hill = 38 * Math.exp(-((x - 90) ** 2 + (z + 40) ** 2) / (2 * 110 ** 2));
  const rolls = 3 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
  return hill + rolls;
}

function riverAt(x: number): number {
  return 170 + 25 * Math.sin(x * 0.012);
}

function fuelCode(x: number, z: number): string {
  if (Math.abs(z - riverAt(x)) < 6) return "NB8";
  if (x > 175 && x < 184 && z < 60) return "NB9";
  if ((x - 90) ** 2 + (z + 40) ** 2 < 120 ** 2) return "TU5";
  return heightAt(x, z) > 6 ? "GS2" : "GR4";
}

interface Scene {
  fire: FireLandscape;
  trees: { x: number; z: number; height: number; radius: number; base: number }[];
  fuelColor: Float32Array;
}

function buildScene(): Scene {
  const frame = { cols: COLS, rows: ROWS, cellSize: CELL, originX: ORIGIN, originZ: ORIGIN };
  const ground = sampleFireGround(frame, { heightAt, fuelAt: fuelCode });
  const grown: PlantCanopyFuel[] = [];
  for (const age of [25, 40, 60]) {
    const plant = createPlantGrowth(PINUS_STROBUS, { ...OPEN_TEMPERATE_SITE, stand: { spacingIndex: 0.3 } }, `fire-${age}`);
    plant.step(age);
    grown.push(plantCanopyFuel(plant.structure(), PINUS_STROBUS, plant.stats().leafAreaM2));
  }
  const rng = seededRng("fire-demo-trees");
  const placed: { x: number; z: number; fuel: PlantCanopyFuel }[] = [];
  for (let k = 0; k < 900; k++) {
    const x = ORIGIN + rng() * COLS * CELL;
    const z = ORIGIN + rng() * ROWS * CELL;
    if (fuelCode(x, z) !== "TU5") continue;
    const fuel = grown[Math.floor(rng() * grown.length)];
    if (fuel !== undefined) placed.push({ x, z, fuel });
  }
  const canopy = rasterizeCanopyFuel(frame, placed, { foliarMoisture: 0.9 });
  const exposure = sunExposure(frame, ground.elevation, { azimuth: -Math.PI / 2, elevation: 1 }, canopy);
  const moisture = createFuelMoistureModel({ cells: COLS * ROWS, initial: WIND.moisture, exposure });
  moisture.step(5 * 3600, AFTERNOON);
  const fire = createFireLandscape({ ...frame, fuels: ground.fuels, fuel: ground.fuel, elevation: ground.elevation, canopies: canopy.canopies, canopy: canopy.canopy, seed: "fire-demo" });
  fire.setMoistureField(moisture);
  fire.igniteAt(ORIGIN + 40, -60);
  const fuelColor = new Float32Array(COLS * ROWS * 3);
  const palette: Record<string, readonly [number, number, number]> = {
    GR4: [0.62, 0.6, 0.3],
    GS2: [0.5, 0.5, 0.28],
    TU5: [0.2, 0.3, 0.16],
    NB8: [0.16, 0.3, 0.42],
    NB9: [0.45, 0.43, 0.4],
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const code = fuelCode(ORIGIN + (c + 0.5) * CELL, ORIGIN + (r + 0.5) * CELL);
      const rgb = palette[code] ?? [0.5, 0.5, 0.5];
      fuelColor.set(rgb, (r * COLS + c) * 3);
    }
  }
  return {
    fire,
    trees: placed.map((p) => ({ x: p.x, z: p.z, height: p.fuel.heightM, radius: p.fuel.crownRadiusM, base: p.fuel.crownBaseM })),
    fuelColor,
  };
}

function Ground({ fuelColor }: { fuelColor: Float32Array }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL, COLS - 1, ROWS - 1);
    g.rotateX(-Math.PI / 2);
    const position = g.getAttribute("position");
    const colors = new Float32Array(position.count * 3);
    for (let k = 0; k < position.count; k++) {
      const x = position.getX(k);
      const z = position.getZ(k);
      position.setY(k, heightAt(x, z));
      const c = Math.min(COLS - 1, Math.max(0, Math.floor((x - ORIGIN) / CELL)));
      const r = Math.min(ROWS - 1, Math.max(0, Math.floor((z - ORIGIN) / CELL)));
      colors.set(fuelColor.subarray((r * COLS + c) * 3, (r * COLS + c) * 3 + 3), k * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [fuelColor]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

function Trees({ scene }: { scene: Scene }) {
  const { mesh, colors } = useMemo(() => {
    const cone = new THREE.ConeGeometry(1, 1, 7, 1);
    cone.translate(0, 0.5, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const instanced = new THREE.InstancedMesh(cone, material, scene.trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    scene.trees.forEach((t, i) => {
      const y = heightAt(t.x, t.z) + t.base;
      m.compose(new THREE.Vector3(t.x, y, t.z), q, new THREE.Vector3(Math.max(0.8, t.radius), Math.max(1, t.height - t.base), Math.max(0.8, t.radius)));
      instanced.setMatrixAt(i, m);
      instanced.setColorAt(i, new THREE.Color(0.16, 0.3, 0.14));
    });
    return { mesh: instanced, colors: new THREE.Color() };
  }, [scene]);
  useFrame(() => {
    const { fire } = scene;
    let changed = false;
    scene.trees.forEach((t, i) => {
      const cell = fire.cellIndexAt(t.x, t.z);
      if (cell < 0) return;
      const kind = fire.layers.kind[cell] ?? 0;
      const scorch = fire.layers.scorchHeight[cell] ?? 0;
      if (kind >= 2) colors.setRGB(0.05, 0.04, 0.035);
      else if (scorch > t.base) colors.setRGB(0.45, 0.3, 0.12);
      else return;
      mesh.setColorAt(i, colors);
      changed = true;
    });
    if (changed && mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

function FireScene() {
  const [scene] = useState(buildScene);
  const [pinnedDone] = useState(() => {
    if (pinned === null) return false;
    const target = Number(pinned);
    while (scene.fire.time < target) scene.fire.step(Math.min(30, target - scene.fire.time), WIND);
    return true;
  });
  useFrame((_, delta) => {
    if (pinnedDone) return;
    scene.fire.step(Math.min(0.1, delta) * speed, WIND);
  });
  return (
    <group>
      <hemisphereLight args={["#dfe8ff", "#4a3f2c", 0.6]} />
      <directionalLight position={[-200, 300, 120]} intensity={2.2} color="#fff0d8" />
      <Ground fuelColor={scene.fuelColor} />
      <Trees scene={scene} />
      <FireLandscapeView fire={scene.fire} heightAt={heightAt} wind={[WIND_SPEED * 0.6, 0]} />
    </group>
  );
}

export const fireDemoGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "fire" },
  scene: {
    renderEntity: () => <group />,
    renderObject: () => <group />,
    environment: () => <FireScene />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: { look: "neutral", backdrop: { background: "#9fb4c8" } },
  camera: { ...demoGame.camera, lens: { frustum: { far: 2500 } } },
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f4f1ea", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>
        Wildfire · Rothermel surface spread, crown fire and spotting · {pinned === null ? `${speed}× real time` : `t = ${pinned} s`}
      </div>
      <div style={{ position: "absolute", bottom: 14, left: 18, fontSize: 11, opacity: 0.9 }}>
        7 m/s wind east · grass and shrub slopes, pine stand on the hill · rock break and river · fuel dried by a hot afternoon
      </div>
    </div>
  ),
  capture: {
    views: {
      state: { look: "40,0,-20", lookFrom: "420,330,0.7" },
      close: { look: "60,10,-40", lookFrom: "170,80,0.9" },
    },
  },
};
