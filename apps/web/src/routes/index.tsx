import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { HeroTerminal } from "../components/HeroTerminal";
import { GitHubIcon, Page, SectionHeading } from "../components/Layout";
import { HeroWorld } from "../components/HeroWorld";
import { CodeBlock } from "../components/marketing";
import { seo } from "../lib/seo";
import {
  ASSETS_PACKAGE_NAME,
  ENTRY_PROMPT,
  PACKAGES,
  PACKAGE_LAYERS,
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from "../lib/site";

export const Route = createFileRoute("/")({
  head: () => seo({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  component: Home,
});

const STEPS = [
  {
    title: "Open any coding agent",
    body: "Claude Code, Cursor, Codex, Copilot — whatever you already use. No special install for you.",
  },
  {
    title: "Say the line",
    body: "Make a game that … with jgengine. That is the whole interface. The agent uses the CLI and skills underneath.",
  },
  {
    title: "Play the result",
    body: "A complete, verified game on the SDK — not a demo slice — built from the same skills this site documents.",
  },
];

const HERO_SOURCE = `import { generateCity } from "@jgengine/core/world/cityGenerator";

// The skyline on this page — streets, lots, loops — comes from this
// one call, running in your browser tab. No video, no mockup.
const city = generateCity(
  {
    seed: "neon-harbor-042", // the HUD shows the seed on screen now
    streets: { gridness: 0.88, boulevards: 0.32, winding: 0.12 },
    lots: { footprint: { w: 13, d: 11 }, setback: 3 },
  },
  230,
  230,
);
// → identical city on every machine: deterministic by contract.`;

const packageBlurb = (name: string) => PACKAGES.find((pkg) => pkg.name === name)?.blurb ?? "";

function PackageChip({ name, highlight = false }: { name: string; highlight?: boolean }) {
  return (
    <a
      href={`https://www.npmjs.com/package/${name}`}
      className={`card-hover group flex min-w-0 flex-1 flex-col rounded-xl border p-4 ${
        highlight
          ? "border-emerald-400/30 bg-emerald-400/[0.06] hover:border-emerald-400/55"
          : "panel hover:border-cyan-400/35"
      }`}
    >
      <p className={`truncate font-mono text-[13px] font-semibold ${highlight ? "text-emerald-300" : "text-cyan-300"}`}>
        {name}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{packageBlurb(name)}</p>
    </a>
  );
}

function Home() {
  return (
    <Page>
      <HeroWorld />

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <SectionHeading
            eyebrow="View source, honestly"
            title="That skyline is a function call."
            blurb="The hero above isn't a render farm loop — it's the published npm package generating a city in your tab. Same code, same seed, same city in the editor, in a game, on a server. Everything on this site that moves is the engine moving."
          />
          <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
            <CodeBlock code={HERO_SOURCE} filename="what-you-just-watched.ts" />
            <div className="grid gap-3">
              <Link
                to="/playground"
                className="card-hover panel shine group flex flex-col rounded-2xl p-5 hover:border-emerald-400/35"
              >
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400/90">
                  Playground
                </span>
                <span className="mt-2.5 font-semibold tracking-tight text-slate-100">
                  Drive every dial yourself
                </span>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  The same generator with sliders: gridness, winding, boulevards, lots — regrown
                  live in 3D on every drag, plus the exact RPC to bake your layout into a game.
                </p>
              </Link>
              <Link
                to="/capabilities"
                className="card-hover panel shine group flex flex-col rounded-2xl p-5 hover:border-emerald-400/35"
              >
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400/90">
                  Capabilities
                </span>
                <span className="mt-2.5 font-semibold tracking-tight text-slate-100">
                  Every system, running
                </span>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  Wind fields swaying grass, cables you can drag, terrain you can reshape — live
                  specimens next to the few lines that import them.
                </p>
              </Link>
              <Link
                to="/games"
                className="card-hover panel shine group flex flex-col rounded-2xl p-5 hover:border-emerald-400/35"
              >
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400/90">
                  Games
                </span>
                <span className="mt-2.5 font-semibold tracking-tight text-slate-100">
                  Play what agents built
                </span>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  Whole games built on the SDK, playable right here — the proof that the one
                  sentence works end to end.
                </p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <SectionHeading eyebrow="How it works" title="From prompt to playable in three moves" />
          <div className="mt-12 grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <div className="grid gap-4">
              {STEPS.map((step, i) => (
                <div key={step.title} className="card-hover panel panel-top-glow relative rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-emerald-400/35 bg-ink font-mono text-sm font-semibold text-emerald-300 shadow-[0_0_20px_-6px_rgba(52,211,153,0.6)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="font-semibold tracking-tight text-slate-100">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{step.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <HeroTerminal />
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <SectionHeading
            eyebrow="The SDK"
            title="Eight packages, one-directional layering"
            blurb="core imports nothing. Every layer above it earns its dependencies. Your game imports what it needs and nothing more."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-3">
              {PACKAGE_LAYERS.map((layer, i) => (
                <div key={layer.label}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="flex shrink-0 flex-col justify-center sm:w-44">
                      <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
                        {layer.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{layer.note}</p>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                      {layer.packages.map((name) => (
                        <PackageChip key={name} name={name} highlight={name === "@jgengine/core"} />
                      ))}
                    </div>
                  </div>
                  {i < PACKAGE_LAYERS.length - 1 && (
                    <div className="my-1 flex justify-center sm:ml-44">
                      <span className="font-mono text-xs text-slate-700" aria-hidden>
                        ↓ imports
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <aside className="flex flex-col gap-3">
              <div className="panel rounded-2xl border-dashed p-5">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
                  Outside the chain
                </p>
                <div className="mt-3">
                  <PackageChip name={ASSETS_PACKAGE_NAME} />
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-emerald-400/80">
                  The rule
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
                  Layering is one-directional. A lower layer never imports a higher one, and core
                  never touches React, three.js, or the browser — which is why it can generate the
                  city on this page and the same city on a game server.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="orb orb-emerald -bottom-40 left-[20%] h-[26rem] w-[26rem]" />
          <div className="orb orb-cyan -bottom-32 right-[18%] h-80 w-80" />
          <div className="bg-noise absolute inset-0" />
        </div>
        <div className="hairline mx-auto max-w-4xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Your next game is <span className="text-gradient">one prompt</span> away.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-slate-400">
            Paste this into your agent. That is how people build with JGengine outside the monorepo.
          </p>
          <div className="mx-auto mt-9 max-w-xl">
            <CommandBlock command={ENTRY_PROMPT} kind="prompt" />
          </div>
          <a
            href={REPO_URL}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-400 transition hover:border-white/25 hover:text-slate-200"
          >
            <GitHubIcon />
            Star on GitHub
          </a>
        </div>
      </section>
    </Page>
  );
}
