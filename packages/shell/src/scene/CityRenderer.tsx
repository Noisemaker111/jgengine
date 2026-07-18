/**
 * Runtime renderer for the `city` volume kind: streets from `resolveCityObject` merge into one
 * ground-draped ribbon geometry per district, building lots render as one instanced massing mesh
 * with per-lot palette-jittered color, and parks render as flat green patches. All geometry derives
 * from the document volume, so the editor sliders (grid-ness, curviness, branching, block size…)
 * re-render the whole district live and games consume the same authored volume unchanged.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { roundPathCorners, buildRoadRibbon } from "@jgengine/core/world/roads";
import { resolveCityObject, CITY_KIND } from "@jgengine/core/world/cityKind";
import { resolveBuildingPalette } from "@jgengine/core/world/buildings";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

const STREET_COLOR = "#44454b";
const SIDEWALK_COLOR = "#8d8c8a";
const BRIDGE_COLOR = "#5d5f66";
const PARK_COLOR = "#4d7a40";
const PARK_THICKNESS = 0.1;

/** One authored city volume → merged street ribbons + instanced building massing + park patches. */
function OneCity({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const field = context.field;
  const sample = useMemo(() => (x: number, z: number) => field.sampleHeight(x, z), [field]);
  const resolved = useMemo(() => resolveCityObject(object, { sampleHeight: sample }), [object, sample]);

  const streetGeometry = useMemo(() => {
    if (resolved === null || resolved.streets.length === 0) return null;
    const positions: number[] = [];
    const indices: number[] = [];
    for (const street of resolved.streets) {
      if (street.points.length < 2) continue;
      const rounded = roundPathCorners(street.points, Math.max(1.5, street.width * 0.9), 4);
      const ribbon = buildRoadRibbon(rounded, street.width, (x, z) => sample(x, z), { elevation: 0.16, maxSegmentLength: 2 });
      const offset = positions.length / 3;
      for (let i = 0; i < ribbon.positions.length; i += 1) positions.push(ribbon.positions[i]!);
      for (let i = 0; i < ribbon.indices.length; i += 1) indices.push(ribbon.indices[i]! + offset);
    }
    if (indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [resolved, sample]);
  useEffect(() => () => streetGeometry?.dispose(), [streetGeometry]);

  // Sidewalks: a slightly wider, lighter ribbon under the road so both curbs read.
  const sidewalkGeometry = useMemo(() => {
    if (resolved === null || !resolved.rules.sidewalks || resolved.streets.length === 0) return null;
    const positions: number[] = [];
    const indices: number[] = [];
    for (const street of resolved.streets) {
      if (street.points.length < 2) continue;
      const rounded = roundPathCorners(street.points, Math.max(1.5, street.width * 0.9), 4);
      const ribbon = buildRoadRibbon(rounded, street.width + 3.4, (x, z) => sample(x, z), { elevation: 0.1, maxSegmentLength: 2 });
      const offset = positions.length / 3;
      for (let i = 0; i < ribbon.positions.length; i += 1) positions.push(ribbon.positions[i]!);
      for (let i = 0; i < ribbon.indices.length; i += 1) indices.push(ribbon.indices[i]! + offset);
    }
    if (indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [resolved, sample]);
  useEffect(() => () => sidewalkGeometry?.dispose(), [sidewalkGeometry]);

  // Bridges: flat-arched decks spanning from bank to bank, plus piers down to the riverbed.
  const bridgeParts = useMemo(() => {
    if (resolved === null || resolved.bridges.length === 0) return null;
    const positions: number[] = [];
    const indices: number[] = [];
    const piers: { x: number; z: number; top: number; bottom: number }[] = [];
    for (const bridge of resolved.bridges) {
      const first = bridge.points[0]!;
      const last = bridge.points[bridge.points.length - 1]!;
      const hA = sample(first[0], first[1]) + 0.35;
      const hB = sample(last[0], last[1]) + 0.35;
      const abx = last[0] - first[0];
      const abz = last[1] - first[1];
      const len2 = Math.max(1e-6, abx * abx + abz * abz);
      const span = Math.sqrt(len2);
      const deckY = (x: number, z: number) => {
        const t = Math.max(0, Math.min(1, ((x - first[0]) * abx + (z - first[1]) * abz) / len2));
        return hA + (hB - hA) * t + Math.sin(t * Math.PI) * Math.min(1.6, span * 0.03);
      };
      const ribbon = buildRoadRibbon(bridge.points, bridge.width + 0.8, deckY, { elevation: 0.12, maxSegmentLength: 2 });
      const offset = positions.length / 3;
      for (let i = 0; i < ribbon.positions.length; i += 1) positions.push(ribbon.positions[i]!);
      for (let i = 0; i < ribbon.indices.length; i += 1) indices.push(ribbon.indices[i]! + offset);
      const pierCount = Math.max(0, Math.floor(span / 18));
      for (let p = 1; p <= pierCount; p += 1) {
        const t = p / (pierCount + 1);
        const x = first[0] + abx * t;
        const z = first[1] + abz * t;
        piers.push({ x, z, top: deckY(x, z), bottom: sample(x, z) - 1 });
      }
    }
    if (indices.length === 0) return null;
    const deck = new THREE.BufferGeometry();
    deck.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    deck.setIndex(indices);
    deck.computeVertexNormals();
    return { deck, piers };
  }, [resolved, sample]);
  useEffect(() => () => bridgeParts?.deck.dispose(), [bridgeParts]);

  const buildings = useMemo(() => {
    if (resolved === null || resolved.lots.length === 0) return null;
    const palette = resolveBuildingPalette(resolved.rules.style);
    const wall = new THREE.Color(palette.wall);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(geometry, material, resolved.lots.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Instance matrices spread lots across the whole district; the unit-box bounds would cull them.
    mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < resolved.lots.length; i += 1) {
      const lot = resolved.lots[i]!;
      const height = Math.max(1, lot.floors) * resolved.rules.floorHeight;
      // Sample all four footprint corners: on a slope the box grows a foundation down to the lowest
      // corner and its roof sits above the highest, so hillside houses step down cliffs instead of
      // floating on one edge and clipping on the other.
      const c = Math.cos(lot.rotationY);
      const s = Math.sin(lot.rotationY);
      const hw = lot.size[0] / 2;
      const hd = lot.size[1] / 2;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [dx, dz] of [
        [hw, hd],
        [hw, -hd],
        [-hw, hd],
        [-hw, -hd],
      ] as const) {
        const y = sample(lot.center[0] + dx * c + dz * s, lot.center[1] - dx * s + dz * c);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const base = minY - 0.4;
      const total = maxY - base + height;
      matrix.compose(
        new THREE.Vector3(lot.center[0], base + total / 2, lot.center[1]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.rotationY),
        new THREE.Vector3(lot.size[0], total, lot.size[1]),
      );
      mesh.setMatrixAt(i, matrix);
      const shade = 0.82 + lot.jitter * 0.3;
      color.copy(wall).multiplyScalar(shade);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }, [resolved, sample]);
  useEffect(
    () => () => {
      if (buildings !== null) {
        buildings.geometry.dispose();
        (buildings.material as THREE.Material).dispose();
      }
    },
    [buildings],
  );

  if (resolved === null) return null;
  return (
    <group>
      {streetGeometry !== null ? (
        <mesh geometry={streetGeometry} receiveShadow>
          <meshStandardMaterial color={STREET_COLOR} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {sidewalkGeometry !== null ? (
        <mesh geometry={sidewalkGeometry} receiveShadow>
          <meshStandardMaterial color={SIDEWALK_COLOR} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {bridgeParts !== null ? (
        <>
          <mesh geometry={bridgeParts.deck} castShadow receiveShadow>
            <meshStandardMaterial color={BRIDGE_COLOR} roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
          {bridgeParts.piers.map((pier, i) => (
            <mesh key={`pier:${i}`} position={[pier.x, (pier.top + pier.bottom) / 2, pier.z]} castShadow>
              <boxGeometry args={[1.6, Math.max(0.5, pier.top - pier.bottom), 1.6]} />
              <meshStandardMaterial color={BRIDGE_COLOR} roughness={0.95} metalness={0} />
            </mesh>
          ))}
        </>
      ) : null}
      {buildings !== null ? <primitive object={buildings} /> : null}
      {resolved.parks.map((park) => {
        const groundY = sample(park.center[0], park.center[1]);
        return (
          <mesh key={park.id} position={[park.center[0], groundY + PARK_THICKNESS / 2 + 0.04, park.center[1]]} rotation={[0, park.rotationY, 0]} receiveShadow>
            <boxGeometry args={[park.size[0], PARK_THICKNESS, park.size[1]]} />
            <meshStandardMaterial color={PARK_COLOR} roughness={1} metalness={0} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Registers the `city` volume runtime renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerCityRenderer(): void {
  registerSceneKindRenderer(CITY_KIND, ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <OneCity key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
