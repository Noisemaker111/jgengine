import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock } from "../components/Copy";
import { HeroTerminal } from "../components/HeroTerminal";
import { Backdrop, GitHubIcon, Page, SectionHeading } from "../components/Layout";
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

const STATS = [
  { value: String(PACKAGES.length), label: "published packages" },
  { value: "0", label: "core dependencies" },
  { value: "1", label: "prompt to build" },
  { value: "0", label: "lines of boilerplate" },
];

const EXPLORE = [
  {
    to: "/why" as const,
    eyebrow: "Why JGengine",
    title: "The pitch, honestly",
    body: "What it's great at, what it isn't, and a side-by-side of hand-rolling a world versus authoring one on the SDK.",
  },
  {
    to: "/capabilities" as const,
    eyebrow: "Capabilities",
    title: "Every system, with the code",
    body: "Worlds, entities, combat, multiplayer, authored scenes, HUDs, assets — each shown as the few lines you actually write.",
  },
  {
    to: "/editor" as const,
    eyebrow: "Editor",
    title: "A 3D editor in the box",
    body: "Place spawns, sculpt terrain, scatter foliage. Embedded in every game — and now standalone on any folder.",
  },
];

const HERO_SNIPPET = `import { environment, terrain, sky, grass } from "@jgengine/core/world/features";

export const world = environment({
  terrain: terrain({ bounds: { w: 256, d: 256 }, height: 8, material: "grass" }),
  sky: sky({ preset: "day" }),
  vegetation: grass({ area: { w: 200, d: 200 }, density: 2, seed: "meadow" }),
});`;

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
      <section className="relative overflow-hidden">
        <Backdrop variant="hero" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="animate-fade-up mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-1.5 text-xs font-medium text-emerald-300 shadow-[0_0_24px_-8px_rgba(52,211,153,0.5)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Pure TypeScript · Multiplayer-ready · AGPL-3.0
            </p>
            <h1
              className="animate-fade-up mt-7 text-balance text-[2.6rem] font-bold leading-[1.05] tracking-tighter text-slate-50 sm:text-7xl"
              style={{ animationDelay: "60ms" }}
            >
              A TypeScript game engine built for <span className="text-gradient">AI coding agents</span>.
            </h1>
            <p
              className="animate-fade-up mx-auto mt-6 max-w-2xl text-pretty text-base text-slate-400 sm:text-lg"
              style={{ animationDelay: "120ms" }}
            >
              One interface: tell your agent{" "}
              <span className="font-mono text-emerald-300/90">Make a game that … with jgengine</span>.
              It scaffolds, plans, and builds the whole game — no CLI for you, no docs to paste.
            </p>
            <div
              className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <Link
                to="/capabilities"
                className="group rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-300 px-6 py-3 text-sm font-semibold text-ink-deep shadow-[0_0_36px_-8px_rgba(52,211,153,0.7)] transition hover:shadow-[0_0_48px_-8px_rgba(52,211,153,0.9)]"
              >
                See the capabilities
                <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                  →
                </span>
              </Link>
              <Link
                to="/why"
                className="rounded-xl border border-white/12 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.06]"
              >
                Why JGengine?
              </Link>
            </div>
          </div>
          <div className="animate-fade-up mx-auto mt-14 max-w-3xl" style={{ animationDelay: "260ms" }}>
            <HeroTerminal />
          </div>
          <dl
            className="animate-fade-up mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.05] sm:grid-cols-4"
            style={{ animationDelay: "340ms" }}
          >
            {STATS.map((stat) => (
              <div key={stat.label} className="flex flex-col bg-ink px-4 py-5 text-center">
                <dt className="order-2 mt-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-slate-500">
                  {stat.label}
                </dt>
                <dd className="order-1 bg-gradient-to-b from-slate-50 to-slate-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <SectionHeading eyebrow="How it works" title="From prompt to playable in three moves" />
          <div className="relative mt-12 grid gap-4 sm:grid-cols-3 sm:gap-6">
            <div className="pointer-events-none absolute left-[16.6%] right-[16.6%] top-10 hidden h-px bg-gradient-to-r from-emerald-400/30 via-white/15 to-cyan-400/30 sm:block" />
            {STEPS.map((step, i) => (
              <div key={step.title} className="card-hover panel panel-top-glow relative rounded-2xl p-6 sm:pt-7">
                <span className="relative grid h-9 w-9 place-items-center rounded-full border border-emerald-400/35 bg-ink font-mono text-sm font-semibold text-emerald-300 shadow-[0_0_20px_-6px_rgba(52,211,153,0.6)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 font-semibold tracking-tight text-slate-100">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <SectionHeading
            eyebrow="Intent, not boilerplate"
            title="You write what your game is. The SDK handles the rest."
            blurb="A world with terrain, a day sky, and GPU-instanced grass — mesh, fog, lighting, and collision included — is a few lines of intent that every consumer reads from one field."
          />
          <div className="mt-10 grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
            <CodeBlock code={HERO_SNIPPET} filename="world.ts" />
            <div className="grid gap-3">
              {EXPLORE.map((card) => (
                <Link
                  key={card.to}
                  to={card.to}
                  className="card-hover panel shine group flex flex-col rounded-2xl p-5 hover:border-emerald-400/35"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400/90">
                      {card.eyebrow}
                    </span>
                    <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" aria-hidden>
                      →
                    </span>
                  </div>
                  <span className="mt-2.5 font-semibold tracking-tight text-slate-100">{card.title}</span>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{card.body}</p>
                </Link>
              ))}
            </div>
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
                  never touches React, three.js, or the browser.
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
