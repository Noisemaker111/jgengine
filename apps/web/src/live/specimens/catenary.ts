/**
 * Live specimen: a cable that actually hangs. Two poles stand on a ground plane and
 * a glowing festoon cord is lofted between their tips by the real `catenaryCurve()`
 * from `@jgengine/core/world/catenary` — the true cosh hyperbolic curve, not a bezier.
 * Drag either pole (raycast against the ground) and the cable re-solves from the live
 * anchor positions; the slack dial is the extra length as a fraction of the span.
 */
import * as THREE from "three";

import { catenaryCurve } from "@jgengine/core/world/catenary";
import { mountLive } from "../mount";

export interface CatenaryDials {
  slack: number;
}

export interface CatenarySpecimen {
  setDials(dials: CatenaryDials): void;
  dispose(): void;
}

const INK = 0x04060c;
const POLE_H = 6;
const SEGMENTS = 56;
const BULB_COUNT = Math.floor(SEGMENTS / 4) + 1;

interface Anchor {
  x: number;
  z: number;
  minX: number;
  maxX: number;
}

export function createCatenarySpecimen(container: HTMLElement): CatenarySpecimen {
  const anchorA: Anchor = { x: -8, z: 0, minX: -14, maxX: -1.5 };
  const anchorB: Anchor = { x: 8, z: 0, minX: 1.5, maxX: 14 };
  let slack = 0.22;
  let dirty = true;

  const poleGeo = new THREE.CylinderGeometry(0.16, 0.2, POLE_H, 12);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x141922, roughness: 0.6, metalness: 0.3 });
  const poleA = new THREE.Mesh(poleGeo, poleMat);
  const poleB = new THREE.Mesh(poleGeo, poleMat);
  poleA.position.set(anchorA.x, POLE_H / 2, anchorA.z);
  poleB.position.set(anchorB.x, POLE_H / 2, anchorB.z);

  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x0b1a1f,
    emissive: new THREE.Color(0x22d3ee),
    emissiveIntensity: 0.7,
    roughness: 0.5,
    metalness: 0.1,
  });
  const cable = new THREE.Mesh(new THREE.BufferGeometry(), cableMat);

  const bulbGeo = new THREE.SphereGeometry(0.13, 12, 10);
  const bulbGroup = new THREE.Group();
  const bulbMats: THREE.MeshStandardMaterial[] = [];
  const bulbPhase: number[] = [];
  for (let i = 0; i < BULB_COUNT; i += 1) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffe0ad,
      emissive: new THREE.Color(0xffb45a),
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });
    bulbMats.push(mat);
    bulbPhase.push((i / BULB_COUNT) * Math.PI * 2);
    bulbGroup.add(new THREE.Mesh(bulbGeo, mat));
  }

  const rebuild = (): void => {
    const pts = catenaryCurve([anchorA.x, POLE_H, anchorA.z], [anchorB.x, POLE_H, anchorB.z], slack, SEGMENTS);
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const next = new THREE.TubeGeometry(curve, SEGMENTS, 0.05, 8, false);
    cable.geometry.dispose();
    cable.geometry = next;
    const bulbs = bulbGroup.children;
    for (let i = 0; i < BULB_COUNT; i += 1) {
      const p = pts[Math.min(pts.length - 1, i * 4)]!;
      bulbs[i]!.position.set(p[0], p[1], p[2]);
    }
  };

  const handle = mountLive(container, {
    fov: 46,
    near: 0.1,
    far: 400,
    frame(_dt, elapsed) {
      if (dirty) {
        rebuild();
        dirty = false;
      }
      if (!handle.reducedMotion) {
        for (let i = 0; i < BULB_COUNT; i += 1) {
          bulbMats[i]!.emissiveIntensity = 1.25 + Math.sin(elapsed * 2.2 + bulbPhase[i]!) * 0.4;
        }
      }
    },
    onDispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.style.cursor = "";
      poleGeo.dispose();
      poleMat.dispose();
      bulbGeo.dispose();
    },
  });

  handle.scene.fog = new THREE.FogExp2(INK, 0.02);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x06090e, roughness: 1, metalness: 0 }),
  );
  handle.scene.add(ground);
  handle.scene.add(poleA, poleB, cable, bulbGroup);

  handle.scene.add(new THREE.HemisphereLight(0x415164, 0x05070d, 0.6));
  const key = new THREE.DirectionalLight(0xbcd0e6, 0.9);
  key.position.set(-10, 16, 12);
  handle.scene.add(key);

  handle.camera.position.set(0, 6, 21);
  handle.camera.lookAt(0, 3.6, 0);

  // --- pointer interaction: drag a pole across the ground plane ---
  const canvas = handle.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let dragging: Anchor | null = null;

  const setNdc = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const onPointerDown = (e: PointerEvent): void => {
    setNdc(e);
    raycaster.setFromCamera(ndc, handle.camera);
    const hits = raycaster.intersectObjects([poleA, poleB], false);
    if (hits.length === 0) return;
    dragging = hits[0]!.object === poleA ? anchorA : anchorB;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent): void => {
    setNdc(e);
    raycaster.setFromCamera(ndc, handle.camera);
    if (dragging === null) {
      const hits = raycaster.intersectObjects([poleA, poleB], false);
      canvas.style.cursor = hits.length > 0 ? "grab" : "default";
      return;
    }
    if (raycaster.ray.intersectPlane(groundPlane, hit) === null) return;
    dragging.x = Math.min(dragging.maxX, Math.max(dragging.minX, hit.x));
    dragging.z = Math.min(6, Math.max(-6, hit.z));
    const pole = dragging === anchorA ? poleA : poleB;
    pole.position.set(dragging.x, POLE_H / 2, dragging.z);
    dirty = true;
    if (handle.reducedMotion) handle.invalidate();
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (dragging === null) return;
    dragging = null;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "grab";
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);

  handle.invalidate();

  return {
    setDials(dials) {
      slack = dials.slack;
      dirty = true;
      handle.invalidate();
    },
    dispose: handle.dispose,
  };
}
