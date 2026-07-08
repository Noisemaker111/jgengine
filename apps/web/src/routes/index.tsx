import { Link, createFileRoute } from "@tanstack/react-router";

import { CommandBlock, CopyButton } from "../components/Copy";
import { GameCard } from "../components/GameCard";
import { GitHubIcon, Page } from "../components/Layout";
import { GAMES } from "../content/games";
import { SKILLS } from "../content/skills";
import { INSTALL_CMD, PACKAGES, REPO_URL, SKILL_GUIDE } from "../lib/site";

export const Route = createFileRoute("/")({
  component: Home,
});

const AGENT_PROMPT = `Run \`${INSTALL_CMD}\`, then build me a game with jgengine. Read jgengine-newgame for the plan and jgengine-api for the engine surface before you start.`;

const STEPS = [
  {
    title: "Install the skills",
    body: "One command drops the JGengine skills into any coding agent — Claude Code, Cursor, whatever you run.",
  },
  {
    title: "Prompt your agent",
    body: "Describe the game you want. The skills teach it the engine's verbs, the plan, the quality bar, and the assets.",
  },
  {
    title: "Play the result",
    body: "The agent builds a complete, verified game on the SDK — not a demo slice. Every game below shipped this way.",
  },
];

function SectionHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400/80">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">{title}</h2>
      {blurb && <p className="mt-3 text-slate-400">{blurb}</p>}
    </div>
  );
}

function Home() {
  return (
    <Page>
      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="glow-emerald pointer-events-none absolute inset-0" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="animate-fade-up mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-1.5 text-xs font-medium text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Pure TypeScript · Eight packages · AGPL-3.0
            </p>
            <h1
              className="animate-fade-up mt-6 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-slate-50 sm:text-6xl"
              style={{ animationDelay: "60ms" }}
            >
              A game engine your{" "}
              <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
                AI agent
              </span>{" "}
              already knows how to use.
            </h1>
            <p
              className="animate-fade-up mx-auto mt-6 max-w-2xl text-pretty text-base text-slate-400 sm:text-lg"
              style={{ animationDelay: "120ms" }}
            >
              Install the skills, prompt your agent, and it builds the whole game — engine verbs, HUD,
              assets, and verification included. No docs to paste, no boilerplate to copy.
            </p>
            <div className="animate-fade-up mx-auto mt-9 max-w-xl" style={{ animationDelay: "180ms" }}>
              <CommandBlock command={INSTALL_CMD} />
            </div>
            <div
              className="animate-fade-up mt-6 flex flex-wrap items-center justify-center gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                to="/games"
                className="rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-ink shadow-[0_0_28px_-6px_rgba(52,211,153,0.6)] transition hover:bg-emerald-300"
              >
                Play the games
              </Link>
              <Link
                to="/skills"
                className="rounded-lg border border-white/12 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                Browse the skills
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="How it works" title="From prompt to playable in three moves" />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="card-hover relative rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
              >
                <span className="font-mono text-sm font-semibold text-emerald-400/90">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-semibold tracking-tight text-slate-100">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-deep/70">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
              <span className="ml-2 font-mono text-xs text-slate-600">your-agent — prompt</span>
              <CopyButton value={AGENT_PROMPT} className="ml-auto" />
            </div>
            <div className="px-5 py-5">
              <code className="block whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-slate-300 sm:text-sm">
                <span className="select-none text-emerald-500/70">› </span>
                {AGENT_PROMPT}
              </code>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="The skills"
              title="Which skill does my agent need?"
              blurb="Each skill is the spec your agent reads before it builds. Install them all with one command — it picks the right one for the job."
            />
            <Link
              to="/skills"
              className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
            >
              All skills →
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SKILLS.map((s) => (
              <Link
                key={s.slug}
                to="/skills/$name"
                params={{ name: s.slug }}
                className="card-hover group flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-emerald-400/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-emerald-300">{s.name}</span>
                  <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-emerald-300">
                    →
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
                  {SKILL_GUIDE[s.slug] ?? s.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/[0.05]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_100%,rgba(16,185,129,0.07),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Proof, not promises"
              title="Games built by agents, playable now"
              blurb="Every one of these was built from the skills on this site — no hand-written boilerplate. They run right here in your browser."
            />
            <Link to="/games" className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200">
              All games →
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="The SDK"
            title="Eight packages, one-directional layering"
            blurb="core imports nothing. Every layer above it earns its dependencies. Your game imports what it needs and nothing more."
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PACKAGES.map((pkg) => (
              <a
                key={pkg.name}
                href={`https://www.npmjs.com/package/${pkg.name}`}
                className="card-hover group rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 hover:border-cyan-400/30"
              >
                <p className="font-mono text-[13px] font-semibold text-cyan-300">{pkg.name}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{pkg.blurb}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/[0.05]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_60%_at_50%_120%,rgba(16,185,129,0.12),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
            Your next game is one prompt away.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Point your agent at the skills and describe what you want to play.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <CommandBlock command={INSTALL_CMD} />
          </div>
          <a
            href={REPO_URL}
            className="mt-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            <GitHubIcon />
            Star on GitHub
          </a>
        </div>
      </section>
    </Page>
  );
}
