/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { kleptoNests } from "../creatures";

/** Nests drawn at once; more Klepto thieves than this keep their loot unseen. */
const MAX_NESTS = 8;

/**
 * A Klepto's nest of stolen goods where it last blinked to: a heap of crates and canisters that grows with
 * every stack it holds, a scrap of glowing cable on top so it catches the eye at dusk.
 */
export function kleptoNestsDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const crate = new THREE.BoxGeometry(0.5, 0.4, 0.4);
  const can = new THREE.CylinderGeometry(0.16, 0.16, 0.45, 10);
  const wood = new THREE.MeshStandardMaterial({ color: "#7a5a36", roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: "#8f9aa3", metalness: 0.7, roughness: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: "#b06bff", emissive: "#b06bff", emissiveIntensity: 1.8, toneMapped: false });
  const nests: THREE.Group[] = [];
  for (let n = 0; n < MAX_NESTS; n += 1) {
    const nest = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const piece = new THREE.Mesh(i % 2 === 0 ? crate : can, i % 2 === 0 ? wood : metal);
      const angle = i * 2.1;
      piece.position.set(Math.cos(angle) * 0.45, 0.2 + Math.floor(i / 3) * 0.38, Math.sin(angle) * 0.45);
      piece.rotation.y = angle;
      piece.castShadow = true;
      nest.add(piece);
    }
    const cable = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 16), glow);
    cable.rotation.x = Math.PI / 2;
    cable.position.y = 0.9;
    nest.add(cable);
    nest.visible = false;
    group.add(nest);
    nests.push(nest);
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const live = kleptoNests(ctx);
      nests.forEach((nest, index) => {
        const entry = live[index];
        nest.visible = entry !== undefined;
        if (entry === undefined) return;
        nest.position.set(entry.at[0] + 1.2, ctx.world.groundHeightAt(entry.at[0] + 1.2, entry.at[2]), entry.at[2]);
        // Show as many pieces as it holds stacks, up to the heap's six.
        nest.children.forEach((child, piece) => {
          child.visible = piece >= 6 || piece < entry.stacks;
        });
      });
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      for (const geometry of [crate, can]) geometry.dispose();
      for (const material of [wood, metal, glow]) material.dispose();
    },
  };
}

export function KleptoNests({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => kleptoNestsDraw(latest.current), []);
  return null;
}
