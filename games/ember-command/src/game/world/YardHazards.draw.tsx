/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { useGameContext } from "@jgengine/ui/provider";

import { BEAM_RADIUS, MOWER_DECK_HALF_LENGTH, mowerPosition, SPRINKLER_JET_HALF_ANGLE } from "../hazards";
import { cellCentre } from "../pheromone";
import { session } from "../session";
import { YARD } from "../yardInstance";

/**
 * Everything the yard's hazards and the colony's scent look like, drawn from `session` each frame:
 *
 * - the sprinkler head on the hose's end, and its arcing jet of droplets while it sprays;
 * - the red lawnmower that roars down its lane (a pulsing warning stripe before it comes);
 * - the magnifying glass: a column of hard white light and a scorching disc that smokes;
 * - the pheromone trails, as a glowing amber dotted film over the lawn.
 */

const DROPS = 220;
const TRAIL_CAPACITY = 2400;

function sprinklerHead(): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: "#c7ccd4", metalness: 0.85, roughness: 0.25 });
  const green = new THREE.MeshStandardMaterial({ color: "#2f9e3a", roughness: 0.4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 0.8, 20), green);
  base.position.y = 0.4;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.6, 12), metal);
  stem.position.y = 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), metal);
  head.position.y = 3.4;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.4, 8), metal);
  nozzle.name = "nozzle";
  nozzle.rotation.x = Math.PI / 2.6;
  nozzle.position.set(0, 3.7, 0.6);
  for (const mesh of [base, stem, head, nozzle]) { mesh.castShadow = true; mesh.receiveShadow = true; }
  group.add(base, stem, head, nozzle);
  return group;
}

/** A push mower seen from an ant: a towering red deck on four huge wheels, a blur of blade beneath. */
function mowerBody(): THREE.Group {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: "#e0301e", roughness: 0.35, metalness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: "#d9dde3", metalness: 0.9, roughness: 0.2 });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(MOWER_DECK_HALF_LENGTH + 0.6, MOWER_DECK_HALF_LENGTH + 1, 3.4, 28), red);
  deck.position.y = 4.4;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), red);
  hood.position.y = 6;
  const engine = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.6), black);
  engine.position.y = 8.4;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(MOWER_DECK_HALF_LENGTH, MOWER_DECK_HALF_LENGTH, 0.08, 24), steel);
  blade.name = "blade";
  blade.position.y = 2.4;
  group.add(deck, hood, engine, blade);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.2, 20), black);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x * (MOWER_DECK_HALF_LENGTH + 1.2), 2.3, z * (MOWER_DECK_HALF_LENGTH - 0.6));
    wheel.name = "wheel";
    group.add(wheel);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 22, 8), steel);
  handle.rotation.x = -0.9;
  handle.position.set(0, 13, -8);
  group.add(handle);
  group.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; } });
  return group;
}

function yardHazardsDraw(ctx: GameContext | null): EngineDraw {
  const root = new THREE.Group();
  const sprinkler = YARD.sprinkler;
  const head = sprinkler === null ? null : sprinklerHead();
  const dropGeometry = new THREE.SphereGeometry(0.16, 6, 4);
  const dropMaterial = new THREE.MeshStandardMaterial({ color: "#bfe9ff", transparent: true, opacity: 0.8, roughness: 0.05, emissive: "#3aa6ff", emissiveIntensity: 0.25 });
  const drops = new THREE.InstancedMesh(dropGeometry, dropMaterial, DROPS);
  drops.frustumCulled = false;
  const mower = mowerBody();
  mower.visible = false;
  const warnMaterial = new THREE.MeshBasicMaterial({ color: "#ff3b2f", transparent: true, opacity: 0, depthWrite: false });
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), warnMaterial);
  warn.rotation.x = -Math.PI / 2;
  const beamMaterial = new THREE.MeshBasicMaterial({ color: "#fffbe0", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(BEAM_RADIUS * 0.35, BEAM_RADIUS * 2.2, 60, 24, 1, true), beamMaterial);
  const spotMaterial = new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const spot = new THREE.Mesh(new THREE.CircleGeometry(BEAM_RADIUS, 32), spotMaterial);
  spot.rotation.x = -Math.PI / 2;
  const coreSpot = new THREE.Mesh(new THREE.CircleGeometry(BEAM_RADIUS * 0.4, 20), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false }));
  coreSpot.rotation.x = -Math.PI / 2;
  const lensGroup = new THREE.Group();
  const lensRim = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 10, 40), new THREE.MeshStandardMaterial({ color: "#3a2a1a", roughness: 0.5 }));
  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(8.6, 36), new THREE.MeshStandardMaterial({ color: "#d8f3ff", transparent: true, opacity: 0.25, roughness: 0.02, metalness: 0.1, side: THREE.DoubleSide }));
  lensRim.rotation.x = Math.PI / 2;
  lensGlass.rotation.x = -Math.PI / 2;
  lensGroup.add(lensRim, lensGlass);
  const beamGroup = new THREE.Group();
  beamGroup.add(beam, spot, coreSpot, lensGroup);
  beamGroup.visible = false;

  const trailGeometry = new THREE.CircleGeometry(0.55, 8);
  trailGeometry.rotateX(-Math.PI / 2);
  const trailMaterial = new THREE.MeshBasicMaterial({ color: "#ffb02e", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const trails = new THREE.InstancedMesh(trailGeometry, trailMaterial, TRAIL_CAPACITY);
  trails.frustumCulled = false;
  trails.count = 0;
  let trailVersion = -1;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const ground = (x: number, z: number): number => ctx?.world.groundHeightAt(x, z) ?? 0;

  return {
    mount(state: EngineFrameState) {
      if (head !== null && sprinkler !== null) {
        head.position.set(sprinkler.x, ground(sprinkler.x, sprinkler.z), sprinkler.z);
        root.add(head, drops);
      }
      if (YARD.mowerLane !== null) {
        const lane = YARD.mowerLane;
        const length = Math.hypot(lane.to.x - lane.from.x, lane.to.z - lane.from.z);
        warn.scale.set(length, lane.halfWidth * 2, 1);
        warn.rotation.z = Math.atan2(lane.to.z - lane.from.z, lane.to.x - lane.from.x);
        const mx = (lane.from.x + lane.to.x) / 2;
        const mz = (lane.from.z + lane.to.z) / 2;
        warn.position.set(mx, ground(mx, mz) + 0.12, mz);
        root.add(mower, warn);
      }
      root.add(beamGroup, trails);
      state.scene.add(root);
    },
    frame(state: EngineFrameState, delta: number) {
      const hz = session.hazards;
      const t = state.clock.elapsedTime;

      // Sprinkler: aim the nozzle and throw droplets along a parabola over the jet's reach.
      if (head !== null && sprinkler !== null) {
        head.rotation.y = hz.sprinkler.angle;
        const spraying = hz.toggles.sprinkler && hz.sprinkler.on;
        drops.visible = spraying;
        if (spraying) {
          const baseY = ground(sprinkler.x, sprinkler.z) + 3.8;
          for (let i = 0; i < DROPS; i += 1) {
            const f = ((i * 0.6180339) + t * 0.9) % 1;
            const spread = ((i * 7919) % 100) / 100 - 0.5;
            const angle = hz.sprinkler.angle + spread * SPRINKLER_JET_HALF_ANGLE * 2 * (0.6 + 0.6 * f);
            const d = f * sprinkler.reach;
            const x = sprinkler.x + Math.sin(angle) * d;
            const z = sprinkler.z + Math.cos(angle) * d;
            const y = baseY + Math.sin(f * Math.PI) * 7 - f * 3.4 + ground(x, z) * f;
            p.set(x, y, z);
            s.setScalar(0.7 + ((i * 31) % 10) / 12);
            m.compose(p, q, s);
            drops.setMatrixAt(i, m);
          }
          drops.instanceMatrix.needsUpdate = true;
        }
      }

      // Mower: warning stripe pulses, then the deck rolls down the lane with its blade spinning.
      const deck = mowerPosition(hz, YARD);
      mower.visible = deck !== null;
      warnMaterial.opacity = hz.mower.phase === "warning" ? 0.25 + 0.2 * Math.sin(t * 10) : hz.mower.phase === "crossing" ? 0.18 : 0;
      if (deck !== null && YARD.mowerLane !== null) {
        const lane = YARD.mowerLane;
        mower.position.set(deck.x, ground(deck.x, deck.z), deck.z);
        const heading = Math.atan2(lane.to.x - lane.from.x, lane.to.z - lane.from.z) + (hz.mower.direction === 1 ? 0 : Math.PI);
        mower.rotation.y = heading;
        mower.position.y += Math.sin(t * 40) * 0.08;
        for (const child of mower.children) {
          if (child.name === "blade") child.rotation.y += delta * 40;
          if (child.name === "wheel") child.rotation.x += delta * 6;
        }
      }

      // Beam: the lens hangs high over the spot; the column fades while the kid's hand wobbles.
      beamGroup.visible = hz.toggles.beam;
      if (hz.toggles.beam) {
        const gy = ground(hz.beam.x, hz.beam.z);
        const focused = hz.beam.focused;
        spot.position.set(hz.beam.x, gy + 0.15, hz.beam.z);
        coreSpot.position.set(hz.beam.x, gy + 0.18, hz.beam.z);
        beam.position.set(hz.beam.x, gy + 30, hz.beam.z);
        lensGroup.position.set(hz.beam.x - 4, gy + 58, hz.beam.z + 3);
        const flicker = 0.85 + Math.sin(t * 23) * 0.08 + Math.sin(t * 7) * 0.07;
        beamMaterial.opacity = focused ? 0.32 * flicker : 0.06;
        spotMaterial.opacity = focused ? 0.8 * flicker : 0.18;
        spot.scale.setScalar(focused ? 1 : 2.4);
        coreSpot.visible = focused;
      }

      // Pheromone: refresh the instanced dots only when the scent grid changed.
      const field = session.trails;
      if (field.version !== trailVersion) {
        trailVersion = field.version;
        let n = 0;
        for (let i = 0; i < field.scent.length && n < TRAIL_CAPACITY; i += 1) {
          const scent = field.scent[i]!;
          if (scent <= 0) continue;
          const c = cellCentre(field, i);
          p.set(c.x, ground(c.x, c.z) + 0.08, c.z);
          s.set(0.4 + scent * 1.4, 1, 0.4 + scent * 1.4);
          m.compose(p, q, s);
          trails.setMatrixAt(n, m);
          n += 1;
        }
        trails.count = n;
        trails.instanceMatrix.needsUpdate = true;
      }
      trailMaterial.opacity = 0.42 + Math.sin(t * 2.2) * 0.1;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      root.clear();
      dropGeometry.dispose();
      dropMaterial.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
    },
  };
}

export function YardHazards() {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => yardHazardsDraw(ctx)} deps={[ctx]} />;
}
