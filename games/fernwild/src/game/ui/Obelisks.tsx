/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../../editorLayers";

/** Glow colour of each obelisk by its `meta.color`. */
const GLOW: Record<string, string> = { red: "#ff3b30", green: "#34ff6a", blue: "#3b8cff" };
/** ARK's obelisks tower over the island; at the map's 3/8 scale they still stand this tall. */
const HEIGHT = 60;
const WIDTH = 7;
/** They hover clear of the ground they mark. */
const HOVER = 14;

/** The three obelisks (`obelisk` markers in editor.scene.json): dark floating spires banded with their colour. */
export function obelisksDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const bodyGeometry = new THREE.BoxGeometry(WIDTH, HEIGHT, WIDTH * 0.7);
  const bandGeometry = new THREE.BoxGeometry(WIDTH * 0.25, HEIGHT * 0.92, WIDTH * 0.72);
  const footGeometry = new THREE.ConeGeometry(WIDTH * 0.55, 4, 4);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#1c1f26", metalness: 0.6, roughness: 0.35 });
  const glowMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const footMaterial = bodyMaterial;
  const glowMaterialFor = (glow: string) => {
    let material = glowMaterials.get(glow);
    if (material === undefined) {
      material = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 2.2, toneMapped: false });
      glowMaterials.set(glow, material);
    }
    return material;
  };
  for (const marker of markersOfKind(editorLayers, "obelisk")) {
    const glow = GLOW[String(marker.meta?.["color"])] ?? "#ffffff";
    const y = ctx.world.groundHeightAt(marker.position.x, marker.position.z) + HOVER;
    const holder = new THREE.Group();
    holder.position.set(marker.position.x, y, marker.position.z);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = HEIGHT / 2;
    const band = new THREE.Mesh(bandGeometry, glowMaterialFor(glow));
    band.position.y = HEIGHT / 2;
    const foot = new THREE.Mesh(footGeometry, footMaterial);
    foot.position.y = -1.5;
    foot.rotation.y = Math.PI / 4;
    const light = new THREE.PointLight(glow, 400, 60);
    light.position.y = -4;
    holder.add(body, band, foot, light);
    group.add(holder);
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      bodyGeometry.dispose();
      bandGeometry.dispose();
      footGeometry.dispose();
      bodyMaterial.dispose();
      for (const material of glowMaterials.values()) material.dispose();
    },
  };
}

export function Obelisks({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => obelisksDraw(latest.current), []);
  return null;
}
