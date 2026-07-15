import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CodeBlock, FeatureCard } from "../components/marketing";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/editor")({
  head: () =>
    seo({
      title: "The JGengine editor — a 3D scene editor in the box",
      description:
        "Place spawns, sculpt terrain, scatter foliage, and lay paths in a Blender/Unity-style 3D editor — embedded in every game or standalone on any folder via npx jgengine editor.",
      path: "/editor",
    }),
  component: Editor,
});

const AUTHORED_SCENE = `import { AuthoredScene } from "@jgengine/shell/scene";

// Everything you placed in the editor — paths draped on terrain,
// foliage instanced, gameplay spots — renders from one document.
<AuthoredScene document={sceneDoc} field={ctx.world.ground} />;`;

const STANDALONE_MOUNT = `import { StandaloneEditor } from "@jgengine/editor";

// The same editor games ship, mounted over a blank world —
// open a scene file, drop in a folder of .glb/.gltf models.
<StandaloneEditor sceneId="my-scene" />;`;

const RPC = `# headless: drive the live editor from an agent, no clicks
bun run drive the-robots --mode editor \\
  --rpc '{"method":"set_transform","id":"boss","x":-90,"z":-650}' \\
  --rpc '{"method":"export_document"}'`;

const FEATURES = [
  ["🧭", "Gizmos & selection", "Click to select — markers, volumes, paths, notes. Move / rotate / scale with snapping, multi-select drags, an outliner, and a full inspector."],
  ["⛰️", "Terrain sculpt & paint", "Raise, lower, smooth, flatten, ramp, and noise brushes on a live heightfield — then paint material layers with weighted blends. Every stroke is one undo step."],
  ["🌲", "Foliage & scatter", "Lasso a region and get deterministic, GPU-instanced foliage with density, species palettes, slope/height masks, and clearance zones that keep gameplay clear."],
  ["🧱", "Prefabs & collections", "Extract a selection into a reusable prefab, stamp fresh instances anywhere, and bookmark named selection sets with lock/color/visibility groups."],
  ["🎬", "Edit · walk · play", "Freeze the sim and inspect, roam in the game's own camera, or drop into the real game — the F2+E chord, session preserved across every mode switch."],
  ["🤖", "Headless agent RPC", "Every verb the UI has is scriptable. Agents author scenes, assert content, and screenshot — no user-launched server, no WebGL required for document edits."],
];

function Editor() {
  return (
    <Page>
      <PageHero
        eyebrow="The editor"
        title="A 3D scene editor, in the box."
        blurb="Place spawns, sculpt terrain, scatter foliage, and lay paths in a Blender/Unity-style viewport — then render it generically at runtime. It ships inside every JGengine game, and now runs fully standalone on any folder you point it at."
      >
        <div className="max-w-xl">
          <CommandBlock command="npx jgengine editor" />
        </div>
      </PageHero>

      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([glyph, title, body]) => (
              <FeatureCard key={title} glyph={glyph} title={title}>
                {body}
              </FeatureCard>
            ))}
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Standalone"
            title="Now outside the repo — for your own projects"
            blurb="You don't have to be building a JGengine game to use the editor. Run it on any folder: it opens that folder's editor.scene.json, treats every .glb/.gltf under it as a placeable asset, and Ctrl+S writes the scene back. There's a desktop build too."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <p className="px-1 font-mono text-xs uppercase tracking-[0.16em] text-slate-500">CLI · any folder</p>
              <CodeBlock
                filename="terminal"
                code={"# opens the 3D editor in your browser on ./\nnpx jgengine editor\n\n# or point it somewhere, with a models folder\nnpx jgengine editor ./world --assets ./models"}
              />
            </div>
            <div className="flex flex-col gap-3">
              <p className="px-1 font-mono text-xs uppercase tracking-[0.16em] text-slate-500">Embed · your own app</p>
              <CodeBlock filename="Editor.tsx" code={STANDALONE_MOUNT} />
            </div>
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Author once, render generically"
            title="The scene is data — not code you hand-write"
            blurb="Coordinates live in one document, editable in 3D like a scene in Unreal. The render and the gameplay both read it, so there are no waypoint arrays pasted into game code and no per-segment path meshes to maintain."
          />
          <div className="mt-10 grid items-start gap-6 lg:grid-cols-2 lg:gap-10">
            <div className="space-y-4">
              <ol className="space-y-3">
                {[
                  ["Author", "Place and shape everything in the editor viewport."],
                  ["Save", "Ctrl+S writes editor.scene.json — plain, importable JSON."],
                  ["Render", "<AuthoredScene> drapes paths, instances foliage, and drives collision."],
                  ["Reuse", "Gameplay reads the same document — one source of truth."],
                ].map(([step, body], i) => (
                  <li key={step} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-400/35 bg-ink font-mono text-xs font-semibold text-emerald-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-100">{step}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-400">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-4">
              <CodeBlock filename="Scene.tsx" code={AUTHORED_SCENE} />
              <CodeBlock filename="terminal" code={RPC} />
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="orb orb-cyan -bottom-32 right-[22%] h-[24rem] w-[24rem]" />
          <div className="bg-noise absolute inset-0" />
        </div>
        <div className="hairline mx-auto max-w-4xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
            Open the editor on anything.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-slate-400">
            No install, no game required. One command and you're placing objects in 3D.
          </p>
          <div className="mx-auto mt-8 max-w-md">
            <CommandBlock command="npx jgengine editor" />
          </div>
          <p className="mt-6 text-sm text-slate-500">
            See what you'd build it into on the{" "}
            <Link to="/capabilities" className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-200">
              capabilities
            </Link>{" "}
            page.
          </p>
        </div>
      </section>
    </Page>
  );
}
