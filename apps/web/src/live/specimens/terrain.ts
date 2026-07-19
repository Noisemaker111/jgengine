/**
 * Live specimen: seeded terrain. A 90×90-segment plane is displaced by the real
 * `fractalNoise()` from `@jgengine/core/world/terrain` — every vertex's height is
 * one call into the core value-noise fractal. Height drives the vertex color ramp
 * (deep ink → emerald → pale slate), normals are recomputed, and the whole field
 * turns slowly. Change octaves / frequency / ridged / seed and the displacement is
 * rebuilt in place from the same function a shipped game bakes into its heightfield.
 */
import * as THREE from "three";

import { fractalNoise } from "@jgengine/core/world/terrain";
import { mountLive } from "../mount";

export interface TerrainDials {
  frequency: number;
  octaves: number;
  ridged: boolean;
  seed: number;
}

export interface TerrainSpecimen {
  setDials(dials: TerrainDials): void;
  dispose(): void;
}

const INK = 0x04060c;
const SEGMENTS = 90;
const DOMAIN = 5; // local sample extent → coords in [-2.5, 2.5], the range the dials read well over
const WORLD_SCALE = 9; // blows the sample domain up to a ~45m world footprint
const V_SCALE = 6; // vertical relief in world units per unit of noise

const INK_LOW = new THREE.Color(0x0a1018);
const EMERALD_MID = new THREE.Color(0x2f9e73);
const SLATE_HIGH = new THREE.Color(0xc6d2e2);

export function createTerrainSpecimen(container: HTMLElement): TerrainSpecimen {
  const geo = new THREE.PlaneGeometry(DOMAIN, DOMAIN, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2); // lie flat: local x/z in [-2.5, 2.5], y is displacement
  const position = geo.attributes.position as THREE.BufferAttribute;
  const colors = new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3);
  geo.setAttribute("color", colors);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.set(WORLD_SCALE, V_SCALE, WORLD_SCALE);

  const turntable = new THREE.Group();
  turntable.rotation.y = 0.5;
  turntable.add(mesh);

  const scratch = new THREE.Color();

  const displace = (dials: TerrainDials): void => {
    const cfg = {
      seed: dials.seed,
      frequency: dials.frequency,
      octaves: Math.max(1, Math.round(dials.octaves)),
      lacunarity: 2,
      persistence: 0.5,
      ridged: dials.ridged,
    };
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const h = fractalNoise(x, z, cfg);
      position.setY(i, h);
      const t = h * 0.5 + 0.5;
      if (t < 0.5) scratch.copy(INK_LOW).lerp(EMERALD_MID, t * 2);
      else scratch.copy(EMERALD_MID).lerp(SLATE_HIGH, (t - 0.5) * 2);
      colors.setXYZ(i, scratch.r, scratch.g, scratch.b);
    }
    position.needsUpdate = true;
    colors.needsUpdate = true;
    geo.computeVertexNormals();
  };

  const handle = mountLive(container, {
    fov: 38,
    near: 0.1,
    far: 400,
    frame(dt, _elapsed) {
      if (!handle.reducedMotion) turntable.rotation.y += dt * 0.14;
    },
  });

  handle.scene.fog = new THREE.FogExp2(INK, 0.022);
  handle.scene.add(turntable);

  handle.scene.add(new THREE.HemisphereLight(0x5a6b82, 0x05070d, 0.6));
  const key = new THREE.DirectionalLight(0xdfe9f5, 1.15);
  key.position.set(-18, 26, 14);
  handle.scene.add(key);
  const rim = new THREE.DirectionalLight(0x22d3ee, 0.28);
  rim.position.set(14, 9, -16);
  handle.scene.add(rim);

  handle.camera.position.set(0, 24, 42);
  handle.camera.lookAt(0, -1, 0);

  displace({ frequency: 1.1, octaves: 4, ridged: false, seed: 1337 });
  handle.invalidate();

  return {
    setDials(dials) {
      displace(dials);
      handle.invalidate();
    },
    dispose: handle.dispose,
  };
}
