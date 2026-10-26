import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CodeBlock, ProsCons, VersusBlock } from "../components/marketing";
import { GAME_IDS } from "../lib/games";
import { seo } from "../lib/seo";
import { ENTRY_PROMPT } from "../lib/site";

export const Route = createFileRoute("/why")({
  head: () =>
    seo({
      title: "Why jgengine — what it does well, and what it doesn't",
      description:
        "What jgengine is good at, where it falls short, and what a world costs by hand versus on the engine. TypeScript, multiplayer built in, scenes authored in a 3D editor.",
      path: "/why",
    }),
  component: Why,
});

const WORLD_BEFORE = `// The whole thing, by hand, in three.js — nothing elided.
import * as THREE from "three";

// --- renderer + camera + resize ---
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

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ec7ff, 120, 900);

// --- value noise: three ships none, so write it ---
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
  // fbm — and this same fn must feed collision AND grass grounding
  let h = 0, amp = 8, freq = 0.01;
  for (let o = 0; o < 4; o++) { h += noise2D(x * freq, z * freq) * amp; amp *= 0.5; freq *= 2; }
  return h;
}

// --- terrain mesh: displace, recompute normals ---
const SIZE = 256, SEG = 200;
const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
geo.rotateX(-Math.PI / 2);
const pos = geo.attributes.position;
for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
geo.computeVertexNormals();
const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3f7d2d, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

// --- lighting + shadow frustum ---
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x2a3d1a, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -SIZE / 2;
sun.shadow.camera.right = sun.shadow.camera.top = SIZE / 2;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// --- grass: one InstancedMesh, grounded to the heightfield ---
const COUNT = 200 * 200 * 2; // density 2 /m² over 200×200
const blade = new THREE.PlaneGeometry(0.06, 0.6).translate(0, 0.3, 0);
const grass = new THREE.InstancedMesh(
  blade,
  new THREE.MeshStandardMaterial({ color: 0x6bbf4a, side: THREE.DoubleSide }),
  COUNT,
);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
let rng = 1337;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = 0; i < COUNT; i++) {
  const x = (rand() - 0.5) * 200, z = (rand() - 0.5) * 200;
  q.setFromAxisAngle(up, rand() * Math.PI * 2);
  const s = 0.7 + rand() * 0.6;
  m.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(s, s, s));
  grass.setMatrixAt(i, m);
}
grass.instanceMatrix.needsUpdate = true;
grass.castShadow = true;
scene.add(grass);

// --- per-chunk frustum culling so 80k blades don't tank the GPU ---
grass.computeBoundingSphere();
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();

// --- render loop: wind, collision clamp, cull, draw ---
const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime();
  grass.material.userData.wind = Math.sin(t); // and rewire the shader for it…
  camera.position.y = heightAt(camera.position.x, camera.position.z) + 6; // "collision"
  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(pv);
  grass.visible = frustum.intersectsSphere(grass.boundingSphere);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// …and you rewrite all of it for the next game.`;

const WORLD_AFTER = `import { world } from "@jgengine/core/placement/place";

// The world is the place you play in: substrate + laws.
export const overworld = world({
  id: "overworld",
  ground: { mode: "flat", size: { x: Infinity, z: Infinity } },
  physics: { gravity: -24 },
});

// The meadow itself — sky look, terrain sculpt, scattered grass — is
// authored in the 3D editor and saved to editor.scene.json. Rendering,
// GPU-instanced grass, fog, and collision all read that one document.`;

const PROS = [
  {
    title: "The hard systems are already written",
    body: "Terrain, GPU grass, force-based vehicles, procedural cities, navmesh AI, combat, waves, saves and server-authoritative multiplayer ship in the engine. A game turns them on and sets their options.",
  },
  {
    title: `${GAME_IDS.length} games keep it honest`,
    body: "Every engine change runs against the games in the same repo. A change that breaks one fixes it in the same pull request, and a load guard fails a change that makes a game open slower.",
  },
  {
    title: "Coding agents can drive it end to end",
    body: "create installs the skills, find points at the right folder, recipe prints wired snippets, and shoot and drive let the agent screenshot and play what it built.",
  },
  {
    title: "Worlds are authored, not hardcoded",
    body: "Spawns, terrain, foliage, roads and zones live in one editor.scene.json made in the 3D editor. The renderer and the gameplay read the same document.",
  },
  {
    title: "One language from rules to rendering",
    body: "TypeScript throughout. Game rules sit in model files with no React, renderer or backend imports, so they run the same in the browser, on a server and in tests.",
  },
];

const CONS = [
  {
    title: "Web only",
    body: "Games render with three.js and React Three Fiber in the browser. No consoles, no native mobile builds, and no packaged desktop build yet.",
  },
  {
    title: "Young and moving fast",
    body: "The API changes as the games need it. Breaking changes get a version bump and a migration note, but expect churn between versions.",
  },
  {
    title: "Gameplay is code",
    body: "The editor handles scenes and the HUD layout. Rules, systems and UI are TypeScript that you or your agent write.",
  },
  {
    title: "Keep the NOTICE",
    body: "Apache-2.0: commercial and closed-source use is fine. Ship the license and the NOTICE file that credits jgengine.com.",
  },
];

function Why() {
  return (
    <Page>
      <PageHero
        eyebrow="Why jgengine"
        title="Write the game, not the plumbing."
        blurb="Most game code is the same work redone every project: a world, a loop, a server, saves, a HUD that fits the screen. jgengine does that part, so your code is the part that makes your game different. Here is what you get and where it stops."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            to="/"
            hash="features"
            className="btn btn-primary"
          >
            See what it does →
          </Link>
          <Link
            to="/capabilities"
            className="btn btn-secondary"
          >
            Search the capabilities
          </Link>
        </div>
      </PageHero>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="By hand vs. on the engine"
            title="The same meadow, twice."
            blurb="By hand you own the noise, the instancing, the culling and the collision, and you write them again for the next game. On jgengine the world is a short declaration and the meadow is a scene you paint in the editor."
          />
          <div className="mt-10">
            <VersusBlock
              before={WORLD_BEFORE}
              after={WORLD_AFTER}
              beforeNote="about 90 lines, nothing left out"
              afterNote="a world declaration plus an authored scene"
            />
          </div>
        </div>
      </section>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Trade-offs"
            title="Where it is strong, and where it is not"
          />
          <div className="mt-10">
            <ProsCons pros={PROS} cons={CONS} />
          </div>
        </div>
      </section>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Who it's for"
            title="Is it a fit?"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <div className="card p-6 sm:p-7">
              <p className="eyebrow">Good fit</p>
              <p className="mt-4 leading-relaxed text-muted">
                You want a <span className="font-semibold text-fg">3D game that runs in the browser</span>, maybe
                multiplayer, and you would rather start from working terrain, vehicles, combat and saves than write them.
                You are happy to build it with a coding agent.
              </p>
            </div>
            <div className="rounded-lg border border-dashed border-line-strong p-6 sm:p-7">
              <p className="font-mono text-[0.72rem] font-medium uppercase tracking-[0.16em] text-faint">Look elsewhere</p>
              <p className="mt-4 leading-relaxed text-muted">
                You need a console or native mobile build, a drag-and-drop game maker, or an API that will not change
                for years.
              </p>
            </div>
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
            Paste this into a coding agent with your idea in the gap. One build tells you whether it fits.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <CommandBlock command={ENTRY_PROMPT} kind="prompt" />
          </div>
          <div className="mt-6">
            <CodeBlock code={"# or open the editor on any folder, no game required\nnpx jgengine editor"} filename="terminal" />
          </div>
        </div>
      </section>
    </Page>
  );
}
