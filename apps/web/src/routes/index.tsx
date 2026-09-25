import { Link, createFileRoute } from "@tanstack/react-router";

import { Blueprints } from "../components/Blueprints";
import { CommandBlock } from "../components/Copy";
import { GameCard } from "../components/GameCard";
import { HeroTerminal } from "../components/HeroTerminal";
import { HeroWorld } from "../components/HeroWorld";
import { GitHubIcon, Page, SectionHeading } from "../components/Layout";
import { CAPABILITIES, SKILL_DOMAINS } from "../lib/capabilities";
import { GAME_IDS } from "../lib/games";
import { seo } from "../lib/seo";
import { ENTRY_PROMPT, PACKAGE_LAYERS, REPO_URL, SITE_DESCRIPTION, SITE_TITLE } from "../lib/site";

export const Route = createFileRoute("/")({
  head: () => seo({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  component: Home,
});

const FEATURED = ["vice-isle", "the-robots", "claudecraft"];

const STEPS = [
  {
    title: "Say the sentence",
    body: "In any coding agent: Make a game that … with jgengine. Nothing to install first; the agent runs the CLI.",
  },
  {
    title: "The agent reads the skills",
    body: "An intake skill turns your pitch into a plan and loads only the domains the game needs: world, combat, UI, multiplayer.",
  },
  {
    title: "It builds from blocks",
    body: "Each system comes from a narrow, tested primitive. The game's own code is its content, rules and feel.",
  },
  {
    title: "It proves the game runs",
    body: "Type checks, gameplay tests, and screenshots of the running game before the agent calls it done.",
  },
];

const LIVE_LINKS = [
  {
    to: "/playground",
    label: "Playground",
    title: "Grow a city from sliders",
    body: "The generator behind the hero, with every dial exposed.",
  },
  {
    to: "/capabilities",
    label: "Capabilities",
    title: "Wind, cables, terrain",
    body: "Core functions running in canvases next to their code.",
  },
  {
    to: "/editor",
    label: "Editor",
    title: "Author the world",
    body: "Scenes, terrain and foliage live in one document the game reads.",
  },
] as const;

function Home() {
  const featured = FEATURED.filter((id) => GAME_IDS.includes(id));
  const rest = GAME_IDS.filter((id) => !featured.includes(id));

  return (
    <Page>
      <HeroWorld />

      <section aria-labelledby="games-heading" className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="Built with jgengine"
              title={<span id="games-heading">Real games. Playable in this tab.</span>}
              blurb="Coding agents built these probe games on the published packages. Some are homages to games you know. All of them run here with no install."
            />
            <Link to="/games" className="btn btn-secondary">
              All {GAME_IDS.length > 0 ? GAME_IDS.length : ""} games <span className="arrow" aria-hidden>→</span>
            </Link>
          </div>
          {featured.length > 0 && (
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {featured.map((id, i) => (
                <div key={id} className="reveal" style={{ animationDelay: `${i * 60}ms` }}>
                  <GameCard id={id} size="lg" />
                </div>
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-5 lg:grid-cols-4">
              {rest.map((id) => (
                <li key={id} className="reveal">
                  <GameCard id={id} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="blocks-heading" className="relative overflow-hidden border-t border-line bg-raised">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHeading
            eyebrow="No genre kits"
            title={<span id="blocks-heading">Big games, made of small blocks.</span>}
            blurb={
              <>
                There is no MMO template or shooter preset. The agent composes each game from narrow primitives. These
                are real rows from the skills' capability indexes: {CAPABILITIES.length} intents across{" "}
                {SKILL_DOMAINS.length} skills.
              </>
            }
          />
          <div className="mt-12">
            <Blueprints />
          </div>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionHeading
            eyebrow="How it works"
            title={<span id="how-heading">One sentence in. A tested game out.</span>}
          />
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
            <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {STEPS.map((step, i) => (
                <li key={step.title} className="reveal flex gap-4 bg-bg p-5 sm:p-6">
                  <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold tracking-tight text-fg">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="lg:sticky lg:top-24">
              <HeroTerminal />
              <p className="mt-3 px-1 text-xs text-faint">
                An illustrative session. The commands are the real CLI and project scripts.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="live-heading" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading
            eyebrow="Try the engine"
            title={<span id="live-heading">Everything that moves on this site is the engine.</span>}
            blurb="The same zero-dependency core a shipped game runs, feeding three.js in your browser."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {LIVE_LINKS.map((item) => (
              <Link key={item.to} to={item.to} className="card card-link reveal flex flex-col p-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">{item.label}</span>
                <span className="font-display mt-3 text-xl font-semibold tracking-tight text-fg">{item.title}</span>
                <span className="mt-2 text-sm leading-relaxed text-muted">{item.body}</span>
                <span className="mt-6 text-sm font-semibold text-fg">
                  Open <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="sdk-heading" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <SectionHeading
            eyebrow="The SDK"
            title={<span id="sdk-heading">Layers that only point down.</span>}
            blurb="@jgengine/core imports nothing: no React, no renderer, no backend. That is why the same generator runs in this page, in the editor and on a game server. Each layer above it adds one kind of dependency."
          />
          <ol className="reveal grid gap-2">
            {PACKAGE_LAYERS.map((layer) => (
              <li
                key={layer.label}
                className="grid gap-2 rounded-xl border border-line bg-raised p-4 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-4"
              >
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{layer.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{layer.note}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {layer.packages.map((name) => (
                    <a
                      key={name}
                      href={`https://www.npmjs.com/package/${name}`}
                      className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                        name === "@jgengine/core"
                          ? "border-accent/50 bg-accent/10 text-accent-text hover:border-accent"
                          : "border-line text-fg hover:border-line-strong"
                      }`}
                    >
                      {name}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="cta-heading" className="relative overflow-hidden border-t border-line">
        <div className="bg-dots bg-dots-fade pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 sm:py-32">
          <h2
            id="cta-heading"
            className="font-display text-balance text-4xl font-bold leading-[1] tracking-[-0.03em] text-fg sm:text-6xl"
          >
            What will you <span className="text-accent">make</span>?
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-pretty text-muted sm:text-lg">
            Paste this into your coding agent and finish the sentence.
          </p>
          <div className="mx-auto mt-9 max-w-xl">
            <CommandBlock command={ENTRY_PROMPT} kind="prompt" />
          </div>
          <a href={REPO_URL} className="btn btn-secondary mt-6">
            <GitHubIcon /> Star on GitHub
          </a>
        </div>
      </section>
    </Page>
  );
}
