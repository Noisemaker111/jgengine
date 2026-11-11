import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero, SectionHeading } from "../components/Layout";
import type { DemoKey } from "../live/demoParts";
import { TracedDemo } from "../live/TracedDemo";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/adopt")({
  head: () =>
    seo({
      title: "Use one jgengine system in the game you already have",
      description:
        "Bring one JGengine system — minimap, health, damage, XP — into a game you already have, without adopting its renderer, entity store, React provider, or game loop. The adapter, the tradeoffs, and the actual code.",
      path: "/adopt",
    }),
  component: Adopt,
});

type Adoption = {
  demo: DemoKey;
  domain: string;
  title: string;
  blurb: string;
  keep: string;
  get: string;
};

const ADOPTIONS: Adoption[] = [
  {
    demo: "minimap",
    domain: "Minimap",
    title: "Render a minimap from the array you already have",
    blurb:
      "Map your own units to markers and hand them to the minimap. It reads a plain array, a store you can subscribe to, or the engine's own marker set. Nothing is copied into jgengine.",
    keep: "Your entity array or store, your styling and frame.",
    get: "A minimap with marker kinds and a facing arrow, with no game provider and no three.js.",
  },
  {
    demo: "health",
    domain: "Health & resources",
    title: "Health, shields, mana, over your own state",
    blurb:
      "A current, max and min pool with a two-method adapter. Nothing is special about health: the same pool runs shields, stamina, durability or any resource in the store you already have.",
    keep: "Where the numbers live: a plain object, Zustand, Redux, an ECS component, a database row.",
    get: "Changes that come back clamped, with the amount really applied and whether it hit 0 or the max.",
  },
  {
    demo: "damage",
    domain: "Damage",
    title: "Resolve a hit and keep how it got there",
    blurb:
      "A damage resolver that gives the same answer every time: damage type against target traits, receiver modifiers and a status roll on a random source you pass in. It returns the final number and every step; you apply it to whatever holds your health.",
    keep: "Your entities, where health lives, when a hit happens.",
    get: "A result you can save, replay, or work out on the server and send to players.",
  },
  {
    demo: "xp",
    domain: "XP & leveling",
    title: "XP curves and level-ups on your save format",
    blurb:
      "XP curves, leftover XP rolling into the next level, a level cap, and one callback per level reached, written back through a two-method adapter over the player data you already save.",
    keep: "Player identity, your save format, your events, when XP is given.",
    get: "grantXp: the curve math, rollover, cap and level-up callbacks in order, with no store to adopt.",
  },
];

const PROS: { title: string; body: string }[] = [
  {
    title: "Add one system, not an architecture",
    body: "Keep your renderer, entity store, React setup, and game loop. You import a single capability, not a framework that wants to own main().",
  },
  {
    title: "Your data stays yours",
    body: "A small get/set (or one projection) adapter reads the state you already own. Nothing is mirrored into a parallel JGengine store to use a calculation or renderer.",
  },
  {
    title: "Serializable & deterministic",
    body: "State is plain data; time and randomness are injected. The same pieces drop into saves, multiplayer authority, replays, and tests without special-casing.",
  },
  {
    title: "Pay only for what you import",
    body: "Direct imports like @jgengine/core/stats/statPool pull only that file and what it uses. Model files import no React, renderer or backend.",
  },
];

const CONS: { title: string; body: string }[] = [
  {
    title: "You write the adapter and the wiring",
    body: "The get/set, the raycast and the tick(dt) call are yours, and you apply the results. It is a few lines, and it is why the parts fit engines you did not write.",
  },
  {
    title: "Presentation stays your job",
    body: "These are calculations, UI parts and mechanics, not a finished game. Rendering, input, audio and saving stay on your side.",
  },
  {
    title: "Some systems still want native integration",
    body: "The full runtime, the multiplayer host and editor-authored scenes need a jgengine game. The drop-in path stops there.",
  },
];

const MODES: { label: string; tone: string; body: string }[] = [
  {
    label: "Pure portable",
    tone: "text-accent-text border-accent/30 bg-accent/[0.06]",
    body: "Plain data in, plain data out. No runtime, renderer, store, or React. Curves, matchups, pool math.",
  },
  {
    label: "Adapter portable",
    tone: "text-accent-text border-accent/30 bg-accent/[0.06]",
    body: "Works over your state through a small structural interface. You keep ownership of entities, updates, and rendering.",
  },
  {
    label: "Native integration",
    tone: "text-fg border-line-strong bg-raised",
    body: "Needs a jgengine game (GameContext, the shell). Only for what cannot work any other way.",
  },
];

function Adopt() {
  return (
    <Page>
      <PageHero
        eyebrow="Use one system"
        title="Take one part. Keep your game."
        blurb="You can use a jgengine system without switching engines. A minimap, health pools, damage or XP work over your own entities, store and loop: one install and a few lines of adapter. Here is how each one fits, and what it costs you."
      >
        <div className="flex flex-wrap gap-3">
          <Link to="/docs" className="btn btn-primary">
            Search the capabilities →
          </Link>
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-3 py-10 sm:grid-cols-3 sm:py-12">
          {[
            { n: "1", t: "Install one package", b: "bun add @jgengine/core, plus @jgengine/react for the UI parts." },
            { n: "2", t: "Write a small adapter", b: "A get/set over your store, or one map from your entity to a marker." },
            { n: "3", t: "Call it from your loop", b: "Apply the result and call tick(dt) yourself. Your renderer stays as it is." },
          ].map((step) => (
            <div key={step.n} className="card p-5">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent/[0.08] font-mono text-sm text-accent-text">
                {step.n}
              </div>
              <h3 className="mt-3 text-base font-semibold text-fg">{step.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.b}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="space-y-16 py-4 sm:space-y-20">
          {ADOPTIONS.map((cap, i) => (
            <section key={cap.title} className="min-w-0">
              <div className="min-w-0 max-w-3xl">
                <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.2em] text-accent-text">
                  <span className="text-faint">{String(i + 1).padStart(2, "0")}</span>
                  {cap.domain}
                </p>
                <h2 className="font-display mt-4 text-balance text-2xl font-bold tracking-tight text-fg">{cap.title}</h2>
                <p className="mt-3 text-pretty leading-relaxed text-muted">{cap.blurb}</p>
                <dl className="mt-5 space-y-2.5 text-sm">
                  <div className="flex gap-3">
                    <dt className="mt-0.5 shrink-0 font-mono text-[11px] uppercase tracking-wider text-faint">You keep</dt>
                    <dd className="text-muted">{cap.keep}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="mt-0.5 shrink-0 font-mono text-[11px] uppercase tracking-wider text-accent-text">You get</dt>
                    <dd className="text-muted">{cap.get}</dd>
                  </div>
                </dl>
              </div>
              <div className="mt-6 min-w-0">
                <TracedDemo demo={cap.demo} />
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Trade-offs"
            title="What you get, and what you take on."
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-accent/20 bg-accent/[0.03] p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-text">Why it's worth it</p>
              <ul className="mt-5 space-y-5">
                {PROS.map((p) => (
                  <li key={p.title}>
                    <p className="flex gap-2.5 font-semibold text-fg">
                      <span className="text-accent-text" aria-hidden>
                        +
                      </span>
                      {p.title}
                    </p>
                    <p className="mt-1 pl-6 text-sm leading-relaxed text-muted">{p.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-dashed border-line-strong p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">What you take on</p>
              <ul className="mt-5 space-y-5">
                {CONS.map((c) => (
                  <li key={c.title}>
                    <p className="flex gap-2.5 font-semibold text-fg">
                      <span className="text-faint" aria-hidden>
                        −
                      </span>
                      {c.title}
                    </p>
                    <p className="mt-1 pl-6 text-sm leading-relaxed text-muted">{c.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="How to read a capability"
            title="Every system is one of three modes."
            blurb="Each capability says which one it is, so you know how far it reaches into your project before you add it."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {MODES.map((m) => (
              <div key={m.label} className={`rounded-lg border p-5 ${m.tone}`}>
                <p className="font-mono text-sm font-semibold">{m.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted/90">{m.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-faint">
            The four above are written up here. Search the capabilities page for more that work the same way.
          </p>
        </div>
      </section>
    </Page>
  );
}
