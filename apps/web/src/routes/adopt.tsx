import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CodeBlock } from "../components/marketing";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/adopt")({
  head: () =>
    seo({
      title: "Drop JGengine into your existing game",
      description:
        "Bring one JGengine system — minimap, health, damage, XP — into a game you already have, without adopting its renderer, entity store, React provider, or game loop. The adapter, the tradeoffs, and the actual code.",
      path: "/adopt",
    }),
  component: Adopt,
});

type Adoption = {
  glyph: string;
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
    glyph: "🗺️",
    domain: "Minimap",
    title: "Render a minimap from the array you already have",
    blurb:
      "Project your own units into display markers and hand them to the minimap. It reads a static array, a subscribable store, or a native MarkerSet — no copying entities into JGengine.",
    keep: "Your entity array/ECS/store, your styling and chrome.",
    get: "A framed minimap with categorized markers and a facing arrow — no GameProvider, no three.js.",
    filename: "Minimap.tsx",
    code: `import { Minimap } from "@jgengine/react/map";

// units are YOUR objects — nothing is mirrored into a JGengine store.
const markers = units.map((u) => ({ id: u.id, position: [u.x, 0, u.z], kind: u.team }));

<Minimap markers={markers} center={[cam.x, cam.z]} worldRadius={120} />;`,
  },
  {
    glyph: "❤️",
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
    glyph: "⚔️",
    domain: "Damage",
    title: "Resolve a hit, keep the provenance",
    blurb:
      "A pure, deterministic damage resolver: channel-vs-trait matchup, receiver modifiers, and a status roll against an injected RNG. It returns the final impact and every stage — you apply it to whatever holds your entities' health.",
    keep: "Your entities, your health sink, when a hit happens.",
    get: "A serializable, replay-safe resolution you can run on the authority and mirror to clients.",
    filename: "damage.ts",
    code: `import { resolveDamageHit } from "@jgengine/core/combat/damageResolution";

const result = resolveDamageHit({
  channel: "kinetic",
  impact: 24,
  target: enemy.id,
  targetTraits: enemy.armored ? ["armored"] : [],
  matchup: { entries: { kinetic: { armored: { impact: 0.5 } } } },
});
applyToMyHealthStore(enemy.id, -result.impact); // 12 vs the armored enemy`,
  },
  {
    glyph: "✨",
    domain: "XP & leveling",
    title: "XP curves and level-ups on your save format",
    blurb:
      "Deterministic XP curves, surplus rollover, level caps, and one event per reached level — written back through a two-method adapter over the player state you already persist.",
    keep: "Player identity, your save schema, your event bus, when XP is granted.",
    get: "grantXp: curve math, rollover, caps, and ordered level-up callbacks with no store to adopt.",
    filename: "xp.ts",
    code: `import { leveling } from "@jgengine/core/game/progression";

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
    title: "Tree-shakable, zero-dep core",
    body: "Direct imports like @jgengine/core/stats/statPool pull only what you touch. The core package has no dependencies of its own.",
  },
];

const CONS: { title: string; body: string }[] = [
  {
    title: "You write the adapter and the wiring",
    body: "The get/set, the projection, the raycast, and the tick/update call site are yours. It's a few lines, but the SDK deliberately doesn't reach into your world for you.",
  },
  {
    title: "Presentation stays your job",
    body: "These are calculations, renderers, and mechanics — not a turnkey game. Rendering, input, audio, and persistence remain on your side of the seam.",
  },
  {
    title: "Some systems still want native integration",
    body: "The full runtime, the authoritative multiplayer host, and editor-authored scenes assume a JGengine host. A portable kernel exists underneath where practical, but the drop-in path stops there.",
  },
  {
    title: "Explicit beats magic",
    body: "You call tick(dt) and apply results yourself. That's more wiring than a black box — and the reason it fits engines you didn't write.",
  },
];

const MODES: { label: string; tone: string; body: string }[] = [
  {
    label: "Pure portable",
    tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/[0.06]",
    body: "Plain data in, plain data out. No runtime, renderer, store, or React. Curves, matchups, pool math.",
  },
  {
    label: "Adapter portable",
    tone: "text-cyan-300 border-cyan-400/30 bg-cyan-400/[0.06]",
    body: "Works over your state through a small structural interface. You keep ownership of entities, updates, and rendering.",
  },
  {
    label: "Native integration",
    tone: "text-violet-300 border-violet-400/30 bg-violet-400/[0.06]",
    body: "Uses a JGengine host (GameContext, the shell). Reserved for what genuinely needs it, with a portable kernel underneath.",
  },
];

function Adopt() {
  return (
    <Page>
      <PageHero
        eyebrow="Drop-in adoption"
        title="Bring one JGengine system into the game you already have."
        blurb="You don't have to adopt an engine to use its parts. Pull in a minimap, health, damage, or XP — over your own entities, store, and loop — with a single install and a tiny adapter. Here's how each one drops in, and the honest tradeoffs."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            to="/capabilities"
            className="rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-300 px-5 py-2.5 text-sm font-semibold text-ink-deep shadow-[0_0_36px_-8px_rgba(52,211,153,0.7)] transition hover:shadow-[0_0_48px_-8px_rgba(52,211,153,0.9)]"
          >
            All capabilities →
          </Link>
          <Link
            to="/why"
            className="rounded-xl border border-white/12 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.06]"
          >
            Why JGengine
          </Link>
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-3 py-10 sm:grid-cols-3 sm:py-12">
          {[
            { n: "1", t: "Install one package", b: "bun add @jgengine/core (and @jgengine/react for UI). Zero-dep core." },
            { n: "2", t: "Write a tiny adapter", b: "A get/set over your store, or one entity → marker projection." },
            { n: "3", t: "Call it from your loop", b: "Apply results and tick(dt) yourself. Your renderer never changes." },
          ].map((step) => (
            <div key={step.n} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-400/30 bg-emerald-400/[0.08] font-mono text-sm text-emerald-300">
                {step.n}
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-100">{step.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{step.b}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="space-y-16 py-4 sm:space-y-20">
          {ADOPTIONS.map((cap, i) => (
            <section key={cap.title} className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.2em] text-emerald-400/90">
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-sm">
                    {cap.glyph}
                  </span>
                  {cap.domain}
                </p>
                <h2 className="mt-4 text-balance text-2xl font-bold tracking-tight text-slate-50">{cap.title}</h2>
                <p className="mt-3 text-pretty leading-relaxed text-slate-400">{cap.blurb}</p>
                <dl className="mt-5 space-y-2.5 text-sm">
                  <div className="flex gap-3">
                    <dt className="mt-0.5 shrink-0 font-mono text-[11px] uppercase tracking-wider text-slate-500">You keep</dt>
                    <dd className="text-slate-300">{cap.keep}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="mt-0.5 shrink-0 font-mono text-[11px] uppercase tracking-wider text-emerald-400/80">You get</dt>
                    <dd className="text-slate-300">{cap.get}</dd>
                  </div>
                </dl>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <CodeBlock code={cap.code} filename={cap.filename} />
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="The tradeoffs"
            title="What you get, and what you take on."
            blurb="Drop-in adoption is a deliberate deal: a tiny surface and total ownership of your world, in exchange for wiring the SDK deliberately doesn't do for you."
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">Why it's worth it</p>
              <ul className="mt-5 space-y-5">
                {PROS.map((p) => (
                  <li key={p.title}>
                    <p className="flex gap-2.5 font-semibold text-slate-100">
                      <span className="text-emerald-400" aria-hidden>
                        +
                      </span>
                      {p.title}
                    </p>
                    <p className="mt-1 pl-6 text-sm leading-relaxed text-slate-400">{p.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.03] p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber-300/90">What you take on</p>
              <ul className="mt-5 space-y-5">
                {CONS.map((c) => (
                  <li key={c.title}>
                    <p className="flex gap-2.5 font-semibold text-slate-100">
                      <span className="text-amber-400/90" aria-hidden>
                        −
                      </span>
                      {c.title}
                    </p>
                    <p className="mt-1 pl-6 text-sm leading-relaxed text-slate-400">{c.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="How to read a capability"
            title="Every system is one of three modes."
            blurb="Before you adopt one, you know exactly how deep it reaches into your project."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {MODES.map((m) => (
              <div key={m.label} className={`rounded-2xl border p-5 ${m.tone}`}>
                <p className="font-mono text-sm font-semibold">{m.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/90">{m.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-slate-500">
            More drop-in systems land as they're built — inventory, quests, weapon plumbing, and multiplayer plumbing follow the
            same adapter shape.
          </p>
        </div>
      </section>
    </Page>
  );
}
