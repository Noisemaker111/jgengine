import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { CommandBlock } from "../components/Copy";
import { Page, PageHero, SectionHeading } from "../components/Layout";
import { LiveSpecimen } from "../components/LiveSpecimen";
import type { DemoKey } from "../live/demoParts";
import { ENGINE_DEMOS, engineDemoCode } from "../live/engineDemos";
import { liveCode, type DialSet, type LiveCodeSpec } from "../live/liveCode";
import { createTrace, type TraceLines } from "../live/trace";
import { ProsCons, VersusBlock } from "../components/marketing";
import { GAME_IDS } from "../lib/games";
import { seo } from "../lib/seo";
import { ENTRY_PROMPT } from "../lib/site";

export const Route = createFileRoute("/why")({
  head: () =>
    seo({
      title: "Why jgengine — game code by hand vs. on the engine",
      description:
        "Key bindings, projectiles, a drivable car, terrain with grass, and saves, each written by hand and on jgengine, with a demo you can tune live, plus where the engine falls short.",
      path: "/why",
    }),
  component: Why,
});

const KEYS_BY_HAND = `const FIRE_EVERY_MS = 120;
const held = new Set();
let paused = false, fireTimer = null;

addEventListener("keydown", (e) => {
  // don't react while the player types in a text box
  if (e.target instanceof HTMLInputElement) return;
  if (e.repeat) return; // the OS repeats held keys
  held.add(e.code);
  switch (e.code) {
    case "KeyE":
      if (!paused) openDoor();
      break;
    case "KeyI":
    case "Tab":
      e.preventDefault(); // or Tab leaves the canvas
      if (!paused) toggleInventory();
      break;
    case "Escape":
    case "KeyP":
      paused = !paused;
      showPauseMenu(paused);
      held.clear(); // or W stays down behind the menu
      break;
    case "KeyF":
      startFiring();
      break;
  }
});
addEventListener("keyup", (e) => {
  held.delete(e.code);
  if (e.code === "KeyF") stopFiring();
});
addEventListener("blur", () => held.clear()); // alt-tab: stuck keys

// the mouse is a second system
addEventListener("mousedown", (e) => { if (e.button === 0) startFiring(); });
addEventListener("mouseup", (e) => { if (e.button === 0) stopFiring(); });
function startFiring() {
  if (paused || fireTimer) return;
  shoot(camera.rotation);
  fireTimer = setInterval(() => shoot(camera.rotation), FIRE_EVERY_MS);
}
function stopFiring() { clearInterval(fireTimer); fireTimer = null; }

// walking, sprinting and jumping read raw codes every frame
function update(dt) {
  if (paused) return;
  const sprint = held.has("ShiftLeft") || held.has("ShiftRight");
  const speed = sprint ? 9 : 5;
  if (held.has("KeyW")) player.position.z -= speed * dt;
  if (held.has("KeyS")) player.position.z += speed * dt;
  if (held.has("KeyA")) player.position.x -= speed * dt;
  if (held.has("KeyD")) player.position.x += speed * dt;
  if (held.has("Space") && player.grounded) jump();
}`;

const PROJECTILES_BY_HAND = `const RPM = 600, PELLETS = 1, SPEED = 70, GRAVITY = 2, LIFETIME = 4;
const CAPACITY = 30, RELOAD_MS = 1200;
const SPREAD = { base: 0.01, perShot: 0.004, max: 0.06, recover: 0.1 };

let cooldown = 0, loaded = CAPACITY, reloadLeft = 0, bloom = SPREAD.base;
const pellets = [];

function update(dt) {
  // reload, then cadence
  if (reloadLeft > 0 && (reloadLeft -= dt * 1000) <= 0) loaded = CAPACITY;
  cooldown -= dt;
  bloom = Math.max(SPREAD.base, bloom - SPREAD.recover * dt);
  if (shooter.triggerHeld && cooldown <= 0 && reloadLeft <= 0) {
    if (loaded === 0) reloadLeft = RELOAD_MS;
    else fire();
  }
  // fly every pellet, then check what it crossed
  for (let i = pellets.length - 1; i >= 0; i--) {
    const p = pellets[i];
    const from = [...p.pos];
    p.vel[1] -= GRAVITY * dt;
    for (let k = 0; k < 3; k++) p.pos[k] += p.vel[k] * dt;
    p.age += dt;
    const hit = firstHit(from, p.pos); // your own collision query
    if (hit) applyHit(hit, p);
    if (hit || p.age > LIFETIME) pellets.splice(i, 1);
  }
}

function fire() {
  cooldown = 60 / RPM;
  loaded -= 1;
  for (let n = 0; n < PELLETS; n++) {
    // random direction inside a cone around the aim
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * bloom;
    const yaw = shooter.yaw + Math.cos(a) * r, pitch = shooter.pitch + Math.sin(a) * r;
    const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    pellets.push({ pos: muzzle(), vel: dir.map((d) => d * SPEED), age: 0 });
  }
  bloom = Math.min(SPREAD.max, bloom + SPREAD.perShot);
}

// damage: zone multiplier, then armor
function applyHit(hit, p) {
  spawnSparks(hit.target);
  if (!hit.target) return;
  const zone = hit.zone === "head" ? 1.5 : 1;
  const armor = targets.get(hit.target).armor;
  const mitigation = Math.min(0.9, armor / (armor + 100));
  targets.get(hit.target).hp -= 20 * zone * (1 - mitigation);
}`;

const MEADOW_BY_HAND = `import * as THREE from "three";

// --- renderer, camera, resize ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(0, 40, 90);
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- sky and haze ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec7ff);
scene.fog = new THREE.Fog(0xbfd8f0, 120, 900);

// --- noise: three.js ships none ---
function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise2D(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function heightAt(x, z) {
  let h = 0, amp = 8, freq = 0.01;
  for (let o = 0; o < 4; o++) {
    h += noise2D(x * freq, z * freq) * amp;
    amp *= 0.5; freq *= 2;
  }
  return h;
}

// --- terrain: displace, colour by height, normals ---
const SIZE = 256, SEG = 200;
const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
geo.rotateX(-Math.PI / 2);
const pos = geo.attributes.position, colors = [];
const low = new THREE.Color(0x3f7d2d), high = new THREE.Color(0x4f8a35);
for (let i = 0; i < pos.count; i++) {
  const h = heightAt(pos.getX(i), pos.getZ(i));
  pos.setY(i, h);
  const c = low.clone().lerp(high, Math.min(1, Math.max(0, h / 8)));
  colors.push(c.r, c.g, c.b);
}
geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
geo.computeVertexNormals();
const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

// --- sun and its shadow box ---
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x2a3d1a, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -SIZE / 2;
sun.shadow.camera.right = sun.shadow.camera.top = SIZE / 2;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// --- grass material: patch the shader so blades sway ---
const wind = { value: 0 };
const grassMat = new THREE.MeshStandardMaterial({ color: 0x6bbf4a, side: THREE.DoubleSide });
grassMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = wind;
  shader.vertexShader = "uniform float uTime;\\n" + shader.vertexShader.replace(
    "#include <begin_vertex>",
    \`#include <begin_vertex>
     vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
     float sway = sin(uTime * 2.0 + root.x * 0.3 + root.z * 0.2) * 0.15;
     transformed.x += sway * position.y;\`,
  );
};

// --- grass: 80,000 blades, each set on the hills ---
const COUNT = 200 * 200 * 2;
const blade = new THREE.PlaneGeometry(0.06, 0.6).translate(0, 0.3, 0);
const grass = new THREE.InstancedMesh(blade, grassMat, COUNT);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
let seed = 1337;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = 0; i < COUNT; i++) {
  const x = (rand() - 0.5) * 200, z = (rand() - 0.5) * 200;
  q.setFromAxisAngle(up, rand() * Math.PI * 2);
  const s = 0.7 + rand() * 0.6;
  m.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(s, s, s));
  grass.setMatrixAt(i, m);
}
grass.castShadow = true;
scene.add(grass);

// --- loop: wind, keep the camera above the hills, draw ---
const clock = new THREE.Clock();
function frame() {
  wind.value = clock.getElapsedTime();
  camera.position.y = heightAt(camera.position.x, camera.position.z) + 6;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();`;

const SAVES_BY_HAND = `const SAVE_KEY = "tide-runner-save";
const VERSION = 2;

// 1. Gather every piece of the world you want back...
function snapshot() {
  return {
    version: VERSION,
    player: { ...player.position, health: player.health },
    items: inventory.items.map((i) => ({ id: i.id, count: i.count })),
    quests: [...quests.values()].map((q) => ({ id: q.id, step: q.step })),
    enemies: enemies.filter((e) => e.alive)
      .map((e) => ({ id: e.id, x: e.position.x, z: e.position.z, hp: e.hp })),
    clock: worldClock.seconds,
  };
}
// 2. ...and put each piece back, in the right order.
function restore(save) {
  player.position.set(save.player.x, save.player.y, save.player.z);
  player.health = save.player.health;
  inventory.clear();
  for (const item of save.items) inventory.add(item.id, item.count);
  for (const q of save.quests) quests.get(q.id).step = q.step;
  for (const e of enemies) e.remove();
  for (const e of save.enemies) spawnEnemy(e.id, e.x, e.z).hp = e.hp;
  worldClock.seconds = save.clock;
}

function write() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); }
  catch { /* private window or full storage */ }
}
function read() {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    return save?.version === VERSION ? save : null;
  } catch { return null; }
}

// 3. Autosave at most every 5 s after a change, and a
//    checkpoint every 60 s, only while playing.
const AUTOSAVE_MS = 5000;
let mode = "title", dirty = false, lastWrite = 0, sinceCheckpoint = 0;
function markDirty() { dirty = true; } // call it everywhere state changes
function tick(dt, now) {
  if (mode !== "playing") return;
  if (dirty && now - lastWrite > AUTOSAVE_MS) { write(); dirty = false; lastWrite = now; }
  sinceCheckpoint += dt;
  if (sinceCheckpoint > 60) { write(); sinceCheckpoint = 0; }
}

// 4. Title screen with Continue, and pause on Escape.
showTitle({ canContinue: read() !== null });
onNewGame(() => { mode = "playing"; });
onContinue(() => { restore(read()); mode = "playing"; });
addEventListener("keydown", (e) => {
  if (e.code !== "Escape" || mode === "title") return;
  mode = mode === "paused" ? "playing" : "paused";
  showPauseMenu(mode === "paused");
});
addEventListener("beforeunload", write);

// Add a system later? Add it to snapshot() and restore(),
// and call markDirty() wherever it changes.`;

const CAR_BY_HAND = `import * as THREE from "three";
// Assumes carMesh, camera and heightAt(x, z) already exist.

const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const down = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);

const TOP = 34, ACCEL = 10, BRAKE = 16, TURN = 2.4;
const GRIP = 8, HANDBRAKE_GRIP = 1.5; // guessed, then tuned by feel
const car = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, yawRate: 0, roll: 0, pitch: 0 };

function drive(dt) {
  const throttle = down("KeyW", "ArrowUp"), brake = down("KeyS", "ArrowDown");
  const steer = down("KeyD", "ArrowRight") - down("KeyA", "ArrowLeft");
  const handbrake = keys.has("Space");

  // split the velocity into forward and sideways, in the car's frame
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let forward = car.vx * fx + car.vz * fz;
  let side = car.vx * fz - car.vz * fx;

  // engine, brakes, reverse, rolling drag
  if (throttle) forward += ACCEL * dt * (1 - Math.abs(forward) / TOP);
  if (brake) forward -= (forward > 0 ? BRAKE : ACCEL * 0.5) * dt;
  forward *= 1 - 0.3 * dt;

  // tires: bleed off the sideways slide; the handbrake lets it go
  side *= Math.max(0, 1 - (handbrake ? HANDBRAKE_GRIP : GRIP) * dt);

  // steering: none when stopped, less at top speed, eased in
  const speed = Math.abs(forward);
  const steerScale = Math.min(1, speed / 6) / (1 + speed / TOP);
  const targetYaw = steer * TURN * steerScale * Math.sign(forward);
  car.yawRate += (targetYaw - car.yawRate) * Math.min(1, 8 * dt);
  car.heading -= car.yawRate * dt;

  // back to world space, then move
  const nx = Math.sin(car.heading), nz = Math.cos(car.heading);
  car.vx = forward * nx + side * nz;
  car.vz = forward * nz - side * nx;
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // body lean: roll in turns and slides, pitch on throttle and brake
  const ease = Math.min(1, 6 * dt);
  car.roll += (-side * 0.04 - car.yawRate * forward * 0.004 - car.roll) * ease;
  car.pitch += ((brake - throttle) * 0.04 - car.pitch) * ease;

  // sit on the ground
  carMesh.position.set(car.x, heightAt(car.x, car.z), car.z);
  carMesh.rotation.set(car.pitch, car.heading, car.roll, "YXZ");
}

// chase camera: behind and above, with a little lag
const behind = new THREE.Vector3(), lookAt = new THREE.Vector3();
function chase(dt) {
  behind.set(-Math.sin(car.heading) * 7, 3, -Math.cos(car.heading) * 7);
  behind.add(carMesh.position);
  camera.position.lerp(behind, 1 - Math.exp(-5 * dt));
  lookAt.copy(carMesh.position).y += 1;
  camera.lookAt(lookAt);
}

// The grip is one number, so the car either sticks or slides.
// No weight shifting between wheels, no tire model.`;

type Comparison = {
  id: string;
  title: string;
  /** What both versions do, then how each side gets there. */
  blurb: string;
  byHand: string;
  /** The demo above the code; it runs by itself, and its jgengine code comes from the shared demo specs. */
  demo: DemoKey;
  /** Which by-hand lines light up while the demo does each thing. */
  trace: TraceLines;
  /** How the sliders rewrite the by-hand code. */
  live?: LiveCodeSpec;
};

const MOVE_KEYS = { moveForward: "KeyW", moveBack: "KeyS", moveLeft: "KeyA", moveRight: "KeyD" } as const;

const COMPARISONS: Comparison[] = [
  {
    id: "controls",
    title: "Key bindings",
    blurb:
      "Both versions bind walking, sprint, jump, open door (E), inventory (I or Tab), pause (Escape or P) and hold-to-fire (mouse or F). Both clear held keys on pause and alt-tab, and ignore typing in text boxes. By hand, each key is an event listener with the game code inside it, so changing a key means changing the code. On jgengine, each action lists its keys and runs the command with the same name. Players get a controls menu for free, and the game can lock an action, like fire on left click, so it can't be remapped.",
    byHand: KEYS_BY_HAND,
    demo: "keys",
    trace: {
      ...Object.fromEntries(Object.entries(MOVE_KEYS).map(([a, code]) => [a, [`held.has("${code}")`]])),
      sprint: ["const sprint ="],
      jump: ['held.has("Space")'],
      interact: ['case "KeyE"', "openDoor()"],
      inventory: ['case "KeyI"', 'case "Tab"', "toggleInventory()"],
      pause: ['case "Escape"', "paused = !paused"],
      fire: ["function startFiring", "fireTimer = setInterval"],
    },
    live: { values: { fireRepeatMs: { prop: "FIRE_EVERY_MS" } } },
  },
  {
    id: "projectiles",
    title: "Projectiles",
    blurb:
      "Both versions fire on a cadence with a 30-round magazine and a reload, spread pellets in a cone that widens as you fire, fly each pellet under gravity until it hits something or runs out of time, and take damage off the target with hit zones and armor. By hand, every rule is a variable and a loop you keep in step. On jgengine, the weapon is one plain object and the engine flies the pellets, so a rifle, a shotgun and a rocket differ only by their numbers.",
    byHand: PROJECTILES_BY_HAND,
    demo: "projectiles",
    trace: {
      fire: ["function fire()", "pellets.push", "cooldown = 60 / RPM"],
      fly: ["p.vel[1] -= GRAVITY", "p.pos[k] +="],
      hit: ["const hit = firstHit", "function applyHit", "targets.get(hit.target).hp"],
      reload: ["reloadLeft = RELOAD_MS", "if (reloadLeft > 0"],
    },
    live: { values: { rpm: { prop: "RPM" }, pellets: { prop: "PELLETS" }, speed: { prop: "SPEED" }, gravity: { prop: "GRAVITY" } } },
  },
  {
    id: "car",
    title: "A drivable car",
    blurb:
      "Both versions drive with WASD or the arrows, slide on the handbrake, steer less at speed, lean the body in turns and under braking, follow the ground and follow the car with a camera. Both assume the car model is already in the scene. By hand, the grip is one guessed number, so the car either sticks or slides. On jgengine, the tires lose grip gradually as they slide and weight shifts between the wheels. You start from an arcade, sim or drift style and set the numbers you care about.",
    byHand: CAR_BY_HAND,
    demo: "car",
    trace: {
      throttle: ["if (throttle)", "car.pitch +="],
      brake: ["if (brake)", "car.pitch +="],
      steer: ["const targetYaw", "car.yawRate +=", "car.heading -="],
      handbrake: ["side *= Math.max"],
      slide: ["side *= Math.max", "car.roll +="],
    },
    live: { values: { topSpeed: { prop: "TOP" }, accel: { prop: "ACCEL" }, turnRate: { prop: "TURN" } } },
  },
  {
    id: "meadow",
    title: "Terrain, sky and grass",
    blurb:
      "Both versions draw 256 m of noise-generated hills coloured by height, a sun with shadows, fog, and 200 × 200 m of grass that sits on the hills and sways in the wind. By hand, you write the noise, the mesh, the shadow setup, a shader patch for the wind and the placement of 80,000 identical blades. On jgengine, you set the terrain, sky and grass. The grass has about forty look knobs, a second species, flowers and seasons, thins out with distance, and the player can walk the hills.",
    byHand: MEADOW_BY_HAND,
    demo: "grass",
    trace: { wind: ["wind.value = clock", "float sway"] },
  },
  {
    id: "saves",
    title: "Saving and loading",
    blurb:
      "Both versions keep a versioned save, autosave at most every 5 seconds, checkpoint every minute while playing, show a title screen with Continue and pause on Escape. By hand, you list every piece of the world twice, once to save it and once to load it, and update both lists as the game grows. On jgengine, the whole world is saved, including anything a new system adds, and moving saves to the cloud is one line.",
    byHand: SAVES_BY_HAND,
    demo: "saves",
    trace: {
      save: ["function write()", "localStorage.setItem", "function snapshot()"],
      load: ["function restore(save)", "onContinue(", "function read()"],
    },
    live: { values: { autosaveSeconds: { prop: "AUTOSAVE_MS", format: (v) => String(Math.round(v * 1000)) } } },
  },
];

/** Lines that do something: no blanks, no comment-only lines. */
function codeLines(code: string): number {
  return code.split("\n").filter((line) => {
    const t = line.trim();
    return t !== "" && !t.startsWith("//");
  }).length;
}

const PROS = [
  {
    title: `${GAME_IDS.length} games test every change`,
    body: "The games live in the same repo as the engine. A change that breaks one fixes it in the same pull request, and a change that makes a game load slower fails a check.",
  },
  {
    title: "Rules run anywhere",
    body: "Game rules sit in files with no React, renderer or server imports, so the same code runs in the browser, on a server and in tests.",
  },
  {
    title: "Worlds are files, not code",
    body: "Spawns, terrain, foliage, roads and zones can be placed in the 3D scene editor and saved to one editor.scene.json that the game reads.",
  },
  {
    title: "Take one part, keep your game",
    body: "A minimap, health pools, damage or XP work over your own entities and loop, without switching engines.",
  },
];

const CONS = [
  {
    title: "Browser and Windows only",
    body: "Games run in the browser and package as a Windows .exe. No consoles, no native phone apps, no Mac or Linux build yet.",
  },
  {
    title: "Young and moving fast",
    body: "The API changes as the games need it. Breaking changes get a version bump and a migration note, but expect changes between versions.",
  },
  {
    title: "Gameplay is code",
    body: "The editor places the world and lays out the HUD. Rules, systems and menus are TypeScript that you or your coding agent write. It is not a drag-and-drop game maker.",
  },
];

/** One comparison: a demo that runs by itself, then both versions of the code lighting up as it runs. */
function ComparisonSection({ comparison: c }: { comparison: Comparison }) {
  const trace = useMemo(() => createTrace(), []);
  const [dials, setDials] = useState<DialSet>({});
  const onDials = useCallback((next: DialSet) => setDials(next), []);
  const engine = ENGINE_DEMOS[c.demo];
  const engineBase = engineDemoCode(c.demo);
  const before = liveCode(c.byHand, dials, c.live);
  const after = liveCode(engineBase, dials, engine.live);
  const versusTrace = useMemo(() => ({ channel: trace, before: c.trace, after: engine.lines }), [trace, c, engine]);
  return (
    <section id={c.id} className="relative scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <SectionHeading eyebrow="By hand vs. jgengine" title={c.title} blurb={c.blurb} />
        <div className="mt-6">
          <LiveSpecimen specimen={c.demo} trace={trace} onDials={onDials} layout="side" />
        </div>
        <p className="mt-6 mb-3 text-sm text-muted">
          The highlighted lines are the ones doing what the demo is doing right now. Move a slider and the jgengine code changes with it.
        </p>
        <VersusBlock
          before={before}
          after={after}
          trace={versusTrace}
          beforeLabel="By hand"
          beforeNote={`${codeLines(c.byHand)} lines of code`}
          afterNote={`${codeLines(engineBase)} lines of code`}
        />
      </div>
    </section>
  );
}

function Why() {
  return (
    <Page>
      <PageHero
        eyebrow="Why jgengine"
        title="Game code by hand vs. on jgengine"
        blurb="Five jobs most 3D games need, each written by hand and on jgengine. Each one has a demo that plays itself; take over, or move a slider and watch the jgengine code change. In each pair both versions do the same thing, and the line counts leave out blank lines and comments."
      >
        <div className="flex flex-wrap gap-3">
          {COMPARISONS.map((c) => (
            <a key={c.id} href={`#${c.id}`} className="btn btn-secondary">
              {c.title}
            </a>
          ))}
        </div>
      </PageHero>

      {COMPARISONS.map((c) => (
        <ComparisonSection key={c.id} comparison={c} />
      ))}

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <SectionHeading
            eyebrow="Trade-offs"
            title="Strengths and limits"
            blurb={
              <>
                Every part the engine ships is listed, with its import line, in the{" "}
                <Link to="/docs" className="link">
                  docs
                </Link>
                .
              </>
            }
          />
          <div className="mt-8">
            <ProsCons pros={PROS} cons={CONS} />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-line">
        <div className="bg-grid bg-grid-fade pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <h2 className="font-display text-balance text-4xl font-extrabold leading-none text-fg sm:text-5xl">
            Try it with one prompt.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted">
            Paste this into a coding agent with your idea in the gap.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <CommandBlock command={ENTRY_PROMPT} kind="prompt" />
          </div>
        </div>
      </section>
    </Page>
  );
}
