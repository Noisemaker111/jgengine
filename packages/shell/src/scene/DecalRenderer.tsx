import { useMemo } from "react";
import * as THREE from "three";

import { resolveDecalObject } from "@jgengine/core/world/decalKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { createDecalDrapeGeometry } from "../render/decalGeometry";
import { createDecalTexture } from "../render/decalTexture";
import { useDisposable } from "../render/useDisposable";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

/** Tilts at or above this stand the decal up on a wall instead of draping it on the ground. */
const WALL_TILT = 45;

function dataTexture(style: Parameters<typeof createDecalTexture>[0], seed: string): THREE.DataTexture {
  const baked = createDecalTexture(style, seed);
  const texture = new THREE.DataTexture(baked.data, baked.size, baked.size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function OneDecal({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveDecalObject(object), [object]);
  const rules = resolved?.rules;
  const style = rules?.style ?? "dirt";
  const seed = rules?.seed ?? "";
  const texture = useDisposable(() => dataTexture(style, seed), [style, seed]);
  const wall = (rules?.tilt ?? 0) >= WALL_TILT;
  const geometry = useDisposable(() => {
    if (resolved === null || rules === undefined) return new THREE.BufferGeometry();
    if (wall) return new THREE.PlaneGeometry(rules.size, rules.size);
    const draped = createDecalDrapeGeometry({
      size: rules.size,
      rotationY: resolved.rotationY,
      heightAt: context.field.sampleHeight,
      lift: rules.lift,
    });
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(draped.positions, 3));
    next.setAttribute("normal", new THREE.BufferAttribute(draped.normals, 3));
    next.setAttribute("uv", new THREE.BufferAttribute(draped.uvs, 2));
    next.setIndex(new THREE.BufferAttribute(draped.indices, 1));
    next.computeBoundingSphere();
    return next;
  }, [resolved, rules, wall, context.field]);
  const material = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: rules?.opacity ?? 1,
        roughness: 0.92,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    [texture, rules?.opacity],
  );
  if (resolved === null || rules === undefined) return null;
  const [px, py, pz] = resolved.position;
  if (!wall) {
    return <mesh geometry={geometry} material={material} position={[px, py, pz]} receiveShadow frustumCulled />;
  }
  // A standing decal is pushed out along its own normal so it clears the wall it describes.
  const normalX = Math.sin(resolved.rotationY);
  const normalZ = Math.cos(resolved.rotationY);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[px + normalX * rules.offset, py + rules.lift, pz + normalZ * rules.offset]}
      rotation={[THREE.MathUtils.degToRad(rules.tilt - 90), resolved.rotationY, 0]}
      receiveShadow
      frustumCulled
    />
  );
}

/** Registers the `decal` marker renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerDecalRenderer(): void {
  registerSceneKindRenderer("decal", ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <OneDecal key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
