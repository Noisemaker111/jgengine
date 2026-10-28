import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { DAMP_SAND, DRY_SAND } from "@jgengine/core/granular/granularMaterial";
import { createGranularLayer, type GranularLayer } from "@jgengine/core/granular/granularLayer";
import { cellVolume } from "@jgengine/core/fracture/convexCell";
import { KWH_PER_TONNE } from "@jgengine/core/fracture/fragmentSize";
import { GRANITE_BREAKAGE, fractureRock, type RockFragment } from "@jgengine/core/fracture/rockFracture";
import { fragmentMesh, rockCell } from "@jgengine/core/fracture/rockFractureGenerator";
import { seededRng } from "@jgengine/core/random/rng";
import { defineGame } from "@jgengine/shell/defineGame";
import type { PlayableGame } from "@jgengine/shell/registry";

const COLS = 96;
const SPACING = 0.1;
const SPAN = COLS * SPACING;
/** The sand box stands on a plinth so the world floor never shows through the bed. */
const LIFT = 0.6;
const STONE: [number, number, number] = [0.6, 0.5, 0.55];
const STONE_COLOR: [number, number, number] = [0.54, 0.52, 0.47];
const FRESH_COLOR: [number, number, number] = [0.79, 0.76, 0.71];
/** Where the stone lands: between the trench and the near edge. */
const DROP: [number, number] = [SPAN * 0.5, SPAN * 0.1];
const SAND_DRY = new THREE.Color("#d8c18f");
const SAND_DAMP = new THREE.Color("#9c8457");

/** What the scripted scene is doing, for the HUD and for screenshots taken at a known moment. */
type Phase = "pour" | "dig" | "drop" | "settle";

const phaseAt = (t: number): Phase => (t < 6 ? "pour" : t < 9 ? "dig" : t < 10.5 ? "drop" : "settle");

interface Flying {
  fragment: RockFragment;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  geometry: THREE.BufferGeometry;
  resting: boolean;
}

function geometryOf(fragment: RockFragment): THREE.BufferGeometry {
  const mesh = fragmentMesh(fragment, STONE_COLOR, FRESH_COLOR);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return geometry;
}

function surfaceAt(layer: GranularLayer, x: number, z: number): number {
  const gx = Math.round(x / SPACING);
  const gz = Math.round(z / SPACING);
  if (gx < 0 || gz < 0 || gx >= COLS || gz >= COLS) return 0;
  return LIFT + layer.surface(layer.index(gx, gz));
}

function GranularOverlay(_props: WorldOverlayProps) {
  const layer = useMemo(() => {
    const material = new Uint8Array(COLS * COLS);
    // The +x half is damp sand (on screen left from this camera): it piles steeper and holds a cut.
    for (let gz = 0; gz < COLS; gz += 1) for (let gx = COLS / 2; gx < COLS; gx += 1) material[gz * COLS + gx] = 1;
    const depth = new Float64Array(COLS * COLS).fill(0.15);
    return createGranularLayer({ cols: COLS, rows: COLS, spacingX: SPACING, materials: [DRY_SAND, DAMP_SAND], depth, material });
  }, []);
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(SPAN, SPAN, COLS - 1, COLS - 1);
    plane.rotateX(-Math.PI / 2);
    plane.translate(SPAN / 2 - SPACING / 2, 0, SPAN / 2 - SPACING / 2);
    const colors = new Float32Array(COLS * COLS * 3);
    plane.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return plane;
  }, []);
  const time = useRef(0);
  const flying = useRef<Flying[]>([]);
  const [stone, setStone] = useState<THREE.BufferGeometry | null>(null);
  const stoneMesh = useRef<THREE.Mesh>(null);
  const stoneState = useRef({ y: 4 + LIFT, v: 0, broken: false });
  const [, setVersion] = useState(0);
  const rock = useMemo(() => rockCell([STONE[0] / 2, STONE[1] / 2, STONE[2] / 2], 18, 0.2, seededRng("demo-stone")), []);

  useEffect(() => {
    const whole: RockFragment = { cell: rock, centre: [0, 0, 0], volume: cellVolume(rock).volume, mass: 0, size: 0, velocity: [0, 0, 0] };
    setStone(geometryOf(whole));
  }, [rock]);

  const writeSurface = () => {
    const positions = geometry.getAttribute("position");
    const colors = geometry.getAttribute("color");
    for (let gz = 0; gz < COLS; gz += 1) {
      for (let gx = 0; gx < COLS; gx += 1) {
        const cell = layer.index(gx, gz);
        const v = gz * COLS + gx;
        positions.setY(v, layer.surface(cell));
        const tint = (layer.material[cell] ?? 0) === 1 ? SAND_DAMP : SAND_DRY;
        const shade = 0.85 + 0.15 * Math.min(1, layer.depth(cell) / 0.3);
        colors.setXYZ(v, tint.r * shade, tint.g * shade, tint.b * shade);
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    geometry.computeVertexNormals();
  };

  useEffect(writeSurface, []);

  useFrame((_frame, frameDt) => {
    const dt = Math.min(frameDt, 1 / 30);
    time.current += dt;
    const t = time.current;
    const phase = phaseAt(t);
    if (phase === "pour") {
      // Two pours side by side, one on each sand.
      layer.deposit(SPAN * 0.3, SPAN * 0.5, 0.15, 0.012 * dt * 30, 0);
      layer.deposit(SPAN * 0.7, SPAN * 0.5, 0.15, 0.012 * dt * 30, 1);
    } else if (phase === "dig") {
      const s = (t - 6) / 3;
      layer.dig(SPAN * (0.15 + 0.7 * s), SPAN * 0.25, 0.25, 0.12);
    }
    layer.step(dt);
    writeSurface();

    const state = stoneState.current;
    if (t >= 9 && !state.broken) {
      state.v -= 9.81 * dt;
      state.y += state.v * dt;
      const ground = surfaceAt(layer, DROP[0], DROP[1]) + STONE[1] / 2;
      if (state.y <= ground) {
        state.broken = true;
        const centre: [number, number, number] = [DROP[0], ground, DROP[1]];
        const placed = { faces: rock.faces.map((face) => ({ fracture: face.fracture, vertices: face.vertices.map((p): [number, number, number] => [p[0] + centre[0], p[1] + centre[1], p[2] + centre[2]]) })) };
        const volume = cellVolume(placed).volume;
        const mass = volume * GRANITE_BREAKAGE.density;
        const energy = 0.5 * mass * state.v * state.v;
        const result = fractureRock(placed, { material: GRANITE_BREAKAGE, energy: Math.max(energy, 0.4 * KWH_PER_TONNE * mass), impactPoint: [centre[0], centre[1] - STONE[1] / 2, centre[2]], rng: seededRng("demo-break"), velocity: [0, state.v * 0.1, 0], kineticFraction: 0.004, force: true });
        flying.current = result.fragments.map((fragment) => ({ fragment, position: new THREE.Vector3(...fragment.centre), velocity: new THREE.Vector3(...fragment.velocity), geometry: geometryOf(fragment), resting: false }));
        // The fines become loose grit on the sand.
        if (result.finesMass > 0) layer.deposit(centre[0], centre[2], 0.3, result.finesMass / GRANITE_BREAKAGE.density, 0);
        setVersion((n) => n + 1);
      }
      if (stoneMesh.current !== null) stoneMesh.current.position.set(DROP[0], state.y, DROP[1]);
    }
    for (const piece of flying.current) {
      if (piece.resting) continue;
      piece.velocity.y -= 9.81 * dt;
      piece.position.addScaledVector(piece.velocity, dt);
      const ground = surfaceAt(layer, piece.position.x, piece.position.z) + piece.fragment.size * 0.3;
      if (piece.position.y < ground) {
        piece.position.y = ground;
        piece.velocity.multiplyScalar(0.3);
        piece.velocity.y = Math.abs(piece.velocity.y) * 0.2;
        if (piece.velocity.lengthSq() < 0.05) piece.resting = true;
      }
    }
  });

  return (
    <group position={[-SPAN / 2, 0, -SPAN / 2]}>
      <mesh position={[SPAN / 2 - SPACING / 2, LIFT / 2 - 0.02, SPAN / 2 - SPACING / 2]} receiveShadow>
        <boxGeometry args={[SPAN, LIFT, SPAN]} />
        <meshStandardMaterial color="#6f5f4a" roughness={1} />
      </mesh>
      <mesh geometry={geometry} position={[0, LIFT, 0]} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      {stone !== null && !stoneState.current.broken ? (
        <mesh ref={stoneMesh} geometry={stone} position={[DROP[0], 4 + LIFT, DROP[1]]} castShadow>
          <meshStandardMaterial vertexColors roughness={0.8} flatShading />
        </mesh>
      ) : null}
      {flying.current.map((piece, i) => (
        <FragmentView key={i} piece={piece} />
      ))}
    </group>
  );
}

function FragmentView({ piece }: { piece: Flying }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    ref.current?.position.copy(piece.position);
  });
  return (
    <mesh ref={ref} geometry={piece.geometry} castShadow>
      <meshStandardMaterial vertexColors roughness={0.8} flatShading />
    </mesh>
  );
}

function GranularUi() {
  return <div className="pointer-events-none absolute left-5 top-5 rounded bg-slate-950/75 px-4 py-3 font-mono text-sm text-slate-100">Granular flow · damp sand left, dry sand right · a trench dug across · a granite stone dropped and broken</div>;
}

const game = defineGame({
  name: "granular",
  assets: createAssetCatalog(),
  multiplayer: "off",
  world: { kind: "flat" },
  input: {},
  loop: { onInit: () => {}, onNewPlayer: () => {}, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  camera: { rig: "topDown", projection: "perspective", topDown: { yaw: 0.5, pitch: 0.85, height: 6.5 } },
  WorldOverlay: GranularOverlay,
  GameUI: GranularUi,
});

export const granularDemoGame: PlayableGame = game;
