// @skill jgengine-world
import { useEffect, useMemo, type ReactNode } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";

import type { CaveGround, CaveLayout } from "./caveLayout";
import { caveMesh, type CaveMeshPart } from "./caveMesh";

function geometryOf(part: CaveMeshPart): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(part.positions, 3));
  geometry.setIndex(new BufferAttribute(part.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Colours of a cave's rock: the inside you walk through, the hill outside and the floor underfoot. */
export interface CaveColors {
  inner: string;
  outer: string;
  floor: string;
}

const DEFAULT_COLORS: CaveColors = { inner: "#3a332c", outer: "#6d665c", floor: "#4a4136" };

/**
 * Draw a cave laid out by `caveLayout`: the rock inside and the hill outside, both casting shadow so the
 * tunnel and chamber are dark until the game lights them.
 * @capability cave-draw draw a cave's rock from its layout
 */
export function Cave({ layout, ground, colors = DEFAULT_COLORS }: { layout: CaveLayout; ground: CaveGround; colors?: CaveColors }): ReactNode {
  const [inner, outer, floor] = useMemo(() => {
    const mesh = caveMesh(layout, ground);
    return [geometryOf(mesh.inner), geometryOf(mesh.outer), geometryOf(mesh.floor)] as const;
  }, [layout, ground]);
  useEffect(
    () => () => {
      inner.dispose();
      outer.dispose();
      floor.dispose();
    },
    [inner, outer, floor],
  );
  return (
    <group>
      <mesh geometry={inner} castShadow receiveShadow>
        <meshStandardMaterial color={colors.inner} roughness={0.95} side={DoubleSide} flatShading />
      </mesh>
      <mesh geometry={outer} castShadow receiveShadow>
        <meshStandardMaterial color={colors.outer} roughness={0.9} side={DoubleSide} flatShading />
      </mesh>
      <mesh geometry={floor} receiveShadow>
        <meshStandardMaterial color={colors.floor} roughness={1} side={DoubleSide} flatShading />
      </mesh>
    </group>
  );
}
