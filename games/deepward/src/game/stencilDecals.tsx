import { useMemo } from "react";
import * as THREE from "three";
import { readDecalRules } from "@jgengine/core/world/decalKind";
import { acquireDecalTexture, type DecalTextureLease } from "@jgengine/core/scene/useDecalTexture.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { editorLayers, type Place } from "../world";

/** Stencilled floor and wall markings the editor scene places on this floor: line numbers, bay marks, hazard chevrons. */
export function stencilMarkers(place: Place) {
  return editorLayers.markers.filter(marker => marker.kind === "deepward-decal" && marker.meta?.["place"] === place);
}

type StencilMarker = ReturnType<typeof stencilMarkers>[number];

/** One marker's decal plane: position/rotation on a group, tilt on the mesh, texture leased draw-side. */
function stencilDraw(marker: StencilMarker): EngineDraw {
  const rules = readDecalRules(marker.meta);
  const group = new THREE.Group();
  group.position.set(marker.position.x, marker.position.y, marker.position.z);
  group.rotation.y = marker.rotationY ?? 0;
  const wall = rules.tilt >= 45;
  const material = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: rules.opacity,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rules.size, rules.size), material);
  mesh.rotation.x = wall ? 0 : -Math.PI / 2;
  mesh.renderOrder = 2;
  group.add(mesh);
  let lease: DecalTextureLease | null = null;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      lease = acquireDecalTexture(
        rules.style,
        rules.seed || marker.id,
        256,
        { text: rules.text, color: rules.color },
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = 4;
        },
        state,
      );
      material.map = lease.texture;
      material.needsUpdate = true;
    },
    dispose(state: EngineFrameState) {
      lease?.dispose();
      lease = null;
      state.scene.remove(group);
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

function Stencil({ marker }: { marker: StencilMarker }) {
  return <EngineDrawMount create={() => stencilDraw(marker)} deps={[marker]} />;
}

/** Decals for one floor, one small plane each; the editor owns every placement. */
export function StencilDecals({ place }: { place: Place }) {
  const markers = useMemo(() => stencilMarkers(place), [place]);
  return <>{markers.map(marker => <Stencil key={marker.id} marker={marker} />)}</>;
}
