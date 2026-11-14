/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { useGameContext } from "@jgengine/ui/provider";

import { BEAM_RADIUS, MOWER_DECK_HALF_LENGTH, mowerPosition, SPRINKLER_JET_HALF_ANGLE, sprinklerWarming } from "../hazards";
import { ALARM_RADIUS, ALARM_SECONDS } from "../pheromone";
import { cellCentre } from "../pheromone";
import { activeJobs, jobProgress, queuedJobs } from "@jgengine/core/gameplay";
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
const ALARM_RINGS = 24;
const PUFFS = 48;
const DIG_SITES = 8;
const PUFF_SECONDS = 0.9;
const PUFF_COLOR: Record<string, THREE.Color> = { death: new THREE.Color("#c9b38a"), acid: new THREE.Color("#8dff5a"), chamber: new THREE.Color("#8a5a32") };
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

/** A giant broad leaf held up on its stalk over each authored shade spot: it casts the real shadow the
 * magnifying glass cannot burn through. */
function shadeCanopies(ground: (x: number, z: number) => number): THREE.Object3D[] {
  const leafMaterial = new THREE.MeshStandardMaterial({ color: "#3f9a2a", roughness: 0.6, side: THREE.DoubleSide });
  const veinMaterial = new THREE.MeshStandardMaterial({ color: "#2c6e1c", roughness: 0.7 });
  const stalkMaterial = new THREE.MeshStandardMaterial({ color: "#4f8a2a", roughness: 0.8 });
  return YARD.shade.map((spot, i) => {
    const group = new THREE.Group();
    const y = ground(spot.x, spot.z);
    const height = 6.5 + (i % 2) * 1.2;
    const leafGeometry = new THREE.CircleGeometry(1, 24);
    leafGeometry.scale(spot.radius * 0.95, spot.radius * 1.25, 1);
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.rotation.x = -Math.PI / 2 + 0.12;
    leaf.rotation.z = i * 1.3;
    leaf.position.set(spot.x, y + height, spot.z);
    leaf.castShadow = true;
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, spot.radius * 2.4), veinMaterial);
    vein.position.set(spot.x, y + height + 0.08, spot.z);
    vein.rotation.y = -i * 1.3;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, height, 8), stalkMaterial);
    stalk.position.set(spot.x + Math.cos(i) * spot.radius * 0.7, y + height / 2, spot.z + Math.sin(i) * spot.radius * 0.7);
    stalk.castShadow = true;
    group.add(leaf, vein, stalk);
    return group;
  });
}

/** Popsicle sticks laid over the hose at each authored crossing: the quick way across. */
function crossingBridges(ground: (x: number, z: number) => number): THREE.Object3D[] {
  const wood = new THREE.MeshStandardMaterial({ color: "#e8c48a", roughness: 0.85 });
  return YARD.crossings.map((crossing, i) => {
    const group = new THREE.Group();
    const y = ground(crossing.x, crossing.z);
    for (const offset of [-0.7, 0.7]) {
      const stick = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, crossing.radius * 2.2), wood);
      stick.position.set(crossing.x + offset, y + 2.6, crossing.z);
      stick.rotation.y = 0.3 + i * 0.5;
      stick.rotation.x = 0.04;
      stick.castShadow = true;
      stick.receiveShadow = true;
      group.add(stick);
    }
    return group;
  });
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
  // Alarm clouds: a red ring that swells out to the cloud's reach and fades as it does.
  const ringGeometry = new THREE.RingGeometry(0.86, 1, 40);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: "#ff3b2f", transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, ALARM_RINGS);
  rings.frustumCulled = false;
  rings.count = 0;
  // Puffs: a dust burst where a body falls, a green splash where acid lands, a soil cloud for a chamber.
  const puffGeometry = new THREE.IcosahedronGeometry(1, 1);
  const puffMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
  const puffs = new THREE.InstancedMesh(puffGeometry, puffMaterial, PUFFS);
  puffs.frustumCulled = false;
  puffs.count = 0;
  const puffColor = new THREE.Color();
  // Dig sites: a ring of turned soil marking where a chamber is going in, filling as the dig goes.
  const siteRingGeometry = new THREE.RingGeometry(2.6, 3.2, 32);
  siteRingGeometry.rotateX(-Math.PI / 2);
  const siteFillGeometry = new THREE.CircleGeometry(2.6, 32);
  siteFillGeometry.rotateX(-Math.PI / 2);
  const siteRingMaterial = new THREE.MeshStandardMaterial({ color: "#7a4a26", roughness: 1 });
  const siteFillMaterial = new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.45, depthWrite: false });
  const siteRings = new THREE.InstancedMesh(siteRingGeometry, siteRingMaterial, DIG_SITES);
  const siteFills = new THREE.InstancedMesh(siteFillGeometry, siteFillMaterial, DIG_SITES);
  siteRings.frustumCulled = false;
  siteFills.frustumCulled = false;
  siteRings.count = 0;
  siteFills.count = 0;
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
      root.add(rings, puffs, siteRings, siteFills, beamGroup, trails, ...shadeCanopies(ground), ...crossingBridges(ground));
      state.scene.add(root);
    },
    frame(state: EngineFrameState, delta: number) {
      const hz = session.hazards;
      const t = state.clock.elapsedTime;

      // Sprinkler: aim the nozzle and throw droplets along a parabola over the jet's reach.
      if (head !== null && sprinkler !== null) {
        head.rotation.y = hz.sprinkler.angle;
        const spraying = hz.toggles.sprinkler && hz.sprinkler.on;
        const warming = sprinklerWarming(hz, YARD);
        drops.visible = spraying || warming;
        // The tell: in the seconds before it sprays, the head spins and dribbles a short weak arc.
        if (warming) head.rotation.y += Math.sin(t * 30) * 0.08;
        if (spraying || warming) {
          const baseY = ground(sprinkler.x, sprinkler.z) + 3.8;
          for (let i = 0; i < DROPS; i += 1) {
            const f = ((i * 0.6180339) + t * 0.9) % 1;
            const spread = ((i * 7919) % 100) / 100 - 0.5;
            const angle = hz.sprinkler.angle + spread * SPRINKLER_JET_HALF_ANGLE * 2 * (0.6 + 0.6 * f);
            const d = f * sprinkler.reach * (spraying ? 1 : 0.18);
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

      // Alarm rings swell over the cloud's life.
      const now = session.elapsed;
      let r = 0;
      for (const alarm of session.alarms) {
        if (r >= ALARM_RINGS) break;
        const life = Math.max(0, Math.min(1, (now - alarm.at) / ALARM_SECONDS));
        p.set(alarm.x, ground(alarm.x, alarm.z) + 0.15, alarm.z);
        const radius = ALARM_RADIUS * (0.25 + 0.75 * Math.sqrt(life));
        s.set(radius, 1, radius);
        m.compose(p, q, s);
        rings.setMatrixAt(r, m);
        r += 1;
      }
      rings.count = r;
      rings.instanceMatrix.needsUpdate = true;
      ringMaterial.opacity = 0.55;

      // Puffs swell and fade over a second.
      let n2 = 0;
      for (const fx of session.fx) {
        const age = now - fx.at;
        if (age < 0 || age > PUFF_SECONDS || n2 >= PUFFS) continue;
        const k = age / PUFF_SECONDS;
        const size = (fx.kind === "chamber" ? 3.2 : fx.kind === "acid" ? 0.7 : 1.1) * (0.4 + k);
        p.set(fx.x, ground(fx.x, fx.z) + 0.4 + k * (fx.kind === "chamber" ? 2 : 0.8), fx.z);
        s.setScalar(size * (1 - k * 0.3));
        m.compose(p, q, s);
        puffs.setMatrixAt(n2, m);
        puffColor.copy(PUFF_COLOR[fx.kind] ?? PUFF_COLOR["death"]!).multiplyScalar(1 - k * 0.5);
        puffs.setColorAt(n2, puffColor);
        n2 += 1;
      }
      puffs.count = n2;
      puffs.instanceMatrix.needsUpdate = true;
      if (puffs.instanceColor !== null) puffs.instanceColor.needsUpdate = true;

      // Dig sites: every chamber being dug, with its fill showing how far along it is.
      let d = 0;
      const digging = [...activeJobs(session.buildQueue).map((job) => ({ spec: job.spec, progress: jobProgress(job) })), ...queuedJobs(session.buildQueue).map((job) => ({ spec: job.spec, progress: 0 }))];
      for (const job of digging) {
        if (d >= DIG_SITES) break;
        const gy = ground(job.spec.x, job.spec.z) + 0.06;
        p.set(job.spec.x, gy, job.spec.z);
        s.set(1, 1, 1);
        m.compose(p, q, s);
        siteRings.setMatrixAt(d, m);
        const fill = Math.max(0.05, job.progress);
        s.set(fill, 1, fill);
        p.y = gy + 0.02;
        m.compose(p, q, s);
        siteFills.setMatrixAt(d, m);
        d += 1;
      }
      siteRings.count = d;
      siteFills.count = d;
      siteRings.instanceMatrix.needsUpdate = true;
      siteFills.instanceMatrix.needsUpdate = true;

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
