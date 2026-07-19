/**
 * Live specimen: wind over a meadow. ~2600 instanced grass blades are placed by
 * the real `scatter()` and lean every frame toward the real `windField().atPoint`
 * sample — the same two `@jgengine/core/world` functions a shipped game calls.
 * Nothing here fakes the field: a coarse 12×8 grid is sampled from the core wind
 * field each frame and interpolated per blade, so the gust fronts you see ripple
 * are the field's own turbulence scrolling across the area.
 */
import * as THREE from "three";

import { scatter } from "@jgengine/core/world/scatter";
import { windField, type WindField } from "@jgengine/core/world/wind";
import { mountLive } from "../mount";

export interface WindDials {
  speed: number;
  gust: number;
  turbulence: number;
}

export interface WindSpecimen {
  setDials(dials: WindDials): void;
  dispose(): void;
}

const INK = 0x04060c;
const AREA_W = 60;
const AREA_D = 40;
const COUNT = 2600;
const GRID_X = 12;
const GRID_Z = 8;
const UP = new THREE.Vector3(0, 1, 0);

/** Deterministic per-blade pseudo-random in [0, 1) — keeps the meadow identical across renders. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A thin tapered blade rooted at the origin, growing up +Y with a slight forward curve in +Z. */
function bladeGeometry(): THREE.BufferGeometry {
  const seg = 4;
  const halfW = 0.06;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i += 1) {
    const t = i / seg;
    const y = t;
    const w = halfW * (1 - t * 0.86);
    const bend = t * t * 0.16;
    positions.push(-w, y, bend, w, y, bend);
    normals.push(0, 0.35, 1, 0, 0.35, 1);
  }
  for (let i = 0; i < seg; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createWindSpecimen(container: HTMLElement): WindSpecimen {
  // Real deterministic placement from the core scatter primitive.
  const points = scatter({ area: { w: AREA_W, d: AREA_D }, count: COUNT, seed: "meadow", jitter: 0.9 });
  const n = points.length;

  const bx = new Float32Array(n);
  const bz = new Float32Array(n);
  const yaw = new Float32Array(n);
  const hScale = new Float32Array(n);
  const wScale = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    bx[i] = points[i]!.x;
    bz[i] = points[i]!.z;
    yaw[i] = hash01(i * 1.3) * Math.PI * 2;
    hScale[i] = 0.8 + hash01(i * 2.7) * 0.95;
    wScale[i] = 0.85 + hash01(i * 3.9) * 0.4;
  }

  const geo = bladeGeometry();
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, material, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const color = new THREE.Color();
  for (let i = 0; i < n; i += 1) {
    const h = (150 + (hash01(i * 5.1) - 0.5) * 26) / 360;
    const s = 0.42 + hash01(i * 6.3) * 0.18;
    const l = 0.32 + hash01(i * 7.7) * 0.18;
    color.setHSL(h, s, l);
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;

  // Coarse wind grid resampled from the real field each frame, bilinear per blade.
  const gridWX = new Float32Array(GRID_X * GRID_Z);
  const gridWZ = new Float32Array(GRID_X * GRID_Z);
  let field: WindField = windField({ direction: [1, 0.12], speed: 2.6, gust: 1.6, turbulence: 0.6 });

  const scratchM = new THREE.Matrix4();
  const scratchPos = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const qYaw = new THREE.Quaternion();
  const qLean = new THREE.Quaternion();
  const qOut = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  const handle = mountLive(container, {
    fov: 42,
    near: 0.1,
    far: 400,
    frame(_dt, elapsed) {
      // Resample the core wind field on the coarse grid.
      for (let gz = 0; gz < GRID_Z; gz += 1) {
        const wz = -AREA_D / 2 + (gz / (GRID_Z - 1)) * AREA_D;
        for (let gx = 0; gx < GRID_X; gx += 1) {
          const wx = -AREA_W / 2 + (gx / (GRID_X - 1)) * AREA_W;
          const [fx, fz] = field.atPoint(wx, wz, elapsed);
          const idx = gz * GRID_X + gx;
          gridWX[idx] = fx;
          gridWZ[idx] = fz;
        }
      }
      // Lean each blade toward its interpolated wind vector.
      for (let i = 0; i < n; i += 1) {
        const u = ((bx[i]! + AREA_W / 2) / AREA_W) * (GRID_X - 1);
        const v = ((bz[i]! + AREA_D / 2) / AREA_D) * (GRID_Z - 1);
        const x0 = Math.min(GRID_X - 2, Math.max(0, Math.floor(u)));
        const z0 = Math.min(GRID_Z - 2, Math.max(0, Math.floor(v)));
        const tx = u - x0;
        const tz = v - z0;
        const i00 = z0 * GRID_X + x0;
        const i10 = i00 + 1;
        const i01 = i00 + GRID_X;
        const i11 = i01 + 1;
        const wx = lerp2(gridWX[i00]!, gridWX[i10]!, gridWX[i01]!, gridWX[i11]!, tx, tz);
        const wz = lerp2(gridWZ[i00]!, gridWZ[i10]!, gridWZ[i01]!, gridWZ[i11]!, tx, tz);
        const strength = Math.hypot(wx, wz);
        qYaw.setFromAxisAngle(UP, yaw[i]!);
        if (strength > 1e-4) {
          const dirx = wx / strength;
          const dirz = wz / strength;
          axis.set(dirz, 0, -dirx);
          const angle = Math.min(1.2, strength * 0.24);
          qLean.setFromAxisAngle(axis, angle);
          qOut.multiplyQuaternions(qLean, qYaw);
        } else {
          qOut.copy(qYaw);
        }
        scratchScale.set(wScale[i]!, hScale[i]!, wScale[i]!);
        scratchPos.set(bx[i]!, 0, bz[i]!);
        scratchM.compose(scratchPos, qOut, scratchScale);
        mesh.setMatrixAt(i, scratchM);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  });

  handle.scene.fog = new THREE.FogExp2(INK, 0.03);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(AREA_W * 2, AREA_D * 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x05090c, roughness: 1, metalness: 0 }),
  );
  ground.position.y = -0.01;
  handle.scene.add(ground);
  handle.scene.add(mesh);

  handle.scene.add(new THREE.HemisphereLight(0x6f9784, 0x05070d, 0.75));
  const key = new THREE.DirectionalLight(0xc4f0d8, 1.15);
  key.position.set(-9, 7, 12);
  handle.scene.add(key);

  handle.camera.position.set(0, 2.4, 27);
  handle.camera.lookAt(0, 1.3, -2);

  handle.invalidate();

  return {
    setDials(dials) {
      field = windField({
        direction: [1, 0.12],
        speed: dials.speed,
        gust: dials.gust,
        gustFrequency: 0.18,
        turbulence: dials.turbulence,
        seed: "meadow",
      });
      handle.invalidate();
    },
    dispose: handle.dispose,
  };
}

/** Bilinear blend of the four grid corners. */
function lerp2(a: number, b: number, c: number, d: number, tx: number, tz: number): number {
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}
