import { WORLD_SCENERY_RADIUS } from "@llmville/game/world/viewDistance";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  NormalBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Object3D,
  PointLight,
  RepeatWrapping,
} from "three";

import {
  DATACENTER_CEILING_HEIGHT,
  DATACENTER_COLUMN_SPACING_CELLS,
  DATACENTER_FLOOR_TILE_CELLS,
} from "@llmville/game/datacenter/layout";
import { CELL_SIZE, cellToWorldCenter, worldToCell } from "@llmville/game/datacenter/grid";
import type { DatacenterClaim } from "@llmville/game/datacenter/claims";
import {
  cellBlockEdges,
  contiguousCellBlocks,
  type CellEdge,
} from "@llmville/game/datacenter/claimMap";
import { readPlayerPosition } from "@/runtime/playerPosition";
import type { GameEngine } from "@/runtime/gameEngine";

const FLOOR_TILE_SIZE = DATACENTER_FLOOR_TILE_CELLS * CELL_SIZE;
const FLOOR_SPAN = WORLD_SCENERY_RADIUS * 2;
const FLOOR_TEXTURE_REPEAT = FLOOR_SPAN / FLOOR_TILE_SIZE;
const COLUMN_STEP = DATACENTER_COLUMN_SPACING_CELLS * CELL_SIZE;
const COLUMN_VIEW_RADIUS = Math.ceil(WORLD_SCENERY_RADIUS / COLUMN_STEP);
const COLUMN_SHAFT_SIZE = CELL_SIZE * 0.78;
const COLUMN_BASE_SIZE = CELL_SIZE * 1.05;
const COLUMN_BASE_HEIGHT = 0.28;
const COLUMN_CAPITAL_HEIGHT = 0.34;
const TRAY_WIDTH = 0.42;
const TRAY_HEIGHT = 0.16;
const LIGHT_ROW_SPACING = 8 * CELL_SIZE;
const LIGHT_PANEL_SPACING = 4 * CELL_SIZE;
const LIGHT_ROW_RADIUS = Math.ceil(WORLD_SCENERY_RADIUS / LIGHT_ROW_SPACING);
const LIGHT_PANEL_RADIUS = Math.ceil(WORLD_SCENERY_RADIUS / LIGHT_PANEL_SPACING);
const LIGHT_PANEL_LENGTH = 2.6;
const LIGHT_PANEL_WIDTH = 0.44;
const LIGHT_POOL_LENGTH = LIGHT_PANEL_LENGTH * 1.8;
const LIGHT_POOL_WIDTH = 3.6;

const scratch = new Object3D();

function snap(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function usePolishedConcreteTexture(): CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    context.fillStyle = "#cbd0d2";
    context.fillRect(0, 0, size, size);
    for (let speck = 0; speck < 1400; speck++) {
      const shade = 176 + Math.floor(Math.random() * 56);
      context.fillStyle = `rgba(${shade},${shade + 2},${shade + 4},0.35)`;
      context.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
    }
    context.strokeStyle = "#a4abae";
    context.lineWidth = 2;
    context.strokeRect(0, 0, size, size);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(FLOOR_TEXTURE_REPEAT, FLOOR_TEXTURE_REPEAT);
    texture.anisotropy = 8;
    return texture;
  }, []);
}

function useLightPoolTexture(): CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.45, "rgba(226,240,244,0.35)");
    gradient.addColorStop(1, "rgba(226,240,244,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new CanvasTexture(canvas);
  }, []);
}

export function EndlessDatacenter({ engine }: { engine: GameEngine }) {
  const shaftRef = useRef<InstancedMesh>(null);
  const baseRef = useRef<InstancedMesh>(null);
  const capitalRef = useRef<InstancedMesh>(null);
  const trayXRef = useRef<InstancedMesh>(null);
  const trayZRef = useRef<InstancedMesh>(null);
  const stripRef = useRef<InstancedMesh>(null);
  const poolRef = useRef<InstancedMesh>(null);
  const shellRef = useRef<Group>(null);
  const lampRef = useRef<PointLight>(null);
  const lastAnchor = useRef<string>("");
  const floorTexture = usePolishedConcreteTexture();
  const poolTexture = useLightPoolTexture();

  useEffect(() => () => floorTexture?.dispose(), [floorTexture]);
  useEffect(() => () => poolTexture?.dispose(), [poolTexture]);

  const columnCount = (COLUMN_VIEW_RADIUS * 2 + 1) ** 2;
  const trayCount = (COLUMN_VIEW_RADIUS * 2 + 1) * (COLUMN_VIEW_RADIUS * 2 + 1);
  const lightCount = (LIGHT_PANEL_RADIUS * 2 + 1) * (LIGHT_ROW_RADIUS * 2 + 1);

  useFrame(() => {
    const player = readPlayerPosition(engine);
    if (lampRef.current) {
      lampRef.current.position.set(
        player.x,
        DATACENTER_CEILING_HEIGHT - 0.3,
        snap(player.z, LIGHT_ROW_SPACING),
      );
    }

    const anchorX = snap(player.x, FLOOR_TILE_SIZE);
    const anchorZ = snap(player.z, FLOOR_TILE_SIZE);
    const anchorKey = `${anchorX}:${anchorZ}`;
    if (anchorKey === lastAnchor.current) return;
    lastAnchor.current = anchorKey;

    const columnBaseX = snap(player.x, COLUMN_STEP);
    const columnBaseZ = snap(player.z, COLUMN_STEP);
    const shaft = shaftRef.current;
    const base = baseRef.current;
    const capital = capitalRef.current;
    if (shaft && base && capital) {
      let index = 0;
      scratch.rotation.set(0, 0, 0);
      for (let dx = -COLUMN_VIEW_RADIUS; dx <= COLUMN_VIEW_RADIUS; dx++) {
        for (let dz = -COLUMN_VIEW_RADIUS; dz <= COLUMN_VIEW_RADIUS; dz++) {
          const center = cellToWorldCenter(
            worldToCell(columnBaseX + dx * COLUMN_STEP, columnBaseZ + dz * COLUMN_STEP),
          );
          scratch.position.set(center.x, DATACENTER_CEILING_HEIGHT / 2, center.z);
          scratch.updateMatrix();
          shaft.setMatrixAt(index, scratch.matrix);
          scratch.position.set(center.x, COLUMN_BASE_HEIGHT / 2, center.z);
          scratch.updateMatrix();
          base.setMatrixAt(index, scratch.matrix);
          scratch.position.set(
            center.x,
            DATACENTER_CEILING_HEIGHT - COLUMN_CAPITAL_HEIGHT / 2,
            center.z,
          );
          scratch.updateMatrix();
          capital.setMatrixAt(index, scratch.matrix);
          index++;
        }
      }
      shaft.instanceMatrix.needsUpdate = true;
      base.instanceMatrix.needsUpdate = true;
      capital.instanceMatrix.needsUpdate = true;
    }

    const trayX = trayXRef.current;
    const trayZ = trayZRef.current;
    if (trayX && trayZ) {
      let index = 0;
      scratch.rotation.set(0, 0, 0);
      const trayY = DATACENTER_CEILING_HEIGHT - 0.42;
      for (let dx = -COLUMN_VIEW_RADIUS; dx <= COLUMN_VIEW_RADIUS; dx++) {
        for (let dz = -COLUMN_VIEW_RADIUS; dz <= COLUMN_VIEW_RADIUS; dz++) {
          const center = cellToWorldCenter(
            worldToCell(columnBaseX + dx * COLUMN_STEP, columnBaseZ + dz * COLUMN_STEP),
          );
          scratch.position.set(center.x + COLUMN_STEP / 2, trayY, center.z);
          scratch.updateMatrix();
          trayX.setMatrixAt(index, scratch.matrix);
          scratch.position.set(center.x, trayY, center.z + COLUMN_STEP / 2);
          scratch.updateMatrix();
          trayZ.setMatrixAt(index, scratch.matrix);
          index++;
        }
      }
      trayX.instanceMatrix.needsUpdate = true;
      trayZ.instanceMatrix.needsUpdate = true;
    }

    const strips = stripRef.current;
    const pools = poolRef.current;
    if (strips && pools) {
      const lightBaseX = snap(player.x, LIGHT_PANEL_SPACING);
      const lightBaseZ = snap(player.z, LIGHT_ROW_SPACING);
      let index = 0;
      for (let dx = -LIGHT_PANEL_RADIUS; dx <= LIGHT_PANEL_RADIUS; dx++) {
        for (let dz = -LIGHT_ROW_RADIUS; dz <= LIGHT_ROW_RADIUS; dz++) {
          const x = lightBaseX + dx * LIGHT_PANEL_SPACING + LIGHT_PANEL_SPACING / 2;
          const z = lightBaseZ + dz * LIGHT_ROW_SPACING;
          scratch.rotation.set(0, 0, 0);
          scratch.position.set(x, DATACENTER_CEILING_HEIGHT - 0.12, z);
          scratch.updateMatrix();
          strips.setMatrixAt(index, scratch.matrix);
          scratch.rotation.set(-Math.PI / 2, 0, 0);
          scratch.position.set(x, 0.014, z);
          scratch.updateMatrix();
          pools.setMatrixAt(index, scratch.matrix);
          index++;
        }
      }
      strips.instanceMatrix.needsUpdate = true;
      pools.instanceMatrix.needsUpdate = true;
    }

    if (shellRef.current) shellRef.current.position.set(anchorX, 0, anchorZ);
  });

  return (
    <group>
      <instancedMesh ref={shaftRef} args={[undefined, undefined, columnCount]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[COLUMN_SHAFT_SIZE, DATACENTER_CEILING_HEIGHT, COLUMN_SHAFT_SIZE]} />
        <meshStandardMaterial color="#b9bec0" roughness={0.88} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={baseRef} args={[undefined, undefined, columnCount]} receiveShadow frustumCulled={false}>
        <boxGeometry args={[COLUMN_BASE_SIZE, COLUMN_BASE_HEIGHT, COLUMN_BASE_SIZE]} />
        <meshStandardMaterial color="#9ea4a7" roughness={0.9} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={capitalRef} args={[undefined, undefined, columnCount]} frustumCulled={false}>
        <boxGeometry args={[COLUMN_BASE_SIZE, COLUMN_CAPITAL_HEIGHT, COLUMN_BASE_SIZE]} />
        <meshStandardMaterial color="#c6cacc" roughness={0.85} metalness={0.03} />
      </instancedMesh>
      <instancedMesh ref={trayXRef} args={[undefined, undefined, trayCount]} frustumCulled={false}>
        <boxGeometry args={[COLUMN_STEP, TRAY_HEIGHT, TRAY_WIDTH]} />
        <meshStandardMaterial color="#2c3236" roughness={0.7} metalness={0.45} />
      </instancedMesh>
      <instancedMesh ref={trayZRef} args={[undefined, undefined, trayCount]} frustumCulled={false}>
        <boxGeometry args={[TRAY_WIDTH, TRAY_HEIGHT, COLUMN_STEP]} />
        <meshStandardMaterial color="#2c3236" roughness={0.7} metalness={0.45} />
      </instancedMesh>
      <instancedMesh ref={stripRef} args={[undefined, undefined, lightCount]} frustumCulled={false}>
        <boxGeometry args={[LIGHT_PANEL_LENGTH, 0.09, LIGHT_PANEL_WIDTH]} />
        <meshStandardMaterial color="#fff0d4" emissive="#ffe1ae" emissiveIntensity={1.8} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={poolRef} args={[undefined, undefined, lightCount]} frustumCulled={false}>
        <planeGeometry args={[LIGHT_POOL_LENGTH, LIGHT_POOL_WIDTH]} />
        <meshBasicMaterial
          map={poolTexture}
          color="#f6e1be"
          transparent
          opacity={0.28}
          blending={NormalBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <pointLight ref={lampRef} intensity={26} distance={24} decay={2} color="#f4faff" />
      <group ref={shellRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[FLOOR_SPAN, FLOOR_SPAN]} />
          <meshStandardMaterial map={floorTexture} color="#ffffff" roughness={0.28} metalness={0.16} />
        </mesh>
        <mesh position={[0, DATACENTER_CEILING_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[FLOOR_SPAN, FLOOR_SPAN]} />
          <meshStandardMaterial color="#12171a" roughness={0.95} metalness={0.05} />
        </mesh>
      </group>
    </group>
  );
}

const CLAIM_VIEW_RADIUS_CELLS = Math.ceil(WORLD_SCENERY_RADIUS / CELL_SIZE);
const CLAIM_FILL_Y = 0.02;
const CLAIM_EDGE_Y = 0.035;
const CLAIM_EDGE_WIDTH = 0.14;

interface Quad {
  x: number;
  z: number;
  width: number;
  depth: number;
}

function quadsGeometry(quads: readonly Quad[], y: number): BufferGeometry {
  const positions = new Float32Array(quads.length * 12);
  const normals = new Float32Array(quads.length * 12);
  const indices = new Uint32Array(quads.length * 6);
  quads.forEach((quad, quadIndex) => {
    const halfWidth = quad.width / 2;
    const halfDepth = quad.depth / 2;
    const corners = [
      [quad.x - halfWidth, quad.z - halfDepth],
      [quad.x + halfWidth, quad.z - halfDepth],
      [quad.x + halfWidth, quad.z + halfDepth],
      [quad.x - halfWidth, quad.z + halfDepth],
    ] as const;
    corners.forEach((corner, cornerIndex) => {
      const offset = quadIndex * 12 + cornerIndex * 3;
      positions[offset] = corner[0];
      positions[offset + 1] = y;
      positions[offset + 2] = corner[1];
      normals[offset] = 0;
      normals[offset + 1] = 1;
      normals[offset + 2] = 0;
    });
    const vertex = quadIndex * 4;
    const indexOffset = quadIndex * 6;
    indices[indexOffset] = vertex;
    indices[indexOffset + 1] = vertex + 2;
    indices[indexOffset + 2] = vertex + 1;
    indices[indexOffset + 3] = vertex;
    indices[indexOffset + 4] = vertex + 3;
    indices[indexOffset + 5] = vertex + 2;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(Array.from(indices));
  return geometry;
}

function edgeQuad(edge: CellEdge): Quad {
  const center = cellToWorldCenter(edge);
  const half = CELL_SIZE / 2 - CLAIM_EDGE_WIDTH / 2;
  if (edge.side === "north") {
    return { x: center.x, z: center.z - half, width: CELL_SIZE, depth: CLAIM_EDGE_WIDTH };
  }
  if (edge.side === "south") {
    return { x: center.x, z: center.z + half, width: CELL_SIZE, depth: CLAIM_EDGE_WIDTH };
  }
  if (edge.side === "west") {
    return { x: center.x - half, z: center.z, width: CLAIM_EDGE_WIDTH, depth: CELL_SIZE };
  }
  return { x: center.x + half, z: center.z, width: CLAIM_EDGE_WIDTH, depth: CELL_SIZE };
}

function claimGeometry(claims: readonly DatacenterClaim[]): { fill: BufferGeometry; edges: BufferGeometry } {
  const cells = claims.map((claim) => ({ cx: claim.cx, cz: claim.cz }));
  const fillQuads = cells.map((cell) => {
    const center = cellToWorldCenter(cell);
    return { x: center.x, z: center.z, width: CELL_SIZE, depth: CELL_SIZE };
  });
  const edgeQuads: Quad[] = [];
  for (const block of contiguousCellBlocks(cells)) {
    for (const edge of cellBlockEdges(block)) edgeQuads.push(edgeQuad(edge));
  }
  return { fill: quadsGeometry(fillQuads, CLAIM_FILL_Y), edges: quadsGeometry(edgeQuads, CLAIM_EDGE_Y) };
}

export function ClaimedCellOverlay({
  claims,
  localGameId,
  playerPosition,
}: {
  claims: readonly DatacenterClaim[];
  localGameId: string | null;
  playerPosition: { x: number; z: number };
}) {
  const anchor = worldToCell(playerPosition.x, playerPosition.z);
  const anchorCx = Math.floor(anchor.cx / 8);
  const anchorCz = Math.floor(anchor.cz / 8);

  const geometries = useMemo(() => {
    const centerCx = anchorCx * 8;
    const centerCz = anchorCz * 8;
    const visible = claims.filter(
      (claim) =>
        Math.abs(claim.cx - centerCx) <= CLAIM_VIEW_RADIUS_CELLS
        && Math.abs(claim.cz - centerCz) <= CLAIM_VIEW_RADIUS_CELLS,
    );
    const own = visible.filter((claim) => localGameId !== null && claim.ownerGameId === localGameId);
    const others = visible.filter((claim) => localGameId === null || claim.ownerGameId !== localGameId);
    return { own: claimGeometry(own), others: claimGeometry(others) };
  }, [claims, localGameId, anchorCx, anchorCz]);

  useEffect(
    () => () => {
      geometries.own.fill.dispose();
      geometries.own.edges.dispose();
      geometries.others.fill.dispose();
      geometries.others.edges.dispose();
    },
    [geometries],
  );

  return (
    <group>
      <mesh geometry={geometries.own.fill}>
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh geometry={geometries.own.edges}>
        <meshBasicMaterial color="#5fc2a8" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={geometries.others.fill}>
        <meshBasicMaterial color="#f0b35f" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <mesh geometry={geometries.others.edges}>
        <meshBasicMaterial color="#e0a95c" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
