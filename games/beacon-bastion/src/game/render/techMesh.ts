import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

import { CREEP_CATALOG, type CreepDef, type TechMesh } from "../entities/enemies/catalog";
import { session } from "../session";
import { UPDATE_RULE } from "../waves/director";

/**
 * The technology has no catalog models: each kind is a few stylized primitives with big readable
 * silhouettes and a glowing face, built here and animated per frame (fans spin, rotors whirr, LEDs
 * blink, phones hop). Geometries and materials are shared across every instance of the street.
 */

/** Small tech draws larger than its hitbox, so a phone reads as a phone from the street camera; the bosses are big enough already. */
const techVisualScale = (scale: number): number => (scale >= 1.8 ? 1.3 : 2.4);

const geometries = new Map<string, BufferGeometry>();
const materials = new Map<string, MeshStandardMaterial>();

function geo(key: string, make: () => BufferGeometry): BufferGeometry {
  let value = geometries.get(key);
  if (value === undefined) {
    value = make();
    geometries.set(key, value);
  }
  return value;
}

function mat(color: string, glow = 0, roughness = 0.55): MeshStandardMaterial {
  const key = `${color}:${glow}:${roughness}`;
  let value = materials.get(key);
  if (value === undefined) {
    value = new MeshStandardMaterial({ color, roughness, metalness: 0.05, ...(glow > 0 ? { emissive: color, emissiveIntensity: glow } : {}) });
    materials.set(key, value);
  }
  return value;
}

function part(geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

const box = (w: number, h: number, d: number) => geo(`box:${w}:${h}:${d}`, () => new BoxGeometry(w, h, d));
const cyl = (top: number, bottom: number, h: number, seg = 16) => geo(`cyl:${top}:${bottom}:${h}:${seg}`, () => new CylinderGeometry(top, bottom, h, seg));
const ball = (r: number) => geo(`ball:${r}`, () => new SphereGeometry(r, 14, 10));
const plane = (w: number, h: number) => geo(`plane:${w}:${h}`, () => new PlaneGeometry(w, h));
const ring = (r: number, tube: number) => geo(`ring:${r}:${tube}`, () => new TorusGeometry(r, tube, 8, 24));
const capsule = (r: number, h: number) => geo(`capsule:${r}:${h}`, () => new CapsuleGeometry(r, h, 4, 10));

/** What a frame animates on one built body. */
interface Rig {
  spin: { node: Object3D; axis: "x" | "y" | "z"; speed: number }[];
  blink: { node: Mesh; period: number; phase: number }[];
  /** The body that hops, bobs or hovers. */
  body: Object3D;
  motion: "hop" | "hover" | "roll" | "still";
  /** The node a lost-power data center flickers. */
  lights: Mesh[];
  /** A drone's parcel, hidden once dropped. */
  parcel: Object3D | null;
}

/** Two eyes and a smile on a screen facing +Z: the gadgets are goofy, not menacing. */
function face(parent: Object3D, width: number, y: number, z: number, ink = "#10131a"): void {
  const eye = ball(width * 0.09);
  const eyes = mat(ink);
  parent.add(part(eye, eyes, -width * 0.2, y + width * 0.08, z), part(eye, eyes, width * 0.2, y + width * 0.08, z));
  const mouth = part(box(width * 0.36, width * 0.06, 0.02), eyes, 0, y - width * 0.16, z);
  parent.add(mouth);
}

function newRig(body: Object3D, motion: Rig["motion"]): Rig {
  return { spin: [], blink: [], body, motion, lights: [], parcel: null };
}

function build(def: CreepDef): { root: Group; rig: Rig } {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const shell = mat(def.color, 0, 0.45);
  const glow = mat(def.glow, 1.1, 0.3);
  const dark = mat("#22252c", 0, 0.6);
  const white = mat("#f4f6f8", 0, 0.5);
  const kind: TechMesh = def.mesh;
  const rig = newRig(body, "still");
  switch (kind) {
    case "phone": {
      rig.motion = "hop";
      const slab = part(box(0.95, 1.65, 0.16), shell, 0, 1.0, 0);
      const screen = part(plane(0.8, 1.42), glow, 0, 1.0, 0.085);
      body.add(slab, screen);
      face(body, 0.8, 1.05, 0.1, "#0b1830");
      body.add(part(box(0.18, 0.3, 0.12), dark, -0.28, 0.12, 0), part(box(0.18, 0.3, 0.12), dark, 0.28, 0.12, 0));
      // Leaned well back so its screen and face look up at the street camera.
      body.rotation.x = -0.6;
      break;
    }
    case "earbuds": {
      rig.motion = "hop";
      for (const x of [-0.22, 0.22]) {
        const bud = new Group();
        bud.position.set(x, 0.3, 0);
        bud.add(part(ball(0.2), shell), part(capsule(0.07, 0.3), shell, 0, -0.22, 0.05), part(ball(0.07), glow, 0, 0.05, 0.17));
        body.add(bud);
      }
      break;
    }
    case "watch": {
      rig.motion = "hop";
      body.add(part(box(0.32, 1.3, 0.1), mat("#3a6aff"), 0, 0.85, -0.02));
      body.add(part(box(0.7, 0.7, 0.2), shell, 0, 0.85, 0.05), part(plane(0.58, 0.58), glow, 0, 0.85, 0.16));
      face(body, 0.55, 0.85, 0.17);
      body.rotation.x = -0.45;
      break;
    }
    case "flock": {
      rig.motion = "still";
      for (const angle of [0, 2.1, 4.2]) {
        const leg = part(cyl(0.04, 0.05, 1.7, 6), dark, Math.sin(angle) * 0.35, 0.8, Math.cos(angle) * 0.35);
        leg.rotation.set(Math.cos(angle) * 0.22, 0, -Math.sin(angle) * 0.22);
        body.add(leg);
      }
      const head = new Group();
      head.position.y = 1.75;
      head.add(part(box(0.9, 0.45, 0.5), shell), part(cyl(0.17, 0.17, 0.22, 16), dark, 0, 0, 0.32));
      const lens = part(ball(0.12), glow, 0, 0, 0.42);
      head.add(lens, part(box(1.1, 0.04, 0.7), mat("#2a3a6a", 0.3), 0, 0.32, 0));
      head.children[1]!.rotation.x = Math.PI / 2;
      body.add(head);
      rig.spin.push({ node: head, axis: "y", speed: 0.9 });
      rig.blink.push({ node: lens, period: 0.8, phase: 0 });
      break;
    }
    case "speaker": {
      rig.motion = "hop";
      body.add(part(cyl(0.42, 0.45, 1.0, 20), mat(def.color, 0, 0.9), 0, 0.5, 0));
      const top = part(ring(0.34, 0.06), glow, 0, 1.02, 0);
      top.rotation.x = Math.PI / 2;
      body.add(top, part(cyl(0.3, 0.3, 0.04, 20), dark, 0, 1.02, 0));
      rig.blink.push({ node: top, period: 1.4, phase: 0.3 });
      break;
    }
    case "vacuum": {
      rig.motion = "roll";
      body.add(part(cyl(0.75, 0.78, 0.24, 24), shell, 0, 0.16, 0), part(cyl(0.79, 0.79, 0.1, 24), dark, 0, 0.1, 0));
      const button = part(ball(0.1), glow, 0, 0.3, 0.3);
      body.add(button, part(cyl(0.25, 0.25, 0.06, 16), mat("#9aa0aa"), 0, 0.3, -0.1));
      const brush = part(box(0.9, 0.04, 0.08), mat("#c84a4a"), 0.55, 0.05, 0.55);
      body.add(brush);
      rig.spin.push({ node: brush, axis: "y", speed: 8 });
      rig.blink.push({ node: button, period: 1.1, phase: 0 });
      break;
    }
    case "drone": {
      rig.motion = "hover";
      body.add(part(box(0.7, 0.22, 0.7), shell, 0, 0, 0), part(ball(0.12), glow, 0, 0, 0.36));
      for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]] as const) {
        const arm = part(box(0.08, 0.06, 0.8), dark, x / 2, 0.05, z / 2);
        arm.rotation.y = Math.atan2(x, z);
        const rotor = part(box(0.62, 0.02, 0.08), mat("#1a1a1a"), x, 0.14, z);
        body.add(arm, rotor);
        rig.spin.push({ node: rotor, axis: "y", speed: 30 });
      }
      const parcel = new Group();
      parcel.add(part(box(0.5, 0.42, 0.5), mat("#c08a4a", 0, 0.9), 0, -0.45, 0), part(box(0.52, 0.06, 0.12), mat("#e8d27a"), 0, -0.24, 0));
      body.add(parcel);
      rig.parcel = parcel;
      break;
    }
    case "scooter": {
      rig.motion = "roll";
      body.add(part(box(0.34, 0.1, 1.3), shell, 0, 0.25, 0));
      for (const z of [-0.55, 0.55]) {
        const wheel = part(cyl(0.2, 0.2, 0.12, 14), dark, 0, 0.2, z);
        wheel.rotation.z = Math.PI / 2;
        body.add(wheel);
      }
      const stem = part(cyl(0.04, 0.04, 1.2, 8), dark, 0, 0.85, 0.58);
      stem.rotation.x = -0.15;
      body.add(stem, part(box(0.7, 0.06, 0.06), dark, 0, 1.44, 0.66), part(box(0.22, 0.12, 0.08), glow, 0, 1.36, 0.7));
      break;
    }
    case "fridge": {
      rig.motion = "hop";
      body.add(part(box(1.0, 2.0, 0.85), shell, 0, 1.05, 0));
      body.add(part(box(1.02, 0.03, 0.87), dark, 0, 1.35, 0));
      body.add(part(box(0.06, 0.5, 0.06), mat("#9aa0aa"), 0.38, 1.7, 0.45), part(box(0.06, 0.6, 0.06), mat("#9aa0aa"), 0.38, 0.9, 0.45));
      const screen = part(plane(0.5, 0.36), glow, -0.12, 0.95, 0.43);
      body.add(screen);
      face(body, 0.42, 0.95, 0.44);
      break;
    }
    case "gpu": {
      rig.motion = "roll";
      body.add(part(box(1.7, 0.36, 0.85), shell, 0, 0.4, 0), part(box(1.72, 0.06, 0.87), glow, 0, 0.6, 0));
      for (const x of [-0.42, 0.42]) {
        const housing = part(cyl(0.34, 0.34, 0.06, 20), dark, x, 0.62, 0);
        const fan = part(box(0.6, 0.02, 0.12), mat("#555a66"), x, 0.67, 0);
        const fan2 = part(box(0.12, 0.02, 0.6), mat("#555a66"), x, 0.67, 0);
        body.add(housing, fan, fan2);
        rig.spin.push({ node: fan, axis: "y", speed: 14 }, { node: fan2, axis: "y", speed: 14 });
      }
      body.add(part(box(0.3, 0.2, 0.06), mat("#c8a84a"), 0.7, 0.2, 0.43));
      break;
    }
    case "rig": {
      rig.motion = "roll";
      for (const [x, z] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]] as const) body.add(part(box(0.06, 1.5, 0.06), mat("#8a8a94"), x, 0.75, z));
      for (const y of [0.35, 0.8, 1.25]) {
        body.add(part(box(1.1, 0.12, 0.7), dark, 0, y, 0));
        const strip = part(box(1.12, 0.04, 0.05), mat(def.glow, 1.2), 0, y + 0.08, 0.36);
        body.add(strip);
        rig.blink.push({ node: strip, period: 0.5 + y * 0.2, phase: y });
      }
      const coin = part(cyl(0.3, 0.3, 0.06, 20), mat("#ffc83a", 0.6, 0.3), 0, 1.85, 0);
      coin.rotation.x = Math.PI / 2;
      body.add(coin);
      rig.spin.push({ node: coin, axis: "y", speed: 3 });
      break;
    }
    case "car": {
      rig.motion = "roll";
      body.add(part(box(1.3, 0.55, 2.3), shell, 0, 0.5, 0), part(box(1.1, 0.5, 1.2), mat("#9fd8ff", 0.25, 0.2), 0, 0.98, -0.1));
      for (const [x, z] of [[-0.62, -0.75], [0.62, -0.75], [-0.62, 0.75], [0.62, 0.75]] as const) {
        const wheel = part(cyl(0.26, 0.26, 0.18, 14), dark, x, 0.26, z);
        wheel.rotation.z = Math.PI / 2;
        body.add(wheel);
      }
      const lidar = part(cyl(0.16, 0.18, 0.22, 12), dark, 0, 1.35, -0.1);
      const beam = part(box(0.42, 0.05, 0.05), glow, 0, 1.4, -0.1);
      body.add(lidar, beam, part(box(0.3, 0.12, 0.04), glow, -0.4, 0.55, 1.16), part(box(0.3, 0.12, 0.04), glow, 0.4, 0.55, 1.16));
      rig.spin.push({ node: beam, axis: "y", speed: 6 });
      break;
    }
    case "chatbot": {
      rig.motion = "hover";
      body.position.y = 0.6;
      body.add(part(box(1.3, 0.85, 0.35), shell, 0, 1.0, 0), part(ball(0.43), shell, -0.65, 1.0, 0), part(ball(0.43), shell, 0.65, 1.0, 0));
      const tail = part(geo("cone:tail", () => new ConeGeometry(0.2, 0.45, 8)), shell, -0.35, 0.45, 0);
      tail.rotation.z = Math.PI * 0.85;
      body.add(tail, part(plane(1.5, 0.6), mat("#f0eaff", 0.4), 0, 1.0, 0.18));
      for (const [index, x] of [-0.35, 0, 0.35].entries()) {
        const dot = part(ball(0.1), mat(def.color, 0.9), x, 1.0, 0.22);
        body.add(dot);
        rig.blink.push({ node: dot, period: 1.2, phase: index * 0.25 });
      }
      break;
    }
    case "router": {
      rig.motion = "hop";
      body.add(part(box(1.0, 0.25, 0.7), shell, 0, 0.2, 0));
      for (const x of [-0.4, 0, 0.4]) body.add(part(cyl(0.03, 0.04, 0.8, 6), dark, x, 0.7, -0.3));
      for (const [index, x] of [-0.3, -0.1, 0.1, 0.3].entries()) {
        const led = part(ball(0.05), glow, x, 0.25, 0.36);
        body.add(led);
        rig.blink.push({ node: led, period: 0.35 + index * 0.1, phase: index * 0.13 });
      }
      for (const [index, radius] of [0.35, 0.6, 0.85].entries()) {
        const wave = part(geo(`arc:${radius}`, () => new TorusGeometry(radius, 0.04, 6, 16, Math.PI / 2)), glow, 0, 1.0, 0);
        wave.rotation.z = Math.PI / 4;
        body.add(wave);
        rig.blink.push({ node: wave, period: 1.2, phase: index * 0.3 });
      }
      break;
    }
    case "backup": {
      rig.motion = "hop";
      body.add(part(box(0.32, 0.14, 0.6), shell, 0, 0.2, 0), part(box(0.22, 0.1, 0.2), mat("#c8ccd4", 0, 0.2), 0, 0.2, 0.38), part(ball(0.04), glow, 0, 0.29, -0.1));
      break;
    }
    case "server": {
      rig.motion = "roll";
      body.add(part(box(1.15, 2.3, 1.0), shell, 0, 1.2, 0));
      for (let row = 0; row < 7; row += 1) {
        const y = 0.35 + row * 0.3;
        body.add(part(box(1.0, 0.04, 0.02), mat("#3a3e48"), 0, y + 0.1, 0.51));
        for (const [index, x] of [-0.38, -0.28, -0.18].entries()) {
          const led = part(box(0.06, 0.06, 0.02), mat(row % 3 === 0 ? "#ffb020" : def.glow, 1.4), x, y, 0.52);
          body.add(led);
          rig.blink.push({ node: led, period: 0.3 + ((row * 3 + index) % 5) * 0.11, phase: row * 0.17 + index * 0.07 });
        }
      }
      break;
    }
    case "datacenter": {
      rig.motion = "roll";
      body.add(part(box(3.0, 2.0, 3.0), shell, 0, 1.0, 0), part(box(3.1, 0.15, 3.1), dark, 0, 2.05, 0));
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) {
        body.add(part(cyl(0.5, 0.5, 0.2, 18), dark, x, 2.2, z));
        const blade = part(box(0.85, 0.03, 0.14), mat("#8a90a0"), x, 2.32, z);
        const blade2 = part(box(0.14, 0.03, 0.85), mat("#8a90a0"), x, 2.32, z);
        body.add(blade, blade2);
        rig.spin.push({ node: blade, axis: "y", speed: 9 }, { node: blade2, axis: "y", speed: 9 });
      }
      for (const side of [0, 1, 2, 3]) {
        const panel = new Group();
        panel.rotation.y = (side * Math.PI) / 2;
        for (let row = 0; row < 4; row += 1) {
          for (let col = 0; col < 6; col += 1) {
            const led = part(box(0.22, 0.1, 0.02), mat(def.glow, 1.3), -1.1 + col * 0.44, 0.45 + row * 0.38, 1.52);
            panel.add(led);
            rig.lights.push(led);
            rig.blink.push({ node: led, period: 0.4 + ((row + col + side) % 5) * 0.13, phase: (row * 6 + col) * 0.05 });
          }
        }
        body.add(panel);
      }
      const cord = part(cyl(0.08, 0.08, 3, 8), dark, 0, 0.12, -2.6);
      cord.rotation.x = Math.PI / 2;
      body.add(cord, part(box(0.4, 0.3, 0.2), mat("#ffd23a"), 0, 0.15, -4.1));
      break;
    }
    case "cloud": {
      rig.motion = "hover";
      body.position.y = 1.2;
      for (const [x, y, z, r] of [[0, 0.9, 0, 0.9], [-0.9, 0.6, 0.1, 0.7], [0.9, 0.6, -0.1, 0.75], [0.4, 1.4, 0.2, 0.6], [-0.4, 1.3, -0.2, 0.55], [0, 0.5, 0.6, 0.6]] as const) {
        body.add(part(ball(r), mat(def.color, 0.15, 0.9), x, y, z));
      }
      body.add(part(box(2.2, 0.1, 1.2), mat(def.glow, 0.9), 0, 0.15, 0));
      const bolt = new Group();
      bolt.add(part(box(0.18, 0.6, 0.06), mat("#ffe14a", 1.5), 0.1, -0.3, 0.5), part(box(0.18, 0.6, 0.06), mat("#ffe14a", 1.5), -0.05, -0.75, 0.5));
      bolt.children[0]!.rotation.z = 0.4;
      bolt.children[1]!.rotation.z = -0.4;
      body.add(bolt);
      rig.blink.push({ node: bolt.children[0] as Mesh, period: 0.9, phase: 0 }, { node: bolt.children[1] as Mesh, period: 0.9, phase: 0 });
      face(body, 0.9, 0.95, 0.88);
      break;
    }
  }
  root.scale.setScalar(def.scale * techVisualScale(def.scale));
  return { root, rig };
}

/** A floating progress bar for "Installing Update...", shown only while the tech stands installing. */
function updateBar(height: number): { group: Group; fill: Mesh } {
  const group = new Group();
  group.position.y = height;
  const back = new Mesh(box(1.6, 0.22, 0.05), mat("#14161c"));
  const fill = new Mesh(box(1.5, 0.14, 0.06), mat("#3ab0ff", 1.2));
  fill.position.z = 0.01;
  group.add(back, fill);
  group.visible = false;
  return { group, fill };
}

/** Roughly how tall each kind stands at scale 1, for where the update bar floats. */
const HEIGHT: Record<TechMesh, number> = {
  earbuds: 0.6, watch: 1.4, phone: 2, flock: 2.1, speaker: 1.2, vacuum: 0.5, drone: 0.6, scooter: 1.6, fridge: 2.2,
  gpu: 0.8, rig: 2.1, car: 1.6, chatbot: 2.2, router: 1.3, backup: 0.4, server: 2.5, datacenter: 2.5, cloud: 3,
};

const facing = new Quaternion();

/** One piece of tech's procedural body as an engine draw, animated by its own frame hook. */
export function techMeshDraw(ctx: GameContext | null, entity: SceneEntity): EngineDraw | null {
  const def = CREEP_CATALOG[entity.name];
  if (def === undefined) return null;
  const { root, rig } = build(def);
  const bar = updateBar(HEIGHT[def.mesh] + 0.6);
  root.add(bar.group);
  const phase = (entity.id.length * 0.37 + Number.parseInt(entity.id.replace(/\D/g, "") || "0", 10) * 0.61) % 6.28;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
    },
    frame(state: EngineFrameState) {
      const t = (ctx?.time.now() ?? performance.now() / 1000) + phase;
      const creep = session.creeps.get(entity.id);
      const moving = creep !== undefined && creep.installing <= 0 && !session.statuses.has(entity.id, "freeze");
      if (rig.motion === "hop") rig.body.position.y = moving ? Math.abs(Math.sin(t * 7)) * 0.18 : 0;
      else if (rig.motion === "hover") rig.body.position.y = (def.mesh === "cloud" ? 1.2 : def.mesh === "chatbot" ? 0.6 : 0) + Math.sin(t * 2.2) * 0.15;
      else if (rig.motion === "roll") rig.body.rotation.z = moving ? Math.sin(t * 9) * 0.03 : 0;
      for (const spinner of rig.spin) spinner.node.rotation[spinner.axis] = t * spinner.speed;
      const powerless = creep?.power !== null && creep?.power !== undefined && creep.power <= 0;
      for (const blink of rig.blink) {
        const on = ((t + blink.phase) % blink.period) / blink.period < 0.55;
        blink.node.visible = powerless && rig.lights.includes(blink.node) ? Math.sin(t * 23 + blink.phase * 9) > 0.6 : on || blink.period > 1;
      }
      if (powerless) for (const light of rig.lights) light.material = mat("#ff3a2a", 1.4);
      if (rig.parcel !== null) rig.parcel.visible = creep?.dropped !== true;
      const installing = creep?.installing ?? 0;
      bar.group.visible = installing > 0;
      if (installing > 0) {
        const done = 1 - installing / UPDATE_RULE.seconds;
        bar.fill.scale.x = Math.max(0.02, done);
        bar.fill.position.x = -0.75 * (1 - done);
        root.getWorldQuaternion(facing).invert();
        bar.group.quaternion.copy(facing.multiply(state.camera.quaternion));
      }
      state.invalidate();
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      root.clear();
    },
  };
}
