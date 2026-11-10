import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { lightBeamDraw } from "@jgengine/core/map/LightBeam.draw";
import { useRef } from "@jgengine/core/ui/jsx";

import { supplyDrops } from "../supplyDrops";

/** Tall enough to see over the redwoods from across the island, the way ARK's beams are. */
const BEAM_HEIGHT = 220;

/**
 * Supply crates: a banded metal crate under a canopy while it falls, set down on the ground once landed, and a beam of
 * its tier's colour rising from it to find it by.
 */
export function supplyDropsDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const crateGeometry = new THREE.BoxGeometry(1.4, 1.2, 1.4);
  const bandGeometry = new THREE.BoxGeometry(1.46, 0.14, 1.46);
  const crateMaterial = new THREE.MeshStandardMaterial({ color: "#8d949c", roughness: 0.6, metalness: 0 });
  const canopyGeometry = new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopyMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const bandMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const canopyMaterialFor = (color: string) => {
    let material = canopyMaterials.get(color);
    if (material === undefined) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
      canopyMaterials.set(color, material);
    }
    return material;
  };
  const bandMaterialFor = (color: string) => {
    let material = bandMaterials.get(color);
    if (material === undefined) {
      material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.5 });
      bandMaterials.set(color, material);
    }
    return material;
  };
  interface DropParts { id: string; holder: THREE.Group; beam: EngineDraw; state: EngineFrameState | null }
  let parts: DropParts[] = [];
  let drawn = "";
  const rebuild = (state: EngineFrameState) => {
    const drops = supplyDrops(ctx);
    const key = drops.map((drop) => `${drop.id}:${drop.landed}`).join(",");
    if (key === drawn) return;
    drawn = key;
    for (const part of parts) {
      if (part.state !== null) part.beam.dispose?.(part.state);
      group.remove(part.holder);
    }
    parts = drops.map((drop) => {
      const holder = new THREE.Group();
      holder.position.set(drop.position[0], drop.position[1], drop.position[2]);
      const crate = new THREE.Mesh(crateGeometry, crateMaterial);
      crate.position.y = 0.6;
      crate.castShadow = true;
      crate.receiveShadow = true;
      const bands = [0.25, 0.95].map((y) => {
        const band = new THREE.Mesh(bandGeometry, bandMaterialFor(drop.color));
        band.position.y = y;
        return band;
      });
      let canopy: THREE.Mesh | null = null;
      if (!drop.landed) {
        canopy = new THREE.Mesh(canopyGeometry, canopyMaterialFor(drop.color));
        canopy.position.y = 4.2;
      }
      const beam = lightBeamDraw({ height: BEAM_HEIGHT, radius: 0.45, color: drop.color, opacity: 0.4 });
      const beamState = childFrameState(state, holder);
      beam.mount?.(beamState);
      holder.add(crate, ...bands);
      if (canopy !== null) holder.add(canopy);
      group.add(holder);
      return { id: drop.id, holder, beam, state: beamState };
    });
  };
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      rebuild(state);
    },
    frame(state: EngineFrameState) {
      const drops = supplyDrops(ctx);
      for (const drop of drops) {
        const part = parts.find((entry) => entry.id === drop.id);
        // A falling crate moves every frame; move its group rather than rebuild.
        part?.holder.position.set(drop.position[0], drop.position[1], drop.position[2]);
      }
      rebuild(state);
    },
    dispose(state: EngineFrameState) {
      for (const part of parts) part.beam.dispose?.(part.state ?? state);
      state.scene.remove(group);
      crateGeometry.dispose();
      bandGeometry.dispose();
      crateMaterial.dispose();
      canopyGeometry.dispose();
      for (const material of [...canopyMaterials.values(), ...bandMaterials.values()]) material.dispose();
    },
  };
}

export function SupplyDrops({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => supplyDropsDraw(latest.current), []);
  return null;
}
