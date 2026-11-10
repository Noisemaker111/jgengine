import * as THREE from "three";

import { caveDraw } from "../../engine-local/cave/Cave.draw";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useRef } from "@jgengine/core/ui/jsx";

import { artifactHere, cavesOf, type IslandCave } from "../caves";

/** Hard caves are lit a hotter colour, the rest by pale crystal. */
const GLOW = { soft: "#7fd6ff", hard: "#ff7a3c" };

/** The Island's caves: the rock, glowing crystals down the tunnel and the artifact on its pedestal in each chamber. */
export function cavesDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const ground = ctx.world.groundHeightAt;
  const caves = cavesOf(ctx);
  const group = new THREE.Group();
  const gems: { mesh: THREE.Mesh; cave: IslandCave }[] = [];
  const rocks: { draw: EngineDraw; holder: THREE.Group; state: EngineFrameState | null }[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const crystalGeometry = new THREE.OctahedronGeometry(0.35, 0);
  const pedestalGeometry = new THREE.CylinderGeometry(0.7, 0.9, 1, 8);
  const pedestalMaterial = new THREE.MeshStandardMaterial({ color: "#4a4038", roughness: 0.9, flatShading: true });
  const gemGeometry = new THREE.IcosahedronGeometry(0.4, 0);
  for (const cave of caves) {
    const glow = cave.hard ? GLOW.hard : GLOW.soft;
    const glowMaterial = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 3, toneMapped: false });
    ownedMaterials.push(glowMaterial);
    const holder = new THREE.Group();
    rocks.push({ draw: caveDraw({ layout: cave.layout, ground }), holder, state: null });
    const spots = cave.layout.spots.map((spot) => [spot[0], ground(spot[0], spot[1]) + 0.3, spot[1]] as const);
    spots.slice(0, -1).forEach((spot, k) => {
      // Glowing crystal clusters on the walls light the way; no real lights, so the scene's shaders never change.
      const crystal = new THREE.Mesh(crystalGeometry, glowMaterial);
      crystal.position.set(spot[0], spot[1], spot[2]);
      crystal.rotation.set(k, k * 1.7, 0.4);
      holder.add(crystal);
    });
    const pedestal = new THREE.Group();
    const center = cave.layout.chamber.center;
    pedestal.position.set(center[0], ground(center[0], center[1]), center[1]);
    const stand = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    stand.position.y = 0.5;
    stand.castShadow = true;
    stand.receiveShadow = true;
    const gemMaterial = new THREE.MeshStandardMaterial({ color: "#ffcf4a", emissive: "#ffb000", emissiveIntensity: 2, metalness: 0.6, roughness: 0.25, toneMapped: false, flatShading: true });
    ownedMaterials.push(gemMaterial);
    const gem = new THREE.Mesh(gemGeometry, gemMaterial);
    gem.position.set(0, 1.55, 0);
    gem.rotation.set(0.35, 0, 0.2);
    pedestal.add(stand, gem);
    holder.add(pedestal);
    gems.push({ mesh: gem, cave });
    group.add(holder);
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      for (const rock of rocks) {
        rock.state = childFrameState(state, rock.holder);
        rock.draw.mount?.(rock.state);
      }
    },
    frame(state: EngineFrameState) {
      for (const { mesh, cave } of gems) {
        mesh.visible = artifactHere(ctx, cave);
        mesh.rotation.y += state.delta * 0.8;
      }
      for (const rock of rocks) if (rock.state !== null) rock.draw.frame?.(rock.state, rock.state.delta);
    },
    dispose(state: EngineFrameState) {
      for (const rock of rocks) if (rock.state !== null) rock.draw.dispose?.(rock.state);
      state.scene.remove(group);
      crystalGeometry.dispose();
      pedestalGeometry.dispose();
      pedestalMaterial.dispose();
      gemGeometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}

export function Caves({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => cavesDraw(latest.current), []);
  return null;
}
