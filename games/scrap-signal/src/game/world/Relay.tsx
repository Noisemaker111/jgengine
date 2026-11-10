import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useGameContext } from "@jgengine/react/provider";
import { useRef } from "react";

import { RELAY, relayStore, type RelayState } from "../relay";

/** Original salvage antenna: copper coils, ceramic insulators, riveted feet and a split tuning fork. */
export function salvageRelayDraw(ctx: GameContext, getState: () => RelayState): EngineDraw {
  const group = new THREE.Group();
  const y = ctx.world.groundHeightAt(RELAY.x, RELAY.z);
  group.position.set(RELAY.x, y, RELAY.z);

  const iron = new THREE.MeshStandardMaterial({ color: "#293a40", roughness: 0.7, metalness: 0.45 });
  const copper = new THREE.MeshStandardMaterial({ color: "#d49c6c", metalness: 0.65, roughness: 0.4 });
  const ceramic = new THREE.MeshStandardMaterial({ color: "#f1dec4", roughness: 0.55 });
  const coil = new THREE.MeshStandardMaterial({ color: "#b96537", roughness: 0.32, metalness: 0.65 });
  const foot = new THREE.MeshStandardMaterial({ color: "#b86334", metalness: 0.45, roughness: 0.7 });
  const tip = new THREE.MeshStandardMaterial({ color: "#dfbf76", metalness: 0.65, roughness: 0.4 });
  const fork = new THREE.MeshStandardMaterial({ color: "#dd9b55", metalness: 0.55, roughness: 0.38 });
  const box = new THREE.MeshStandardMaterial({ color: "#28383e", metalness: 0.4, roughness: 0.7 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: "#64dbea", side: THREE.DoubleSide });
  const ringMaterial = new THREE.MeshBasicMaterial({ color: "#64dbea", side: THREE.DoubleSide });
  const lightMaterial = new THREE.MeshStandardMaterial({ color: "#64dbea", emissive: "#64dbea", emissiveIntensity: 1.5 });
  const arcMaterial = new THREE.MeshStandardMaterial({ color: "#64dbea", emissive: "#64dbea", emissiveIntensity: 1 });
  const rangeMaterial = new THREE.MeshBasicMaterial({ color: "#64dbea", transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const waveMaterials = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: "#315760" }));
  const stateMaterials = [glowMaterial, ringMaterial, lightMaterial, arcMaterial, rangeMaterial];

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number] = [0, 0, 0], rotation: [number, number, number] = [0, 0, 0], castShadow = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  add(new THREE.CylinderGeometry(2.2, 2.5, 0.24, 12), iron, [0, 0.12, 0]);
  add(new THREE.RingGeometry(2, 2.15, 48), ringMaterial, [0, 0.26, 0], [-Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.23, 0.42, 2.6, 8), copper, [0, 1.45, 0], [0, 0, 0], true);
  for (const h of [0.6, 1.1, 1.6, 2.1]) {
    const collar = new THREE.Group();
    collar.position.y = h;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.13, 12), ceramic);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.065, 8, 32), coil);
    ring.rotation.x = Math.PI / 2;
    collar.add(disc, ring);
    group.add(collar);
  }
  for (let i = 0; i < 4; i += 1) {
    const footGroup = new THREE.Group();
    footGroup.rotation.y = (i * Math.PI) / 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.17, 0.22), foot);
    leg.position.set(1.1, 0.43, 0);
    leg.rotation.z = -0.22;
    leg.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 6), tip);
    cap.position.set(1.8, 0.3, 0);
    footGroup.add(leg, cap);
    group.add(footGroup);
  }
  const rotor = new THREE.Group();
  rotor.position.y = 2.9;
  for (const side of [-1, 1]) {
    const tine = new THREE.Group();
    tine.position.x = side * 0.67;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.24), fork);
    bar.castShadow = true;
    const jewel = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.55, 0.28), lightMaterial);
    jewel.position.y = 0.55;
    tine.add(bar, jewel);
    rotor.add(tine);
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.25), fork);
  crossbar.position.y = -0.7;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 8, 48, Math.PI * 1.7), arcMaterial);
  arc.rotation.x = Math.PI / 2;
  rotor.add(crossbar, arc);
  group.add(rotor);
  const console_ = new THREE.Group();
  console_.position.set(0, 0.95, 1.25);
  console_.rotation.x = -0.35;
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.65, 0.22), box);
  boxMesh.castShadow = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.34), glowMaterial);
  screen.position.z = 0.12;
  console_.add(boxMesh, screen);
  for (let i = 0; i < 3; i += 1) {
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.23), waveMaterials[i]!);
    led.position.set(-0.3 + i * 0.3, 0, 0.125);
    console_.add(led);
  }
  group.add(console_);
  const range = add(new THREE.RingGeometry(RELAY.radius - 0.15, RELAY.radius, 96), rangeMaterial, [0, 0.09, 0], [-Math.PI / 2, 0, 0]);
  range.visible = false;

  const ownedGeometries: THREE.BufferGeometry[] = [];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) ownedGeometries.push(object.geometry);
  });
  const ownedMaterials = [iron, copper, ceramic, coil, foot, tip, fork, box, glowMaterial, ringMaterial, lightMaterial, arcMaterial, rangeMaterial, ...waveMaterials];
  let lastColor = "";
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame(state: EngineFrameState) {
      const relay = getState();
      const live = relay.phase === "defend" || relay.phase === "upload";
      const color = relay.rewarded ? "#7ef1bf" : live ? "#ffbb55" : "#64dbea";
      if (color !== lastColor) {
        lastColor = color;
        for (const material of stateMaterials) {
          if (material instanceof THREE.MeshBasicMaterial) material.color.set(color);
          else {
            material.color.set(color);
            material.emissive.set(color);
          }
        }
      }
      range.visible = live;
      waveMaterials.forEach((material, i) => material.color.set(i < relay.wave ? "#132d2e" : "#315760"));
      if (!ctx.time.isPaused()) rotor.rotation.y += state.delta * (live ? 1.1 : 0.2);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}

export function SalvageRelay() {
  const ctx = useGameContext();
  const latest = useRef({ ctx });
  latest.current = { ctx };
  useEngineDraw(() => salvageRelayDraw(latest.current.ctx, () => relayStore.read(latest.current.ctx)), []);
  return null;
}
