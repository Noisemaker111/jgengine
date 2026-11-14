import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, LineBasicMaterial, LineSegments, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, type Object3D } from "three";
import { hashUnit } from "@jgengine/core/random/rng";
import type { ThreatState } from "./threats";
import { SPIDER } from "./threats";
import type { ThreatKind } from "../world";

/**
 * The hunters as original procedural bodies at giant scale: a cat is thirty units nose to tail and
 * its eyes glow in the dark; the dog is a hill of golden fur; the spider is small enough to be
 * terrifying. `poseThreat` moves the limbs that matter for reading intent (crouch, pounce, sit up).
 */
function mat(color: string, opts: { rough?: number; metal?: number; glow?: number; opacity?: number } = {}) {
  return new MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0, ...(opts.glow ? { emissive: color, emissiveIntensity: opts.glow } : {}), ...(opts.opacity !== undefined ? { transparent: true, opacity: opts.opacity, depthWrite: false } : {}) });
}
function add(parent: Object3D, mesh: Mesh, name = "", at: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): Mesh {
  mesh.position.set(...at); mesh.rotation.set(...rot); mesh.scale.set(...scale); mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const CAT_COATS = ["#c8743a", "#8d8d92", "#9a7452", "#d9cbb4"];

function cat(key: string): Group {
  const g = new Group(), body = new Group(); body.name = "body"; g.add(body);
  const coat = CAT_COATS[Math.floor(hashUnit(key) * CAT_COATS.length)]!, belly = coat === "#c8743a" ? "#f0d6b0" : "#d8d2c8";
  add(body, new Mesh(new SphereGeometry(1, 20, 14), mat(coat, { rough: 1 })), "torso", [0, 14, 0], [0, 0, 0], [8.5, 8, 15]);
  add(body, new Mesh(new SphereGeometry(1, 16, 10), mat(belly, { rough: 1 })), "chest", [0, 12, 10], [0, 0, 0], [6, 6.5, 5]);
  const head = new Group(); head.name = "head"; head.position.set(0, 21, 15); body.add(head);
  add(head, new Mesh(new SphereGeometry(6, 18, 14), mat(coat, { rough: 1 })), "skull", [0, 0, 0], [0, 0, 0], [1, 0.9, 1]);
  add(head, new Mesh(new SphereGeometry(2.6, 12, 10), mat(belly, { rough: 1 })), "muzzle", [0, -1.8, 4.8], [0, 0, 0], [1.2, 0.8, 0.9]);
  add(head, new Mesh(new SphereGeometry(0.7, 8, 6), mat("#d88a8a")), "nose", [0, -0.9, 6.9]);
  for (const s of [-1, 1]) {
    add(head, new Mesh(new ConeGeometry(2.2, 4.5, 4), mat(coat, { rough: 1 })), "ear", [s * 3.4, 5.2, -0.5], [0, 0, -s * 0.25]);
    add(head, new Mesh(new SphereGeometry(1.15, 12, 10), mat("#d7ff5e", { glow: 1.8, rough: 0.2 })), "eye", [s * 2.4, 1, 5.1]);
    add(head, new Mesh(new BoxGeometry(0.35, 1.7, 0.3), mat("#111")), "pupil", [s * 2.4, 1, 6.15]);
    for (const w of [-1, 1]) add(head, new Mesh(new CylinderGeometry(0.05, 0.05, 6, 4), mat("#eeeeee")), "whisker", [s * 4, -1.6 + w * 0.5, 5], [0, 0, Math.PI / 2 + s * w * 0.12]);
  }
  for (const [x, z, n] of [[-4.5, 9, "leg-fl"], [4.5, 9, "leg-fr"], [-4.5, -9, "leg-bl"], [4.5, -9, "leg-br"]] as const) {
    add(body, new Mesh(new CylinderGeometry(1.8, 1.5, 12, 10), mat(coat, { rough: 1 })), n, [x, 6, z]);
    add(body, new Mesh(new SphereGeometry(2, 10, 8), mat(belly, { rough: 1 })), "paw", [x, 0.9, z + 0.6], [0, 0, 0], [1, 0.55, 1.3]);
  }
  const tail = new Group(); tail.name = "tail"; tail.position.set(0, 17, -14); body.add(tail);
  for (let i = 0; i < 6; i++) add(tail, new Mesh(new SphereGeometry(1.6 - i * 0.12, 10, 8), mat(coat, { rough: 1 })), "tail-seg", [0, i * 2.6, -i * 1.2]);
  return g;
}
function roomba(): Group {
  const g = new Group();
  add(g, new Mesh(new CylinderGeometry(7.5, 7.5, 3.6, 40), mat("#2b2d31", { rough: 0.35, metal: 0.3 })), "shell", [0, 2.1, 0]);
  add(g, new Mesh(new CylinderGeometry(6.2, 6.2, 0.4, 40), mat("#45484e", { rough: 0.2, metal: 0.4 })), "lid", [0, 4, 0]);
  add(g, new Mesh(new TorusGeometry(7.5, 0.5, 8, 40), mat("#1a1a1c")), "bumper", [0, 1.6, 0], [Math.PI / 2, 0, 0]);
  add(g, new Mesh(new CylinderGeometry(1.2, 1.2, 0.3, 20), mat("#5dd6ff", { glow: 2 })), "led", [0, 4.3, 3.5]);
  const brush = new Group(); brush.name = "brush"; brush.position.set(5.5, 0.4, 5.5); g.add(brush);
  for (let i = 0; i < 3; i++) add(brush, new Mesh(new BoxGeometry(0.2, 0.15, 3.2), mat("#9b9b9b")), "bristle", [0, 0, 0], [0, i * Math.PI / 3, 0]);
  return g;
}
function spider(): Group {
  const g = new Group(), body = new Group(); body.name = "body"; g.add(body);
  add(body, new Mesh(new SphereGeometry(0.85, 14, 10), mat("#2a1f1a", { rough: 0.6 })), "abdomen", [0, 1.1, -0.9], [0, 0, 0], [1, 0.85, 1.25]);
  add(body, new Mesh(new SphereGeometry(0.5, 12, 8), mat("#3a2a20", { rough: 0.6 })), "head", [0, 1, 0.3]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const leg = new Group(); leg.position.set(s * 0.35, 1.05, 0.4 - i * 0.35); leg.rotation.set(0, s * (0.6 - i * 0.45) + (s < 0 ? Math.PI : 0), 0); body.add(leg);
    add(leg, new Mesh(new CylinderGeometry(0.06, 0.06, 1.6, 5), mat("#1d1612")), "femur", [0, 0.45, 0.75], [Math.PI / 2 - 0.6, 0, 0]);
    add(leg, new Mesh(new CylinderGeometry(0.05, 0.03, 1.8, 5), mat("#1d1612")), "tibia", [0, 0.2, 2.0], [Math.PI / 2 + 0.7, 0, 0]);
  }
  for (const s of [-1, 1]) add(body, new Mesh(new SphereGeometry(0.1, 6, 4), mat("#ff4030", { glow: 1.5 })), "eye", [s * 0.18, 1.2, 0.75]);
  return g;
}
/** The web around a spider's spot: a sheet of silk at ankle height that drags at the Little. */
export function webMesh(): LineSegments {
  const points: number[] = [], r = SPIDER.web;
  for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; points.push(0, 0.25, 0, Math.cos(t) * r, 0.25, Math.sin(t) * r); }
  for (let ring = 1; ring <= 5; ring++) for (let a = 0; a < 12; a++) {
    const t0 = a / 12 * Math.PI * 2, t1 = (a + 1) / 12 * Math.PI * 2, rr = r * ring / 5;
    points.push(Math.cos(t0) * rr, 0.25, Math.sin(t0) * rr, Math.cos(t1) * rr, 0.25, Math.sin(t1) * rr);
  }
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color: "#f4f4ff", transparent: true, opacity: 0.55 }));
}
function trap(): Group {
  const g = new Group();
  add(g, new Mesh(new BoxGeometry(3.2, 0.5, 6.6), mat("#d9b37c", { rough: 0.7 })), "board", [0, 0.25, 0]);
  const bar = new Group(); bar.name = "bar"; bar.position.set(0, 0.55, 0); g.add(bar);
  add(bar, new Mesh(new BoxGeometry(2.8, 0.15, 0.15), mat("#b8bcc0", { rough: 0.3, metal: 0.9 })), "bar-cross", [0, 0, 2.4]);
  for (const s of [-1, 1]) add(bar, new Mesh(new BoxGeometry(0.15, 0.15, 2.4), mat("#b8bcc0", { rough: 0.3, metal: 0.9 })), "bar-side", [s * 1.4, 0, 1.2]);
  add(g, new Mesh(new TorusGeometry(0.4, 0.1, 6, 12), mat("#9aa3a8", { rough: 0.3, metal: 0.9 })), "spring", [0, 0.7, 0], [0, Math.PI / 2, 0]);
  add(g, new Mesh(new BoxGeometry(0.9, 0.2, 1.4), mat("#e0b44a")), "pedal", [0, 0.6, -1.8]);
  add(g, new Mesh(new BoxGeometry(0.7, 0.6, 0.7), mat("#f0c445", { rough: 0.5 })), "bait", [0, 1, -1.8]);
  return g;
}
function kid(): Group {
  const g = new Group(), head = new Group(); head.name = "head"; g.add(head);
  add(head, new Mesh(new SphereGeometry(11, 22, 16), mat("#f1c9a5", { rough: 0.7 })), "face");
  add(head, new Mesh(new SphereGeometry(11.6, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2.1), mat("#5a3a22", { rough: 1 })), "hair", [0, 1.2, -1]);
  for (const s of [-1, 1]) {
    add(head, new Mesh(new SphereGeometry(2.2, 14, 10), mat("#ffffff", { rough: 0.2 })), "eye-white", [s * 4, 1.5, 9.4]);
    add(head, new Mesh(new SphereGeometry(1.2, 10, 8), mat("#3a6fb0", { rough: 0.2 })), "eye-iris", [s * 4, 1.5, 11.1]);
    add(head, new Mesh(new SphereGeometry(1.8, 10, 8), mat("#f08a8a", { opacity: 0.45 })), "cheek", [s * 6.5, -3, 8.4]);
  }
  add(head, new Mesh(new TorusGeometry(2.2, 0.35, 6, 16, Math.PI), mat("#a0524a")), "smile", [0, -4.2, 10], [0, 0, Math.PI]);
  add(g, new Mesh(new BoxGeometry(26, 10, 16), mat("#6a8fd6", { rough: 1 })), "shoulders", [0, -14, -6]);
  return g;
}
function dog(): Group {
  const g = new Group(), body = new Group(); body.name = "body"; g.add(body);
  const fur = "#c49a5a", light = "#e2c38f";
  add(body, new Mesh(new SphereGeometry(1, 20, 14), mat(fur, { rough: 1 })), "torso", [0, 26, 0], [0, 0, 0], [14, 13, 26]);
  const head = new Group(); head.name = "head"; head.position.set(0, 38, 26); body.add(head);
  add(head, new Mesh(new SphereGeometry(9, 18, 14), mat(fur, { rough: 1 })), "skull");
  add(head, new Mesh(new BoxGeometry(8, 7, 10), mat(light, { rough: 1 })), "snout", [0, -3, 9]);
  add(head, new Mesh(new SphereGeometry(1.8, 10, 8), mat("#222", { rough: 0.3 })), "nose", [0, -1, 14.2]);
  for (const s of [-1, 1]) {
    add(head, new Mesh(new BoxGeometry(3, 11, 6), mat("#9a7340", { rough: 1 })), "ear", [s * 8.5, -2, -1], [0, 0, s * 0.2]);
    add(head, new Mesh(new SphereGeometry(1.3, 10, 8), mat("#2a1a0a", { rough: 0.2 })), "eye", [s * 3.8, 2.5, 7.6]);
  }
  for (const [x, z, n] of [[-7, 16, "leg"], [7, 16, "leg"], [-7, -16, "leg"], [7, -16, "leg"]] as const) add(body, new Mesh(new CylinderGeometry(3.2, 2.8, 22, 10), mat(fur, { rough: 1 })), n, [x, 11, z]);
  add(body, new Mesh(new CylinderGeometry(1.6, 0.8, 16, 8), mat(fur, { rough: 1 })), "tail", [0, 32, -28], [-0.9, 0, 0]);
  add(body, new Mesh(new TorusGeometry(9.5, 1.2, 8, 24), mat("#c0392b")), "collar", [0, 33, 20], [Math.PI / 2 - 0.4, 0, 0]);
  return g;
}

export function threatMesh(kind: ThreatKind, key: string): Group {
  switch (kind) {
    case "cat": return cat(key);
    case "roomba": return roomba();
    case "spider": return spider();
    case "trap": return trap();
    case "kid": return kid();
    case "dog": return dog();
    default: return new Group();
  }
}

/** Put a hunter's body where its state says, reading crouch, pounce, sleep and look-up from the pose. */
export function poseThreat(object: Group, s: ThreatState, time: number, ceiling: number): void {
  object.position.set(s.at[0], 0, s.at[2]);
  object.rotation.y = s.facing;
  const body = object.getObjectByName("body"), head = object.getObjectByName("head"), tail = object.getObjectByName("tail");
  switch (s.kind) {
    case "cat": {
      const crouch = s.mode === "crouch", pounce = s.mode === "pounce", groom = s.mode === "groom";
      if (body) { body.position.y = crouch ? -4.5 : pounce ? 6 + Math.sin(Math.max(0, s.timer) / 0.45 * Math.PI) * 10 : 0; body.rotation.x = pounce ? -0.25 : 0; body.position.x = crouch ? Math.sin(time * 18) * 0.5 : 0; }
      if (tail) tail.rotation.z = Math.sin(time * (crouch ? 10 : 2)) * (crouch ? 0.6 : 0.3);
      // Crouching, the head drops to the floor and the eyes lock on: at a Little's height that is the tell you see.
      if (head) { head.rotation.x = groom ? 0.6 : s.mode === "listen" ? -0.2 : crouch ? 0.15 : 0; head.position.y = crouch ? 12 : 21; head.position.z = crouch ? 19 : 15; }
      break;
    }
    case "roomba": { const brush = object.getObjectByName("brush"); if (brush) brush.rotation.y = s.mode === "sweep" ? time * 14 : 0; break; }
    case "spider": if (body) body.position.y = s.mode === "bite" ? 0.4 : Math.sin(time * 3) * 0.05; break;
    case "trap": { const bar = object.getObjectByName("bar"); if (bar) bar.rotation.x = s.mode === "sprung" ? -Math.PI * 0.95 : 0; break; }
    case "kid": {
      const looking = s.mode === "looking";
      if (ceiling > 0) { object.position.y = looking ? ceiling + 2 : ceiling + 40; object.rotation.x = 0; if (head) head.rotation.x = looking ? -0.9 : 0; }
      else { object.position.y = looking ? 60 : 50; if (head) head.rotation.x = looking ? 0.15 : -1.3; }
      break;
    }
    case "dog": {
      const asleep = s.mode === "asleep";
      if (body) { body.position.y = asleep ? -12 : Math.abs(Math.sin(time * 6)) * 1.2; }
      if (head) head.rotation.x = asleep ? 0.5 : -0.1 + Math.sin(time * 4) * 0.05;
      break;
    }
  }
}
