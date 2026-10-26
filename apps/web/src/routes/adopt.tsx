import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CodeBlock } from "../components/marketing";
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
  domain: string;
  title: string;
  blurb: string;
  keep: string;
  get: string;
  filename: string;
  code: string;
};

const ADOPTIONS: Adoption[] = [
  {
    domain: "Minimap",
    title: "Render a minimap from the array you already have",
    blurb:
      "Project your own units into display markers and hand them to the minimap. It reads a static array, a subscribable store, or a native MarkerSet — no copying entities into JGengine.",
    keep: "Your entity array/ECS/store, your styling and chrome.",
    get: "A framed minimap with categorized markers and a facing arrow — no GameProvider, no three.js.",
    filename: "Minimap.tsx",
    code: `import { Minimap } from "@jgengine/core/map/map.view";

// units are YOUR objects — nothing is mirrored into a JGengine store.
const markers = units.map((u) => ({ id: u.id, position: [u.x, 0, u.z], kind: u.team }));

<Minimap markers={markers} center={[cam.x, cam.z]} worldRadius={120} />;`,
  },
  {
    domain: "Health & resources",
    title: "Health, shields, mana — over your own state",
    blurb:
      "A serializable current/max/min pool with a two-method adapter. Nothing privileges “health”; the same primitive drives shields, stamina, durability, or any named resource in the store you already own.",
    keep: "Where the numbers live — a plain object, Zustand, Redux, an ECS component, a DB row.",
    get: "Clamped, inspectable pool changes with the exact applied amount and min/max flags.",
    filename: "health.ts",
    code: `import { applyStatPoolDelta, createStatPool } from "@jgengine/core/stats/statPool";

const pools = { hero: { health: createStatPool({ current: 80, max: 100 }) } };
const access = {
  get: (id, stat) => pools[id]?.[stat] ?? null,
  set: (id, stat, next) => { pools[id][stat] = next; },
};

const hit = applyStatPoolDelta(access, "hero", "health", -12); // hit.applied === -12`,
  },
  {
    domain: "Damage",
    title: "Resolve a hit, keep the provenance",
    blurb:
      "A pure, deterministic damage resolver: channel-vs-trait matchup, receiver modifiers, and a status roll against an injected RNG. It returns the final impact and every stage — you apply it to whatever holds your entities' health.",
    keep: "Your entities, your health sink, when a hit happens.",
    get: "A serializable, replay-safe resolution you can run on the authority and mirror to clients.",
    filename: "damage.ts",
    code: `import { resolveDamageHit } from "@jgengine/core/combat/damage/damageResolution";
import { applyStatPoolDelta } from "@jgengine/core/stats/statPool";

const result = resolveDamageHit({
  channel: "kinetic",
  impact: 24,
  target: enemy.id,
  targetTraits: enemy.armored ? ["armored"] : [],
  matchup: { entries: { kinetic: { armored: { impact: 0.5 } } } },
});
// Drain it through the same two-method adapter from health.ts above.
applyStatPoolDelta(access, enemy.id, "health", -result.impact); // -12 vs the armored enemy`,
  },
  {
    domain: "XP & leveling",
    title: "XP curves and level-ups on your save format",
    blurb:
      "Deterministic XP curves, surplus rollover, level caps, and one event per reached level — written back through a two-method adapter over the player state you already persist.",
    keep: "Player identity, your save schema, your event bus, when XP is granted.",
    get: "grantXp: curve math, rollover, caps, and ordered level-up callbacks with no store to adopt.",
    filename: "xp.ts",
    code: `import { leveling } from "@jgengine/core/progression/leveling";

const track = leveling({ xpForLevel: { kind: "power", base: 80, exponent: 1.35, round: "floor" }, maxLevel: 20 });

// access reads/writes save.players[id].xp / .level — your data, your store.
const gained = track.grantXp(access, "p1", 900, (level) => emit("level-up", { level }));`,
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
    body: "The get/set, the projection, the raycast and the tick call are yours. It is a few lines, and the engine never reaches into your world on its own.",
  },
  {
    title: "Presentation stays your job",
    body: "These are calculations, UI parts and mechanics, not a finished game. Rendering, input, audio and saving stay on your side.",
  },
  {
    title: "Some systems still want native integration",
    body: "The full runtime, the multiplayer host and editor-authored scenes need a jgengine game. The drop-in path stops there.",
  },
  {
    title: "You do the wiring",
    body: "You call tick(dt) and apply results yourself. That is more wiring than a black box, and it is why the parts fit engines you did not write.",
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
          <Link
            to="/capabilities"
            className="btn btn-primary"
          >
            Search the capabilities →
          </Link>
          <Link
            to="/why"
            className="btn btn-secondary"
          >
            Why jgengine
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
            <section key={cap.title} className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
              <div className={`min-w-0 ${i % 2 === 1 ? "lg:order-2" : ""}`}>
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
              <div className={`min-w-0 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                <CodeBlock code={cap.code} filename={cap.filename} />
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
