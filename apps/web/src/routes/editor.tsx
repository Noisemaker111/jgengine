import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CodeBlock, FeatureCard } from "../components/marketing";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/editor")({
  head: () =>
    seo({
      title: "The jgengine editor — a 3D scene editor in your browser",
      description:
        "Place spawns, sculpt terrain, scatter foliage and lay roads in a 3D scene editor that runs in your browser, ships inside every jgengine game, and opens on any folder with npx jgengine editor.",
      path: "/editor",
    }),
  component: Editor,
});

const AUTHORED_SCENE = `import { AuthoredScene } from "@jgengine/core/scene/AuthoredScene.draw";

// Everything you placed in the editor — paths draped on terrain,
// foliage instanced, gameplay spots — renders from one document.
<AuthoredScene document={sceneDoc} field={ctx.world.ground} />;`;

const STANDALONE_MOUNT = `import { StandaloneEditor } from "@jgengine/editor";

// The same editor games ship, mounted over a blank world —
// open a scene file, drop in a folder of .glb/.gltf models.
<StandaloneEditor sceneId="my-scene" />;`;

const RPC = `# headless: drive the live editor from an agent, no clicks
bun run drive scrap-signal --mode editor \\
  --rpc '{"method":"set_transform","id":"boss","x":-90,"z":-650}' \\
  --rpc '{"method":"export_document"}'`;

const FEATURES: readonly (readonly [glyph: string, title: string, body: string])[] = [
  ["01", "Gizmos & selection", "Select markers, volumes, paths and notes. Move, rotate and scale with snapping, drag several at once, and edit them in the outliner and inspector."],
  ["02", "Terrain sculpt & paint", "Raise, lower, smooth, flatten, ramp and noise brushes on a live heightfield, then paint blended material layers. Each stroke is one undo step."],
  ["03", "Foliage & scatter", "Lasso a region for GPU-instanced foliage with density, species mixes, slope and height masks, and clear zones around gameplay spots. Same seed, same result."],
  ["04", "Prefabs & collections", "Turn a selection into a prefab, stamp copies anywhere, and save named selection sets with lock, colour and visibility."],
  ["05", "Edit · walk · play", "Freeze the game to inspect it, walk it in the game's own camera, or drop straight into play. Switching modes keeps your session."],
  ["06", "Scriptable by agents", "Every action in the UI is also an RPC. Agents place things, check the scene and take screenshots without clicking."],
];

function Editor() {
  return (
    <Page>
      <PageHero
        eyebrow="Scene editor · runs in this page"
        title="Build the world in 3D, not in code."
        blurb="This is the same editor every jgengine game ships behind F2+E. Place spawns, sculpt terrain, scatter foliage, drop in your own .glb models and export the scene. Nothing uploads; it all stays on your machine."
      >
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/play/?editor=standalone"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            Open fullscreen ↗
          </a>
          <span className="text-sm text-faint">or use it right below</span>
        </div>
      </PageHero>

      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div data-theme="dark" className="overflow-hidden rounded-lg border border-line bg-sunken">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-fg/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-fg/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-fg/10" />
                </span>
                jgengine editor — runs entirely in your browser
              </div>
              <a
                href="/play/?editor=standalone"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-accent-text underline-offset-2 hover:underline"
              >
                fullscreen ↗
              </a>
            </div>
            <iframe
              src="/play/?editor=standalone"
              title="JGengine scene editor"
              loading="lazy"
              allow="fullscreen; xr-spatial-tracking"
              className="block h-[78vh] min-h-[420px] w-full border-0 bg-[#0a0908] sm:min-h-[520px]"
            />
          </div>
          <p className="mt-3 text-center text-xs text-faint">
            Tip: <span className="text-muted">📂 Open scene</span> loads an{" "}
            <code className="text-muted">editor.scene.json</code>, <span className="text-muted">🧊 Add assets</span>{" "}
            pulls in your own models, and <span className="text-muted">Export / Ctrl+S</span> saves the scene back to your machine.
          </p>
        </div>
      </section>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <SectionHeading eyebrow="What's in it" title="The tools a level needs" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([glyph, title, body]) => (
              <FeatureCard key={title} glyph={glyph} title={title}>
                {body}
              </FeatureCard>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Standalone"
            title="Use it on any folder"
            blurb="You don't need a jgengine game. Point it at a folder: it opens that folder's editor.scene.json, lists every .glb and .gltf inside as a placeable asset, and Ctrl+S writes the scene back."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <p className="px-1 font-mono text-xs uppercase tracking-[0.16em] text-faint">CLI · any folder</p>
              <CodeBlock
                filename="terminal"
                code={"# opens the 3D editor in your browser on ./\nnpx jgengine editor\n\n# or point it somewhere, with a models folder\nnpx jgengine editor ./world --assets ./models"}
              />
            </div>
            <div className="flex flex-col gap-3">
              <p className="px-1 font-mono text-xs uppercase tracking-[0.16em] text-faint">Embed · your own app</p>
              <CodeBlock filename="Editor.tsx" code={STANDALONE_MOUNT} />
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="One document"
            title="The scene is a file, not code"
            blurb="Every position lives in one JSON document you edit in 3D. The renderer and the gameplay both read it, so there are no coordinate arrays pasted into game code."
          />
          <div className="mt-10 grid items-start gap-6 lg:grid-cols-2 lg:gap-10">
            <div className="space-y-4">
              <ol className="space-y-3">
                {[
                  ["Author", "Place and shape everything in the editor viewport."],
                  ["Save", "Ctrl+S writes editor.scene.json, plain JSON."],
                  ["Render", "<AuthoredScene> drapes paths on the terrain, instances foliage and builds collision."],
                  ["Reuse", "Gameplay reads spawns, zones and triggers from the same document."],
                ].map(([step, body], i) => (
                  <li key={step} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent/35 bg-bg font-mono text-xs font-semibold text-accent-text">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="font-semibold text-fg">{step}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{body}</p>
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
        </div>
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <h2 className="font-display text-balance text-4xl font-extrabold leading-none text-fg sm:text-5xl">
            Open it on any folder.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-muted">
            No game required. One command and you are placing objects in 3D.
          </p>
          <div className="mx-auto mt-8 max-w-md">
            <CommandBlock command="npx jgengine editor" />
          </div>
          <p className="mt-6 text-sm text-faint">
            Or see it inside a real game: open any of the{" "}
            <Link to="/games" className="link">
              games
            </Link>{" "}
            and press F2+E.
          </p>
        </div>
      </section>
    </Page>
  );
}
