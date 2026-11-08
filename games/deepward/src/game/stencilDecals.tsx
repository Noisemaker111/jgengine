import { useMemo } from "react";
import * as THREE from "three";
import { useDecalTexture } from "@jgengine/core/scene/useDecalTexture.draw";
import { readDecalRules } from "@jgengine/core/world/decalKind";
import { editorLayers, type Place } from "../world";

/** Stencilled floor and wall markings the editor scene places on this floor: line numbers, bay marks, hazard chevrons. */
export function stencilMarkers(place: Place) {
  return editorLayers.markers.filter(marker => marker.kind === "deepward-decal" && marker.meta?.["place"] === place);
}

function Stencil({ marker }: { marker: ReturnType<typeof stencilMarkers>[number] }) {
  const rules = useMemo(() => readDecalRules(marker.meta), [marker]);
  const texture = useDecalTexture(rules.style, rules.seed || marker.id, 256, { text: rules.text, color: rules.color }, (next) => {
    next.colorSpace = THREE.SRGBColorSpace;
    next.minFilter = THREE.LinearMipmapLinearFilter;
    next.magFilter = THREE.LinearFilter;
    next.generateMipmaps = true;
    next.anisotropy = 4;
  });
  const wall = rules.tilt >= 45;
  return <group position={[marker.position.x, marker.position.y, marker.position.z]} rotation-y={marker.rotationY ?? 0}>
    <mesh rotation-x={wall ? 0 : -Math.PI / 2} renderOrder={2}>
      <planeGeometry args={[rules.size, rules.size]} />
      <meshStandardMaterial map={texture} transparent opacity={rules.opacity} depthWrite={false} roughness={0.9} metalness={0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  </group>;
}

/** Decals for one floor, one small plane each; the editor owns every placement. */
export function StencilDecals({ place }: { place: Place }) {
  const markers = useMemo(() => stencilMarkers(place), [place]);
  return <>{markers.map(marker => <Stencil key={marker.id} marker={marker} />)}</>;
}
