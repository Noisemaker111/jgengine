/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";
import { useRef } from "@jgengine/core/ui/jsx";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerSceneKind, type SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "@jgengine/core/scene/sceneKindRenderers.draw";

import { CAR_SHADE_KIND, CRACK_KIND, HOSE_KIND, HOT_KIND, MOWER_LANE_KIND, PATIO_KIND } from "../yard";

/**
 * The backyard's three authored studios, registered through the engine's scene-kind seam so they are
 * placed, moved and saved in the editor like any built-in kind and drawn from `editor.scene.json`:
 *
 * - `garden_hose` — an open path drawn as a fat green rubber tube that hugs the lawn;
 * - `mower_lane` — an open path drawn as the shorn stripe the mower leaves, with warning flags;
 * - `patio_stone` — a box volume drawn as a weathered concrete paver (the yard's plateaus).
 *
 * Gameplay reads the same objects through `yard.ts`. One adopter, so the kinds stay in this game;
 * a generic tube/paver studio is the upstream seam if a second game wants them.
 */

const HOSE_SCHEMA = {
  fields: [
    { type: "color" as const, key: "color", label: "rubber", default: "#2f9e3a" },
    { type: "color" as const, key: "stripe", label: "stripe", default: "#ffd23f" },
  ],
};
const LANE_SCHEMA = { fields: [{ type: "color" as const, key: "color", label: "cut grass", default: "#b9d77a" }] };
const PATIO_SCHEMA = {
  fields: [
    { type: "color" as const, key: "color", label: "stone", default: "#c9c2b4" },
    { type: "number" as const, key: "height", label: "height", min: 0.05, step: 0.05, default: 0.45 },
  ],
};

registerSceneKind({ kind: HOSE_KIND, target: "path", pathShape: "line", label: "Garden hose", addCategory: "Backyard", accent: "#2f9e3a", schema: HOSE_SCHEMA });
registerSceneKind({ kind: MOWER_LANE_KIND, target: "path", pathShape: "line", label: "Mower lane", addCategory: "Backyard", accent: "#ff5a3c", schema: LANE_SCHEMA });
registerSceneKind({ kind: HOT_KIND, target: "volume", label: "Hot pavement", addCategory: "Backyard", accent: "#8d8a86", schema: { fields: [{ type: "color" as const, key: "color", label: "asphalt", default: "#3e3c3a" }] } });
registerSceneKind({ kind: CRACK_KIND, target: "path", pathShape: "line", label: "Sidewalk crack", addCategory: "Backyard", accent: "#3fa0c8", schema: { fields: [{ type: "number" as const, key: "width", label: "width", min: 0.5, step: 0.1, default: 2.4 }] } });
registerSceneKind({ kind: CAR_SHADE_KIND, target: "path", pathShape: "line", label: "Car shade track", addCategory: "Backyard", accent: "#334", schema: { fields: [{ type: "number" as const, key: "radius", label: "radius", min: 1, step: 0.5, default: 9 }, { type: "number" as const, key: "period", label: "period (s)", min: 10, step: 5, default: 120 }] } });
registerSceneKind({ kind: PATIO_KIND, target: "volume", label: "Patio stone", addCategory: "Backyard", accent: "#c9c2b4", schema: PATIO_SCHEMA });

function str(meta: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value : fallback;
}

function num(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A soft rubber tube that sits on the lawn along the authored path, with a painted stripe on top. */
function hoseDraw(object: SceneKindObject, context: SceneKindRenderContext, width: number): EngineDraw {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  return {
    mount(state: EngineFrameState) {
      const points = (object.points ?? []).map((p) => new THREE.Vector3(p.x, 0, p.z));
      if (points.length < 2) return;
      const radius = width / 2;
      const flat = new THREE.CatmullRomCurve3(points, false, "centripetal");
      const samples = flat.getSpacedPoints(Math.max(24, Math.round(flat.getLength() * 1.5)));
      for (const p of samples) p.y = context.field.sampleHeight(p.x, p.z) + radius * 0.82;
      const curve = new THREE.CatmullRomCurve3(samples);
      const segments = samples.length * 2;
      const tube = new THREE.TubeGeometry(curve, segments, radius, 14, false);
      const stripe = new THREE.TubeGeometry(curve, segments, radius * 0.18, 6, false);
      stripe.translate(0, radius * 0.86, 0);
      const rubber = new THREE.MeshStandardMaterial({ color: str(object.meta, "color", "#2f9e3a"), roughness: 0.35, metalness: 0.02 });
      const paint = new THREE.MeshStandardMaterial({ color: str(object.meta, "stripe", "#ffd23f"), roughness: 0.5 });
      const tubeMesh = new THREE.Mesh(tube, rubber);
      tubeMesh.castShadow = true;
      tubeMesh.receiveShadow = true;
      const stripeMesh = new THREE.Mesh(stripe, paint);
      // Brass couplings every so often read the scale: this is a hose, and we are tiny.
      const ring = new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, radius * 0.7, 16);
      const brass = new THREE.MeshStandardMaterial({ color: "#d6a83a", roughness: 0.25, metalness: 0.8 });
      for (const t of [0.33, 0.66]) {
        const at = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t);
        const coupling = new THREE.Mesh(ring, brass);
        coupling.position.copy(at);
        coupling.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        coupling.castShadow = true;
        group.add(coupling);
      }
      group.add(tubeMesh, stripeMesh);
      disposables.push(tube, stripe, rubber, paint, ring, brass);
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const d of disposables) d.dispose();
    },
  };
}

/** The mower's shorn stripe: paler, shorter grass between two rows of little red warning flags. */
function laneDraw(object: SceneKindObject, context: SceneKindRenderContext, width: number): EngineDraw {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  return {
    mount(state: EngineFrameState) {
      const points = object.points ?? [];
      const a = points[0];
      const b = points[points.length - 1];
      if (a === undefined || b === undefined) return;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const plane = new THREE.PlaneGeometry(length, width, Math.max(8, Math.round(length / 2)), 4);
      plane.rotateX(-Math.PI / 2);
      const angle = Math.atan2(b.z - a.z, b.x - a.x);
      plane.rotateY(-angle);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const pos = plane.getAttribute("position");
      for (let i = 0; i < pos.count; i += 1) pos.setY(i, context.field.sampleHeight(cx + pos.getX(i), cz + pos.getZ(i)) + 0.04);
      plane.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: str(object.meta, "color", "#b9d77a"), roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
      const stripe = new THREE.Mesh(plane, material);
      stripe.position.set(cx, 0, cz);
      stripe.receiveShadow = true;
      group.add(stripe);
      const pole = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5);
      const flag = new THREE.PlaneGeometry(0.6, 0.4);
      flag.translate(0.3, 0.5, 0);
      const poleMat = new THREE.MeshStandardMaterial({ color: "#f4f1ea" });
      const flagMat = new THREE.MeshStandardMaterial({ color: "#ff3b2f", side: THREE.DoubleSide, emissive: "#ff3b2f", emissiveIntensity: 0.25 });
      const nx = -Math.sin(angle);
      const nz = Math.cos(angle);
      const count = Math.floor(length / 9);
      for (let i = 0; i <= count; i += 1) {
        const t = i / Math.max(1, count);
        for (const side of [-1, 1]) {
          const x = a.x + (b.x - a.x) * t + nx * side * (width / 2 + 0.6);
          const z = a.z + (b.z - a.z) * t + nz * side * (width / 2 + 0.6);
          const y = context.field.sampleHeight(x, z);
          const p = new THREE.Mesh(pole, poleMat);
          p.position.set(x, y + 0.7, z);
          const f = new THREE.Mesh(flag, flagMat);
          f.position.set(x, y + 0.9, z);
          f.rotation.y = -angle;
          group.add(p, f);
        }
      }
      disposables.push(plane, material, pole, flag, poleMat, flagMat);
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const d of disposables) d.dispose();
    },
  };
}

/** A concrete paver with bevelled edges and a little moss in its seams: the yard's plateaus. */
function patioDraw(object: SceneKindObject, context: SceneKindRenderContext): EngineDraw {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  return {
    mount(state: EngineFrameState) {
      const center = object.center ?? { x: 0, y: 0, z: 0 };
      const half = object.halfExtents ?? { x: 4, y: 0.5, z: 4 };
      const height = num(object.meta, "height", 0.45);
      let base = Infinity;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const) {
        base = Math.min(base, context.field.sampleHeight(center.x + dx * half.x, center.z + dz * half.z));
      }
      const slab = new THREE.BoxGeometry(half.x * 2, height + 0.8, half.z * 2, 6, 1, 6);
      const pos = slab.getAttribute("position");
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, pos.getY(i) + Math.sin(x * 1.7 + z * 0.9) * 0.03);
      }
      slab.computeVertexNormals();
      const stone = new THREE.MeshStandardMaterial({ color: str(object.meta, "color", "#c9c2b4"), roughness: 0.95 });
      const mesh = new THREE.Mesh(slab, stone);
      mesh.position.set(center.x, base + (height - 0.8) / 2 + 0.4 - 0.4, center.z);
      mesh.position.y = base - 0.4 + (height + 0.8) / 2;
      mesh.rotation.y = object.rotationY ?? 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const moss = new THREE.MeshStandardMaterial({ color: "#4f8a2a", roughness: 1 });
      const tuft = new THREE.SphereGeometry(0.35, 7, 5);
      tuft.scale(1, 0.4, 1);
      for (let i = 0; i < 6; i += 1) {
        const a = i * 1.9;
        const m = new THREE.Mesh(tuft, moss);
        m.position.set(center.x + Math.cos(a) * half.x * 1.02, base + 0.05, center.z + Math.sin(a) * half.z * 1.02);
        group.add(m);
      }
      group.add(mesh);
      disposables.push(slab, stone, moss, tuft);
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const d of disposables) d.dispose();
    },
  };
}

/** Sun-baked asphalt: a dark, slightly glossy slab with oil stains, hugging the ground. */
function pavementDraw(object: SceneKindObject, context: SceneKindRenderContext): EngineDraw {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  return {
    mount(state: EngineFrameState) {
      const center = object.center ?? { x: 0, y: 0, z: 0 };
      const half = object.halfExtents ?? { x: 8, y: 0.5, z: 8 };
      const plane = new THREE.PlaneGeometry(half.x * 2, half.z * 2, Math.max(4, Math.round(half.x)), Math.max(4, Math.round(half.z)));
      plane.rotateX(-Math.PI / 2);
      const pos = plane.getAttribute("position");
      for (let i = 0; i < pos.count; i += 1) pos.setY(i, context.field.sampleHeight(center.x + pos.getX(i), center.z + pos.getZ(i)) + 0.1);
      plane.computeVertexNormals();
      const asphalt = new THREE.MeshStandardMaterial({ color: str(object.meta, "color", "#3e3c3a"), roughness: 0.7, metalness: 0.05 });
      const mesh = new THREE.Mesh(plane, asphalt);
      mesh.position.set(center.x, 0, center.z);
      mesh.receiveShadow = true;
      group.add(mesh);
      const stain = new THREE.MeshStandardMaterial({ color: "#2a2826", roughness: 0.25, transparent: true, opacity: 0.6, depthWrite: false });
      const disc = new THREE.CircleGeometry(1, 20);
      disc.rotateX(-Math.PI / 2);
      for (let i = 0; i < 4; i += 1) {
        const m = new THREE.Mesh(disc, stain);
        const x = center.x + Math.sin(i * 2.3) * half.x * 0.5;
        const z = center.z + Math.cos(i * 1.7) * half.z * 0.6;
        m.position.set(x, context.field.sampleHeight(x, z) + 0.13, z);
        m.scale.set(2.5 + i, 1, 1.6 + i * 0.7);
        group.add(m);
      }
      disposables.push(plane, asphalt, stain, disc);
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const d of disposables) d.dispose();
    },
  };
}

/** A sidewalk crack: a dark, damp seam across the pavement with moss along its lips — a cool lane. */
function crackDraw(object: SceneKindObject, context: SceneKindRenderContext, width: number): EngineDraw {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  return {
    mount(state: EngineFrameState) {
      const points = object.points ?? [];
      const seam = new THREE.MeshStandardMaterial({ color: "#1d2a2c", roughness: 0.9 });
      const moss = new THREE.MeshStandardMaterial({ color: "#4f9a2c", roughness: 1 });
      const tuft = new THREE.SphereGeometry(0.4, 6, 4);
      tuft.scale(1, 0.5, 1);
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const strip = new THREE.PlaneGeometry(width, length, 1, Math.max(2, Math.round(length)));
        strip.rotateX(-Math.PI / 2);
        strip.rotateY(-Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2);
        const cx = (a.x + b.x) / 2;
        const cz = (a.z + b.z) / 2;
        const pos = strip.getAttribute("position");
        for (let k = 0; k < pos.count; k += 1) pos.setY(k, context.field.sampleHeight(cx + pos.getX(k), cz + pos.getZ(k)) + 0.16);
        strip.computeVertexNormals();
        const mesh = new THREE.Mesh(strip, seam);
        mesh.position.set(cx, 0, cz);
        group.add(mesh);
        disposables.push(strip);
        const steps = Math.floor(length / 2.5);
        for (let k = 0; k < steps; k += 1) {
          const t = (k + 0.5) / steps;
          const side = k % 2 === 0 ? 1 : -1;
          const nx = -(b.z - a.z) / length;
          const nz = (b.x - a.x) / length;
          const x = a.x + (b.x - a.x) * t + nx * side * width * 0.55;
          const z = a.z + (b.z - a.z) * t + nz * side * width * 0.55;
          const m = new THREE.Mesh(tuft, moss);
          m.position.set(x, context.field.sampleHeight(x, z) + 0.2, z);
          group.add(m);
        }
      }
      disposables.push(seam, moss, tuft);
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const d of disposables) d.dispose();
    },
  };
}

type DrawFactory = (object: SceneKindObject, context: SceneKindRenderContext) => EngineDraw;

function KindObject({ object, context, factory }: { object: SceneKindObject; context: SceneKindRenderContext; factory: DrawFactory }) {
  const latest = useRef({ object, context });
  latest.current = { object, context };
  return <EngineDrawMount create={() => factory(latest.current.object, latest.current.context)} deps={[object, context.field]} />;
}

function widthOf(object: SceneKindObject, fallback: number): number {
  const width = (object as SceneKindObject & { width?: number }).width;
  return typeof width === "number" && width > 0 ? width : num(object.meta, "width", fallback);
}

function registerRenderer(kind: string, factory: DrawFactory): void {
  registerSceneKindRenderer(kind, ({ objects, context }) => (
    <>
      {objects.map((object) => <KindObject key={object.id} object={object} context={context} factory={factory} />)}
    </>
  ));
}

registerRenderer(HOSE_KIND, (object, context) => hoseDraw(object, context, widthOf(object, 2.6)));
registerRenderer(MOWER_LANE_KIND, (object, context) => laneDraw(object, context, widthOf(object, 8)));
registerRenderer(PATIO_KIND, patioDraw);
registerRenderer(HOT_KIND, pavementDraw);
registerRenderer(CRACK_KIND, (object, context) => crackDraw(object, context, widthOf(object, 2.4)));
