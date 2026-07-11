import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { FireGrid } from "@jgengine/core/world/weather";
import { setBillboardQuaternion } from "./fireSpreadPose";

export interface FireSpreadLayerProps {
  grid: FireGrid;
  cellSize: number;
  origin?: readonly [number, number];
  /** Sample ground height so flames sit on terrain; defaults to y=0. */
  heightAt?: (x: number, z: number) => number;
  /** Flame quad height. Default 1.6. */
  flameHeight?: number;
  burningColor?: THREE.ColorRepresentation;
  emberColor?: THREE.ColorRepresentation;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export function FireSpreadLayer({
  grid,
  cellSize,
  origin = [0, 0],
  heightAt,
  flameHeight = 1.6,
  burningColor = "#ff6a1a",
  emberColor = "#4a1206",
}: FireSpreadLayerProps) {
  const flames = useRef<THREE.InstancedMesh>(null);
  const scorch = useRef<THREE.InstancedMesh>(null);
  const capacity = grid.cols * grid.rows;

  const flameGeometry = useMemo(() => new THREE.PlaneGeometry(cellSize * 0.9, flameHeight), [cellSize, flameHeight]);
  const scorchGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(cellSize, cellSize);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [cellSize]);
  const flameMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: burningColor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    [burningColor],
  );
  const scorchMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: emberColor, transparent: true, opacity: 0.7, depthWrite: false }),
    [emberColor],
  );

  useEffect(
    () => () => {
      flameGeometry.dispose();
      scorchGeometry.dispose();
      flameMaterial.dispose();
      scorchMaterial.dispose();
    },
    [flameGeometry, scorchGeometry, flameMaterial, scorchMaterial],
  );

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const identityQuat = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useFrame((state) => {
    const flameMesh = flames.current;
    const scorchMesh = scorch.current;
    if (flameMesh === null || scorchMesh === null) return;
    const cells = grid.snapshot();
    const flicker = 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 12);
    let flameIndex = 0;
    let scorchIndex = 0;
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const cell = cells[row * grid.cols + col]!;
        const x = origin[0] + col * cellSize;
        const z = origin[1] + row * cellSize;
        const groundY = heightAt?.(x, z) ?? 0;
        if (cell.state === "burning") {
          position.set(x, groundY + flameHeight * 0.5, z);
          setBillboardQuaternion(quaternion, euler, state.camera.rotation.y);
          scale.set(1, flicker, 1);
          matrix.compose(position, quaternion, scale);
          flameMesh.setMatrixAt(flameIndex, matrix);
          flameIndex += 1;
        } else if (cell.state === "burnt") {
          position.set(x, groundY + 0.05, z);
          scale.set(1, 1, 1);
          matrix.compose(position, identityQuat, scale);
          scorchMesh.setMatrixAt(scorchIndex, matrix);
          scorchIndex += 1;
        }
      }
    }
    for (let i = flameIndex; i < capacity; i += 1) flameMesh.setMatrixAt(i, HIDDEN);
    for (let i = scorchIndex; i < capacity; i += 1) scorchMesh.setMatrixAt(i, HIDDEN);
    flameMesh.count = capacity;
    scorchMesh.count = capacity;
    flameMesh.instanceMatrix.needsUpdate = true;
    scorchMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={scorch} args={[scorchGeometry, scorchMaterial, capacity]} frustumCulled={false} renderOrder={5} />
      <instancedMesh ref={flames} args={[flameGeometry, flameMaterial, capacity]} frustumCulled={false} renderOrder={11} />
    </group>
  );
}
