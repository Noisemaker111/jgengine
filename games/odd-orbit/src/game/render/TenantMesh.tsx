/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { hashString } from "@jgengine/core/random/rng";
import { useGameContext } from "@jgengine/ui/provider";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

import { bodyColor, type AlienBodyPlan, type CreatureBodyShape } from "../creatures/bodyPlan";
import { moodOfNeeds } from "../agents";
import { MOOD_COLORS } from "../palette";
import { householdStore } from "../session/store";

/**
 * Every tenant is built from a handful of chunky primitives in its own silhouette: Glorp a wobbling
 * jelly with eye stalks, Sister Fog a drifting cluster of mist, Krrt three shiny segments on six
 * legs, the Twins one pear with two arguing heads, Old Basalt a cairn with a forge glowing in its
 * cracks, Pip-9 a boxy robot with one big eye, and Velvet a banded gas giant in a monocle. Each part
 * animates on the frame loop; the soft disc underneath shows the tenant's mood.
 */

type Part = THREE.Mesh | THREE.Group;
interface Rig {
  root: THREE.Group;
  /** Called every frame with elapsed seconds and whether the tenant is walking. */
  animate: (t: number, moving: boolean) => void;
  /** Materials that take the mood glow. */
  glow: THREE.MeshStandardMaterial[];
}

const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 16),
  lowSphere: new THREE.SphereGeometry(1, 12, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  torus: new THREE.TorusGeometry(1, 0.08, 8, 32),
  rock: new THREE.DodecahedronGeometry(1, 0),
  disc: new THREE.CircleGeometry(1, 32),
};

function mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, scale: [number, number, number], position: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(...scale);
  m.position.set(...position);
  m.castShadow = true;
  return m;
}

const EYE_WHITE = mat("#fff8ea", { roughness: 0.3 });
const PUPIL = mat("#1d1428", { roughness: 0.2 });

function eye(size: number, at: [number, number, number], look: [number, number, number] = [0, 0, 1]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...at);
  g.add(mesh(GEO.sphere, EYE_WHITE, [size, size, size]));
  g.add(mesh(GEO.sphere, PUPIL, [size * 0.5, size * 0.5, size * 0.5], [look[0] * size * 0.62, look[1] * size * 0.62, look[2] * size * 0.62]));
  return g;
}

function glorp(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const body = mat(bodyColor(plan, 55), { roughness: 0.15, transparent: true, opacity: 0.86, emissive: "#3a6b10", emissiveIntensity: 0.15 });
  const jelly = mesh(GEO.sphere, body, [0.72, 0.52, 0.72], [0, 0.52, 0]);
  root.add(jelly);
  const bubbles: THREE.Mesh[] = [];
  const bubbleMat = mat("#e9ffb0", { transparent: true, opacity: 0.7, roughness: 0.1 });
  for (let i = 0; i < 5; i++) { const b = mesh(GEO.lowSphere, bubbleMat, [0.06, 0.06, 0.06], [Math.sin(i * 2.1) * 0.35, 0.3 + i * 0.08, Math.cos(i * 2.1) * 0.35]); bubbles.push(b); root.add(b); }
  const stalks: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    s.position.set((i - 1) * 0.26, 0.86, 0.18);
    s.add(mesh(GEO.cyl, body, [0.04, 0.4, 0.04], [0, 0.2, 0]));
    s.add(eye(0.11, [0, 0.44, 0]));
    stalks.push(s);
    root.add(s);
  }
  return {
    root, glow: [body],
    animate(t, moving) {
      const w = moving ? 0.12 : 0.05;
      jelly.scale.set(0.72 + Math.sin(t * 3) * w * 0.6, 0.52 - Math.sin(t * 3) * w, 0.72 + Math.sin(t * 3) * w * 0.6);
      stalks.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.7 + i) * 0.25; s.rotation.x = Math.cos(t * 1.3 + i) * 0.15; });
      bubbles.forEach((b, i) => { b.position.y = 0.2 + ((t * 0.18 + i * 0.2) % 0.7); });
    },
  };
}

function fog(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const mist = mat(bodyColor(plan, 86), { transparent: true, opacity: 0.42, roughness: 1, depthWrite: false, emissive: "#9cc6ff", emissiveIntensity: 0.25 });
  const puffs: { m: THREE.Mesh; phase: number; r: number; h: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const s = 0.28 + (i % 3) * 0.1;
    const m = mesh(GEO.sphere, mist, [s, s * 0.85, s]);
    m.castShadow = false;
    puffs.push({ m, phase: i * 0.7, r: 0.18 + (i % 4) * 0.08, h: 0.55 + (i % 5) * 0.16 });
    root.add(m);
  }
  const face = new THREE.Group();
  face.position.set(0, 1.0, 0.32);
  face.add(mesh(GEO.sphere, PUPIL, [0.05, 0.07, 0.03], [-0.1, 0, 0]), mesh(GEO.sphere, PUPIL, [0.05, 0.07, 0.03], [0.1, 0, 0]));
  root.add(face);
  return {
    root, glow: [mist],
    animate(t) {
      puffs.forEach(({ m, phase, r, h }) => m.position.set(Math.cos(t * 0.5 + phase) * r, h + Math.sin(t * 0.9 + phase) * 0.06, Math.sin(t * 0.5 + phase) * r));
      face.position.y = 1.0 + Math.sin(t * 0.8) * 0.05;
    },
  };
}

function krrt(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const shell = mat(bodyColor(plan, 52), { roughness: 0.25, metalness: 0.2 });
  const dark = mat(bodyColor(plan, 24), { roughness: 0.4 });
  const body = new THREE.Group();
  body.add(mesh(GEO.sphere, shell, [0.3, 0.26, 0.44], [0, 0.55, -0.45]));
  body.add(mesh(GEO.sphere, shell, [0.24, 0.22, 0.26], [0, 0.62, 0]));
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.32);
  head.add(mesh(GEO.sphere, shell, [0.2, 0.18, 0.2]));
  for (let i = 0; i < 4; i++) head.add(eye(0.05, [(i % 2 === 0 ? -1 : 1) * (0.08 + Math.floor(i / 2) * 0.06), 0.07 - Math.floor(i / 2) * 0.05, 0.15]));
  const antennae: THREE.Mesh[] = [];
  for (const side of [-1, 1]) { const a = mesh(GEO.cyl, dark, [0.015, 0.42, 0.015], [side * 0.08, 0.3, 0.05]); a.rotation.set(-0.5, 0, side * 0.35); antennae.push(a); head.add(a); }
  body.add(head);
  const legs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = (Math.floor(i / 2) - 1) * 0.22;
    const leg = mesh(GEO.cyl, dark, [0.025, 0.62, 0.025], [side * 0.3, 0.32, z]);
    leg.rotation.z = side * 0.7;
    legs.push(leg);
    body.add(leg);
  }
  root.add(body);
  return {
    root, glow: [shell],
    animate(t, moving) {
      const speed = moving ? 9 : 1.2;
      legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * speed + i * 1.3) * (moving ? 0.45 : 0.05); });
      antennae.forEach((a, i) => { a.rotation.y = Math.sin(t * 2.4 + i) * 0.3; });
      body.position.y = moving ? Math.abs(Math.sin(t * speed)) * 0.03 : 0;
    },
  };
}

function twins(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const skin = mat(bodyColor(plan, 70), { roughness: 0.6 });
  const left = mat("#ffd36b", { roughness: 0.5 });
  const right = mat("#6b7cff", { roughness: 0.5 });
  root.add(mesh(GEO.sphere, skin, [0.48, 0.55, 0.42], [0, 0.6, 0]));
  root.add(mesh(GEO.cyl, skin, [0.07, 0.3, 0.07], [-0.22, 0.12, 0]), mesh(GEO.cyl, skin, [0.07, 0.3, 0.07], [0.22, 0.12, 0]));
  const heads: THREE.Group[] = [];
  for (const [side, hat] of [[-1, left], [1, right]] as const) {
    const neck = new THREE.Group();
    neck.position.set(side * 0.22, 1.05, 0);
    neck.add(mesh(GEO.cyl, skin, [0.07, 0.22, 0.07], [0, 0.1, 0]));
    const head = new THREE.Group();
    head.position.set(0, 0.34, 0);
    head.add(mesh(GEO.sphere, skin, [0.22, 0.21, 0.22]));
    head.add(eye(0.06, [-0.07, 0.04, 0.17], [side * 0.6, 0, 0.8]), eye(0.06, [0.07, 0.04, 0.17], [side * 0.6, 0, 0.8]));
    head.add(mesh(GEO.cone, hat, [0.12, 0.2, 0.12], [0, 0.26, 0]));
    neck.add(head);
    heads.push(neck);
    root.add(neck);
  }
  return {
    root, glow: [skin],
    animate(t) {
      // Two opinions: the heads take turns leaning in to make their point.
      heads.forEach((h, i) => { h.rotation.z = (i === 0 ? 1 : -1) * (0.15 + Math.max(0, Math.sin(t * 2.2 + i * Math.PI)) * 0.3); h.rotation.y = Math.sin(t * 1.1 + i) * 0.4; });
    },
  };
}

function basalt(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const stone = mat(bodyColor(plan, 26), { roughness: 0.95, flatShading: true });
  const magma = mat("#ff8a3d", { emissive: "#ff6a1a", emissiveIntensity: 1.4, roughness: 0.6 });
  const stones: THREE.Mesh[] = [];
  for (const [s, y, r] of [[0.55, 0.42, 0], [0.42, 0.98, 0.6], [0.3, 1.4, 1.2]] as const) {
    const m = mesh(GEO.rock, stone, [s, s * 0.8, s], [0, y, 0]);
    m.rotation.y = r;
    stones.push(m);
    root.add(m);
  }
  root.add(mesh(GEO.box, magma, [0.7, 0.04, 0.04], [0, 0.72, 0.35]), mesh(GEO.box, magma, [0.04, 0.3, 0.04], [0.18, 0.55, 0.42]));
  root.add(mesh(GEO.sphere, magma, [0.08, 0.06, 0.04], [0, 1.45, 0.27]));
  return {
    root, glow: [stone],
    animate(t) { stones[2]!.rotation.y = 1.2 + Math.sin(t * 0.2) * 0.05; magma.emissiveIntensity = 1.2 + Math.sin(t * 0.6) * 0.3; },
  };
}

function pip(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const paint = mat(bodyColor(plan, 62), { roughness: 0.35, metalness: 0.45 });
  const trim = mat("#f2efe6", { roughness: 0.4, metalness: 0.3 });
  const lens = mat("#7ff6ff", { emissive: "#38e8ff", emissiveIntensity: 1.6, roughness: 0.1 });
  const bulb = mat("#ff5d8f", { emissive: "#ff2d6f", emissiveIntensity: 1.5 });
  const body = new THREE.Group();
  body.add(mesh(GEO.box, paint, [0.62, 0.5, 0.48], [0, 0.55, 0]));
  body.add(mesh(GEO.box, trim, [0.5, 0.12, 0.5], [0, 0.32, 0]));
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0);
  head.add(mesh(GEO.box, trim, [0.5, 0.36, 0.42]));
  head.add(mesh(GEO.cyl, PUPIL, [0.14, 0.04, 0.14], [0, 0, 0.21]).rotateX(Math.PI / 2));
  head.add(mesh(GEO.sphere, lens, [0.1, 0.1, 0.05], [0, 0, 0.24]));
  head.add(mesh(GEO.cyl, trim, [0.015, 0.3, 0.015], [0.12, 0.33, 0]));
  const tip = mesh(GEO.sphere, bulb, [0.05, 0.05, 0.05], [0.12, 0.5, 0]);
  head.add(tip);
  body.add(head);
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.26, 0.18], [0.26, 0.18], [-0.26, -0.18], [0.26, -0.18]] as const) {
    const w = mesh(GEO.cyl, PUPIL, [0.11, 0.08, 0.11], [x, 0.12, z]);
    w.rotation.z = Math.PI / 2;
    wheels.push(w);
    body.add(w);
  }
  root.add(body);
  return {
    root, glow: [paint],
    animate(t, moving) {
      head.rotation.y = Math.sin(t * 0.7) * 0.35;
      head.rotation.z = Math.sin(t * 1.9) * 0.05;
      bulb.emissiveIntensity = Math.sin(t * 4) > 0 ? 1.8 : 0.2;
      if (moving) wheels.forEach((w) => { w.rotation.x += 0.3; });
      body.position.y = moving ? Math.sin(t * 14) * 0.01 : 0;
    },
  };
}

function velvet(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const gas = mat(bodyColor(plan, 64), { roughness: 0.45, emissive: "#3a1d55", emissiveIntensity: 0.2 });
  const band = mat("#ffe2f0", { roughness: 0.4 });
  const band2 = mat(bodyColor(plan, 40), { roughness: 0.4 });
  const gold = mat("#ffcf5a", { metalness: 0.8, roughness: 0.25 });
  const floater = new THREE.Group();
  floater.position.y = 1.15;
  floater.add(mesh(GEO.sphere, gas, [0.6, 0.56, 0.6]));
  for (const [y, m, r] of [[0.18, band, 0.56], [-0.08, band2, 0.6], [-0.3, band, 0.5]] as const) { const ring = mesh(GEO.torus, m, [r, r, r * 1.6], [0, y, 0]); ring.rotation.x = Math.PI / 2; floater.add(ring); }
  floater.add(eye(0.12, [-0.18, 0.2, 0.5]), eye(0.12, [0.18, 0.2, 0.5]));
  const monocle = mesh(GEO.torus, gold, [0.15, 0.15, 0.4], [0.18, 0.2, 0.6]);
  floater.add(monocle);
  const crown = new THREE.Group();
  crown.position.set(0.05, 0.56, 0);
  crown.rotation.z = -0.25;
  crown.add(mesh(GEO.cyl, gold, [0.15, 0.08, 0.15]));
  for (let i = 0; i < 5; i++) crown.add(mesh(GEO.cone, gold, [0.03, 0.09, 0.03], [Math.cos(i * 1.256) * 0.13, 0.08, Math.sin(i * 1.256) * 0.13]));
  floater.add(crown);
  const tendrils: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const t = mesh(GEO.cyl, gas, [0.03, 0.6, 0.03], [Math.cos(i * 1.57) * 0.25, -0.75, Math.sin(i * 1.57) * 0.25]); tendrils.push(t); floater.add(t); }
  root.add(floater);
  return {
    root, glow: [gas],
    animate(t) {
      floater.position.y = 1.15 + Math.sin(t * 0.9) * 0.1;
      floater.rotation.y = Math.sin(t * 0.3) * 0.2;
      tendrils.forEach((m, i) => { m.rotation.x = Math.sin(t * 1.4 + i) * 0.25; });
    },
  };
}

function generic(plan: AlienBodyPlan): Rig {
  const root = new THREE.Group();
  const skin = mat(bodyColor(plan, 64));
  root.add(mesh(GEO.sphere, skin, [0.4, plan.shape === "tall" ? 0.75 : 0.5, 0.4], [0, 0.7, 0]));
  root.add(eye(0.1, [0, 1.0, 0.33]));
  return { root, glow: [skin], animate() {} };
}

const BUILDERS: Record<CreatureBodyShape, (plan: AlienBodyPlan) => Rig> = {
  blob: glorp, mist: fog, insectoid: krrt, twin: twins, rock: basalt, robot: pip, balloon: velvet, tall: generic, round: generic,
};

export function buildTenantRig(plan: AlienBodyPlan): Rig {
  return BUILDERS[plan.shape](plan);
}

function planOf(entity: SceneEntity): AlienBodyPlan | null {
  const meta = entity.meta as { bodyPlan?: AlienBodyPlan } | null;
  return meta?.bodyPlan ?? null;
}

export function tenantMeshDraw(ctx: GameContext | null, entity: SceneEntity): EngineDraw {
  const group = new THREE.Group();
  const plan = planOf(entity);
  const phase = (hashString(entity.id) % 628) / 100;
  const rig = plan === null ? null : buildTenantRig(plan);
  const halo = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.03;
  halo.scale.setScalar(0.55);
  group.add(halo);
  if (rig !== null) {
    const scale = 0.9 + (plan!.size - 1) * 0.4;
    rig.root.scale.setScalar(scale);
    group.add(rig.root);
  }
  let lastTier: string | null = null;
  const memberNow = () => (ctx === null ? undefined : householdStore.read(ctx).members[entity.id]);
  return {
    mount(state: EngineFrameState) { state.scene.add(group); },
    frame(state: EngineFrameState) {
      if (rig === null) return;
      const member = memberNow();
      const moving = member !== undefined && (member.action.kind === "seek" || member.action.kind === "wander");
      rig.animate(state.clock.elapsedTime + phase, moving);
      const tier = member === undefined ? null : moodOfNeeds(member.needs).tier;
      if (tier !== lastTier) {
        lastTier = tier;
        const color = (tier === null ? undefined : MOOD_COLORS[tier]) ?? "#ffffff";
        (halo.material as THREE.MeshBasicMaterial).color.set(color);
        for (const material of rig.glow) { material.emissive.lerp(new THREE.Color(color), 0.25); }
      }
      state.invalidate();
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.traverse((node) => {
        const material = (node as THREE.Mesh).material as THREE.Material | undefined;
        if (material !== undefined && material !== EYE_WHITE && material !== PUPIL) material.dispose();
      });
      group.clear();
    },
  };
}

export function TenantMesh({ entity }: { entity: SceneEntity }) {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => tenantMeshDraw(ctx, entity)} deps={[ctx, entity]} />;
}

export type { Part };
