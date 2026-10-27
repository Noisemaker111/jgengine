import { Link } from "@tanstack/react-router";

import { CommandBlock } from "./Copy";
import { SectionHeading } from "./Layout";
import { FeatureCard } from "./marketing";

const EDITOR_URL = "/play/?editor=standalone";

const EDITOR_TOOLS: readonly (readonly [glyph: string, title: string, body: string])[] = [
  ["01", "Move things", "Select spawns, zones, paths and notes. Move, rotate and scale with snapping, several at once."],
  ["02", "Sculpt and paint", "Raise, lower, smooth and flatten the ground, then paint blended materials. Each stroke undoes on its own."],
  ["03", "Grass and trees", "Lasso an area to fill it with foliage, with density, slope and height limits. The same seed gives the same result."],
  ["04", "Prefabs", "Turn a selection into a prefab and stamp copies anywhere."],
  ["05", "Edit, walk, play", "Freeze the game to inspect it, walk it with the game's camera, or jump into play without losing your place."],
  ["06", "Agents can drive it", "Every button is also a command, so a coding agent can place things and take screenshots without clicking."],
];

/** The standalone scene editor, live in the page, with what it does and how to open it on a folder. */
export function EditorEmbed() {
  return (
    <section id="editor" aria-labelledby="editor-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="Scene editor"
          title={<span id="editor-heading">Build the world in 3D.</span>}
          blurb="The same editor every jgengine game opens with F2+E. Place spawns, sculpt terrain, fill areas with grass, add your own .glb models and save the scene. Nothing uploads."
        />
        <div data-theme="dark" className="mt-10 overflow-hidden rounded-lg border border-line bg-sunken">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 font-mono text-[11px] text-muted">
            <span>jgengine editor, running in your browser</span>
            <a href={EDITOR_URL} target="_blank" rel="noreferrer" className="text-accent-text underline-offset-2 hover:underline">
              fullscreen ↗
            </a>
          </div>
          <iframe
            src={EDITOR_URL}
            title="JGengine scene editor"
            loading="lazy"
            allow="fullscreen; xr-spatial-tracking"
            className="block h-[78vh] min-h-[420px] w-full border-0 bg-[#0a0908] sm:min-h-[520px]"
          />
        </div>
        <p className="mt-3 text-center text-xs text-faint">
          Open scene loads an <code className="text-muted">editor.scene.json</code>, Add assets takes your own models, and
          Ctrl+S saves the scene to your machine.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EDITOR_TOOLS.map(([glyph, title, body]) => (
            <FeatureCard key={title} glyph={glyph} title={title}>
              {body}
            </FeatureCard>
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-xl text-center">
          <p className="text-pretty text-muted">
            Open it on any folder, no game needed. It lists every .glb and .gltf inside and saves the scene back.
          </p>
          <div className="mt-5">
            <CommandBlock command="npx jgengine editor" />
          </div>
          <p className="mt-4 text-sm text-faint">
            Or open any of the{" "}
            <Link to="/games" className="link">
              games
            </Link>{" "}
            and press F2+E.
          </p>
        </div>
      </div>
    </section>
  );
}
