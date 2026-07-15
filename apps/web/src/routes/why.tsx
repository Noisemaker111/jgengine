import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CodeBlock, ProsCons, VersusBlock } from "../components/marketing";
import { seo } from "../lib/seo";
import { ENTRY_PROMPT } from "../lib/site";

export const Route = createFileRoute("/why")({
  head: () =>
    seo({
      title: "Why JGengine — a TypeScript game engine SDK, honestly",
      description:
        "What JGengine is good at, what it isn't, and the difference between hand-rolling a world and authoring one on the SDK. Pure TypeScript, multiplayer from day one, editor-first.",
      path: "/why",
    }),
  component: Why,
});

const WORLD_BEFORE = `// Flat ground, a sky, some grass — by hand, in three.js
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ec7ff, 60, 900);

const geo = new THREE.PlaneGeometry(256, 256, 128, 128);
geo.rotateX(-Math.PI / 2);
const pos = geo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i);
  pos.setY(i, noise2D(x * 0.01, z * 0.01) * 8); // pick a noise lib
}
geo.computeVertexNormals();
const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3f7d2d }));
scene.add(ground);

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x2a3d1a, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(80, 120, 40);
scene.add(sun);

// …now instance thousands of grass blades, ground-snap them,
// cull them per chunk, and wire collision to the same heightfield.
// Then do it again for the next game.`;

const WORLD_AFTER = `import { environment, terrain, sky, grass } from "@jgengine/core/world/features";

export const world = environment({
  terrain: terrain({ bounds: { w: 256, d: 256 }, height: 8, material: "grass" }),
  sky: sky({ preset: "day" }),
  vegetation: grass({ area: { w: 200, d: 200 }, density: 2, seed: "meadow" }),
});

// Rendered mesh, GPU-instanced grass, fog, lighting, and the
// collision heightfield all read this one field. Reusable next game.`;

const PROS = [
  {
    title: "One language, from sim to shader",
    body: "Pure TypeScript. @jgengine/core imports nothing — no React, no renderer, no backend — and every layer above earns its dependencies through a one-directional chain.",
  },
  {
    title: "Multiplayer & persistence from day one",
    body: "An authoritative host, WebSocket / WebRTC / loopback transports over one protocol, and Postgres or Convex persistence are seams in the SDK — not a rewrite you bolt on at the end.",
  },
  {
    title: "Author scenes in a real 3D editor",
    body: "Place spawns, sculpt terrain, scatter foliage, lay paths — save editor.scene.json and render it generically. Runs embedded in a game or fully standalone on any folder.",
  },
  {
    title: "Genre-agnostic primitives",
    body: "Combat, loot, quests, economy, crafting, turns, inventory — opt in per game. Built for the next ten games, so game N+1 is data plus glue.",
  },
  {
    title: "Agent-native by design",
    body: "Focused skills let a coding agent build the whole game from a prompt — intake, the right API domains, and a browserless verification gate, no docs to paste.",
  },
];

const CONS = [
  {
    title: "AGPL-3.0 — copyleft",
    body: "The published packages are AGPL-3.0-only. Great for open source; if you need a closed-source commercial build, factor that in up front rather than late.",
  },
  {
    title: "Opinionated render shell",
    body: "The renderer is React Three Fiber + three.js. If you need a native AAA pipeline, a non-web target, or your own engine, this isn't that.",
  },
  {
    title: "Young and moving",
    body: "The API surface is still evolving. Primitives are extracted as real games need them, which means occasional churn between versions.",
  },
  {
    title: "An SDK, not a no-code studio",
    body: "You (or your agent) write TypeScript. There's a 3D editor for scenes, but gameplay is code — this is a toolkit, not a drag-and-drop game maker.",
  },
];

function Why() {
  return (
    <Page>
      <PageHero
        eyebrow="Why JGengine"
        title="The boilerplate belongs in the engine, not your game."
        blurb="Most game code is the same plumbing rebuilt per project — a world, a loop, an authoritative host, a scene you place by hand. JGengine makes that the SDK's job so your game is the part that's actually yours. Here's what that buys you, and where the line is."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            to="/capabilities"
            className="rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-300 px-5 py-2.5 text-sm font-semibold text-ink-deep shadow-[0_0_36px_-8px_rgba(52,211,153,0.7)] transition hover:shadow-[0_0_48px_-8px_rgba(52,211,153,0.9)]"
          >
            See the capabilities →
          </Link>
          <Link
            to="/editor"
            className="rounded-xl border border-white/12 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.06]"
          >
            The 3D editor
          </Link>
        </div>
      </PageHero>

      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Hand-rolled vs. authored"
            title="Same meadow. One of these you maintain forever."
            blurb="Building a world by hand means owning the noise, the instancing, the culling, and the collision — then rebuilding it for the next game. On the SDK it's a few lines of intent, and every consumer reads the same field."
          />
          <div className="mt-10">
            <VersusBlock
              before={WORLD_BEFORE}
              after={WORLD_AFTER}
              beforeNote="~30 lines, and that's before grass"
              afterNote="8 lines, reusable"
            />
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="The honest cut"
            title="Strengths, and the trade-offs we won't hide"
            blurb="A tool that claims no downsides is selling something. Here's the real shape of it."
          />
          <div className="mt-10">
            <ProsCons pros={PROS} cons={CONS} />
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Who it's for"
            title="Reach for JGengine when…"
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="panel rounded-2xl p-6">
              <p className="text-sm leading-relaxed text-slate-300">
                You want a <span className="text-emerald-300">multiplayer-capable web game</span> in TypeScript
                without hand-building a netcode stack, a scene editor, and ten gameplay systems first — and
                you're happy to drive it with an AI coding agent.
              </p>
            </div>
            <div className="panel rounded-2xl border-dashed p-6">
              <p className="text-sm leading-relaxed text-slate-400">
                Look elsewhere if you need a <span className="text-slate-200">closed-source commercial build</span>{" "}
                today, a native/console target, a no-code editor, or a battle-hardened engine with a decade of
                stability. We'd rather you know now.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="orb orb-emerald -bottom-40 left-[24%] h-[26rem] w-[26rem]" />
          <div className="bg-noise absolute inset-0" />
        </div>
        <div className="hairline mx-auto max-w-4xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
            Try it in one prompt.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-slate-400">
            Paste this into any coding agent. If it doesn't fit your project, you'll know within one build —
            not one month.
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
