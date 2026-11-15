import { AnimationMixer, Color, type AnimationAction } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { houseAssets } from "./assets";
import { AdditiveBlending, DoubleSide, BoxGeometry, CircleGeometry, ConeGeometry, MeshBasicMaterial, CylinderGeometry, Group, LineBasicMaterial, LineSegments, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, type Object3D } from "three";
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

/** A soft dark pool on the floor under a big hunter: from a Little's eye line, the shadow is what you see coming. */
/**
 * The Exterminator from a Little's floor: rubber boots like buildings, coverall legs into the dark,
 * a spray wand hanging at knee height and the torch beam that is the thing you watch.
 */
function exterminator(): Group {
  // Built at 1.6 m and shown at 0.6: a grown-up's hips about a metre up, boots the height of a Little's house.
  const g = new Group(), body = new Group(); body.name = "body"; body.scale.setScalar(0.6); g.add(body);
  for (const s of [-1, 1]) {
    const leg = new Group(); leg.name = s < 0 ? "leg-l" : "leg-r"; leg.position.set(s * 7, 16, 0); body.add(leg);
    add(leg, new Mesh(new BoxGeometry(10, 16, 22), mat("#e0b42a", { rough: 0.6 })), "boot", [0, -8, 3]);
    add(leg, new Mesh(new BoxGeometry(10.6, 3, 23), mat("#151a14", { rough: 1 })), "sole", [0, -15, 3]);
    add(leg, new Mesh(new CylinderGeometry(5, 5.5, 84, 12), mat("#33456a", { rough: 1 })), "coverall", [0, 42, 0]);
  }
  add(body, new Mesh(new BoxGeometry(26, 20, 16), mat("#33456a", { rough: 1 })), "hips", [0, 108, 0]);
  // The canister on its hose, the wand hanging in front, its nozzle reddening while he aims.
  add(body, new Mesh(new CylinderGeometry(6, 6, 26, 14), mat("#b8bcc0", { metal: 0.5, rough: 0.4 })), "canister", [-16, 70, -4]);
  add(body, new Mesh(new CylinderGeometry(0.7, 0.7, 34, 6), mat("#222222")), "wand", [6, 46, 12], [0.5, 0, 0]);
  add(body, new Mesh(new SphereGeometry(1.8, 10, 8), mat("#ff4a2a", { glow: 0.2 })), "nozzle", [6, 32, 20]);
  // The torch: a cone of light from his hand down to the floor, and the pool where it lands.
  const torch = new Group(); torch.name = "torch"; torch.position.set(10, 70, 8); body.add(torch);
  const beam = new Mesh(new ConeGeometry(12, 88, 24, 1, true), new MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.09, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
  beam.name = "beam"; beam.position.set(0, 0, 44); beam.rotation.x = -Math.PI / 2 - 0.0; torch.add(beam);
  torch.rotation.x = 1.15;
  const pool = new Mesh(new CircleGeometry(1, 32), new MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending }));
  pool.name = "pool"; pool.rotation.x = -Math.PI / 2; pool.position.set(6, 0.08, 24); pool.scale.set(6, 9, 1); g.add(pool);
  // The spray: a hanging green-grey cloud, placed in the world where he aimed.
  const cloud = new Group(); cloud.name = "cloud"; cloud.visible = false; g.add(cloud);
  for (let i = 0; i < 7; i++) {
    const puff = new Mesh(new SphereGeometry(1, 12, 8), mat("#b9c79a", { opacity: 0.32 }));
    puff.position.set(Math.cos(i * 0.9) * 2.6, 1.6 + (i % 3) * 1.1, Math.sin(i * 0.9) * 2.6); puff.scale.setScalar(2.6 + (i % 2)); puff.castShadow = false;
    cloud.add(puff);
  }
  floorShadow(g, 22, 26);
  return g;
}
function floorShadow(g: Group, w: number, d: number): void {
  const pool = new Mesh(new CircleGeometry(1, 32), new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.45, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; pool.scale.set(w, d, 1); pool.name = "shadow";
  g.add(pool);
}
const animals = new GLTFLoader();
const animalCache = new Map<string, Promise<GLTF | null>>();
/** Quaternius' animated low-poly animals (CC0): the house's Cat and dog, with idle and walk cycles. */
const ANIMAL: Partial<Record<ThreatKind, { model: string; length: number }>> = {
  cat: { model: "quaternius-animated-animales-low-poly/Cat", length: 30 },
  dog: { model: "quaternius-animated-animales-low-poly/Dog", length: 54 },
};
/**
 * Swap a procedural Cat or dog body for the animated model once it loads; the procedural body stays if
 * the pack is not provisioned. The model walks while the hunter moves and idles when it stops.
 */
export function upgradeToAnimal(group: Group, kind: ThreatKind, key: string): void {
  const spec = ANIMAL[kind];
  const ref = spec === undefined ? null : houseAssets.resolve(spec.model);
  if (spec === undefined || ref === null || ref.dims === undefined) return;
  const { dims } = ref;
  let pending = animalCache.get(ref.url);
  if (pending === undefined) { pending = animals.loadAsync(ref.url).catch(() => null); animalCache.set(ref.url, pending); }
  void pending.then(gltf => {
    const body = group.getObjectByName("body");
    if (gltf === null || body === undefined || group.userData["disposed"] === true) return;
    const model = cloneSkinned(gltf.scene) as Group;
    const scale = spec.length / Math.max(dims.footprint.w, dims.footprint.d);
    model.scale.setScalar(scale);
    model.rotation.y = -Math.PI / 2;
    model.position.set(0, -(dims.minY ?? 0) * scale, 0);
    // The pack's cat is snow white; give each house Cat its own coat, keeping dark eyes and nose.
    const coat = kind === "cat" ? new Color(CAT_COATS[Math.floor(hashUnit(key) * CAT_COATS.length)]!) : null;
    model.traverse(node => {
      node.castShadow = true; node.receiveShadow = true;
      if (coat === null || !(node instanceof Mesh)) return;
      const tint = (m: MeshStandardMaterial) => { const c = m.clone(); if (c.color.r + c.color.g + c.color.b > 2.1) c.color.copy(coat); return c; };
      node.material = Array.isArray(node.material) ? node.material.map(m => tint(m as MeshStandardMaterial)) : tint(node.material as MeshStandardMaterial);
    });
    for (const child of [...body.children]) child.visible = false;
    body.add(model);
    const mixer = new AnimationMixer(model);
    const clip = (word: string) => gltf.animations.find(a => a.name.toLowerCase().includes(word));
    const idle = clip("idle"), walk = clip("walk");
    const actions = { idle: idle === undefined ? null : mixer.clipAction(idle), walk: walk === undefined ? null : mixer.clipAction(walk) };
    actions.idle?.play();
    group.userData["animal"] = { mixer, actions, walking: false };
  });
}
/** Run the animal's clips: walk while it moves, idle when it holds still. */
export function animateAnimal(group: Group, s: ThreatState, delta: number): void {
  const a = group.userData["animal"] as { mixer: AnimationMixer; actions: { idle: AnimationAction | null; walk: AnimationAction | null }; walking: boolean } | undefined;
  if (a === undefined) return;
  const walking = s.mode === "prowl" || s.mode === "stalk" || s.mode === "awake" || s.mode === "fled" || s.mode === "pounce";
  if (walking !== a.walking) {
    a.walking = walking;
    const to = walking ? a.actions.walk : a.actions.idle, from = walking ? a.actions.idle : a.actions.walk;
    if (to !== null) { to.reset().play(); if (from !== null) to.crossFadeFrom(from, 0.25, false); }
  }
  if (a.actions.walk !== null) a.actions.walk.timeScale = s.mode === "stalk" || s.mode === "pounce" ? 1.6 : 1;
  a.mixer.update(delta);
}

export function threatMesh(kind: ThreatKind, key: string): Group {
  switch (kind) {
    case "cat": { const g = cat(key); floorShadow(g, 11, 20); return g; }
    case "dog": { const g = dog(); floorShadow(g, 16, 30); return g; }
    case "roomba": return roomba();
    case "spider": return spider();
    case "trap": return trap();
    case "kid": return kid();
    case "exterminator": return exterminator();
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
    case "exterminator": {
      const walking = s.mode === "patrol";
      for (const [name, sign] of [["leg-l", 1], ["leg-r", -1]] as const) { const leg = object.getObjectByName(name); if (leg) leg.rotation.x = walking ? Math.sin(time * 4) * 0.22 * sign : 0; }
      const torch = object.getObjectByName("torch"), pool = object.getObjectByName("pool"), nozzle = object.getObjectByName("nozzle") as Mesh | undefined;
      if (torch) torch.rotation.x = s.mode === "aim" ? 1.25 : 1.15;
      if (pool) pool.position.z = s.mode === "aim" ? 20 : 24;
      if (nozzle) (nozzle.material as MeshStandardMaterial).emissiveIntensity = s.mode === "aim" ? 2.5 + Math.sin(time * 30) : 0.2;
      // The cloud hangs in the world where he aimed, so undo his own turn and step to place it.
      const cloud = object.getObjectByName("cloud");
      if (cloud) {
        cloud.visible = s.mode === "spray" && s.target !== null;
        if (s.target !== null) {
          const dx = s.target[0] - s.at[0], dz = s.target[2] - s.at[2], c = Math.cos(-s.facing), n = Math.sin(-s.facing);
          cloud.position.set(dx * c + dz * n, 0, -dx * n + dz * c);
          cloud.rotation.y = time * 0.3; cloud.scale.setScalar(1 + Math.sin(time * 2) * 0.05);
        }
      }
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
