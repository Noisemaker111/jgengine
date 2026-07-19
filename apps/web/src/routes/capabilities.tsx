import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero, SectionHeading } from "../components/Layout";
import { LiveSpecimen, type SpecimenKey } from "../components/LiveSpecimen";
import { CodeBlock } from "../components/marketing";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/capabilities")({
  head: () =>
    seo({
      title: "Capabilities — what JGengine gives you, with the code",
      description:
        "The primitives JGengine ships: worlds, entities, combat, multiplayer, authored scenes, HUDs, and CC0 assets — each shown as the actual few lines you write.",
      path: "/capabilities",
    }),
  component: Capabilities,
});

type Capability = {
  glyph: string;
  domain: string;
  title: string;
  blurb: string;
  filename: string;
  code: string;
};

const CAPABILITIES: Capability[] = [
  {
    glyph: "🎮",
    domain: "Runtime",
    title: "Define a whole game as data",
    blurb:
      "One call wires the runtime: assets, world, physics, input, save, and the lifecycle loop. No engine boilerplate, no scene graph to hand-assemble.",
    filename: "game.config.ts",
    code: `import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGame } from "@jgengine/shell/defineGame";
import { world, physics } from "./world";

export const game = defineGame({
  name: "Meadow Run",
  assets: createAssetCatalog(),
  world,
  physics,
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
});`,
  },
  {
    glyph: "⛰️",
    domain: "World & procedural",
    title: "A world is a place: substrate + laws",
    blurb:
      "Declare the place you play in — flat, round, voxel, or board ground with its own physics. Sky look, foliage, and props are authored in the editor's scene document, not coded onto the world.",
    filename: "world.ts",
    code: `import { world } from "@jgengine/core/world/place";

export const moon = world({
  id: "moon",
  ground: { mode: "round", size: { radius: 300 } },
  physics: { gravity: -4 },
});
// Sky + scatter live in editor.scene.json; seeds derive from id + save.`,
  },
  {
    glyph: "🧩",
    domain: "Scene & entities",
    title: "Spawn and simulate entities",
    blurb:
      "A per-world entity store you spawn into and tick. State serializes cleanly and scales to many entities and many players — no module-global maps.",
    filename: "loop.ts",
    code: `export function onNewPlayer(ctx: GameContext) {
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: SPAWN });
}

export function onTick(ctx: GameContext, dt: number) {
  for (const mob of ctx.scene.entity.list()) {
    if (mob.role !== "npc") continue;
    const [x, y, z] = mob.position;
    ctx.scene.entity.setPose(mob.id, { position: [x + mob.velocity[0] * dt, y, z], dt });
  }
}`,
  },
  {
    glyph: "⚔️",
    domain: "Combat",
    title: "Abilities, projectiles, and death",
    blurb:
      "Cast runners, resource meters, auto-target, projectiles, and a death system — feel and resistance included. Opt in per game; a puzzle game never carries it.",
    filename: "combat.ts",
    code: `import { createAbilityKit } from "@jgengine/core/combat/abilityKit";
import { createDeathSystem } from "@jgengine/core/combat/death";

const abilities = createAbilityKit([
  { id: "fireball", cooldownMs: 1500, resourceCost: 20, castType: "projectile" },
]);
// canCast/cast track cooldowns, charges, and resource spend for you
if (abilities.canCast("fireball").ok) abilities.cast("fireball");

const death = createDeathSystem({
  resolveOnDeath: (id) => ({ drops: "goblin-loot" }),
  resolveIdentity, loot, events,
  despawn: (id) => scene.entity.despawn(id),
});`,
  },
  {
    glyph: "🌐",
    domain: "Multiplayer",
    title: "Authoritative host, one protocol",
    blurb:
      "A browser-safe authoritative host and client backend over a pluggable transport pipe — WebSocket, WebRTC P2P, or loopback — with Postgres/Convex persistence behind the same seam.",
    filename: "net.ts",
    code: `import { createWsBackend } from "@jgengine/ws/createWsBackend";

const backend = createWsBackend({
  url: "wss://your-host.example/game",
  userId: player.id,
});
const { serverId } = await backend.createSession({ gameId: "meadow-run" });
// Reconnect, snapshot sync, and save cadence are handled for you.`,
  },
  {
    glyph: "🗺️",
    domain: "Authored scenes",
    title: "Place it once, render it generically",
    blurb:
      "Author paths, foliage, and gameplay spots in the 3D editor, save editor.scene.json, and drape it at runtime — the render and the gameplay read the same document.",
    filename: "Scene.tsx",
    code: `import { AuthoredScene } from "@jgengine/shell/scene";

<AuthoredScene document={doc} field={ctx.world.ground} />;
// Enemy waypoints and tower plots derive from the same doc —
// coordinates live once, editable in the editor.`,
  },
  {
    glyph: "🎛️",
    domain: "UI & HUD",
    title: "Headless HUDs, drag-to-place",
    blurb:
      "React hooks expose game state; HudPanels auto-stack, clear the touch dock, and are laid out live with the F2 canvas editor. No fixed overlay is ever forced on your game.",
    filename: "Hud.tsx",
    code: `import { useCurrency, useAbilitySlot } from "@jgengine/react/hooks";

function Hud() {
  const gold = useCurrency("gold");
  const fireball = useAbilitySlot(abilities, "fireball");
  const cd = Math.ceil((fireball?.cooldownRemainingMs ?? 0) / 1000);
  return <HudPanel anchor="top-right">{gold} · {cd}s</HudPanel>;
}`,
  },
  {
    glyph: "📦",
    domain: "Assets",
    title: "License-verified CC0 models",
    blurb:
      "A typed, license-checked index of CC0 3D packs. Pull the models you name, register them in a catalog, and place them — no hunting for assets or licenses.",
    filename: "terminal",
    code: `# discover and pull CC0 packs, license-verified
npx jgengine assets search "tree"
npx jgengine assets pull quaternius-stylized-nature`,
  },
];

type LiveSpec = {
  key: SpecimenKey;
  domain: string;
  title: string;
  blurb: string;
  filename: string;
  code: string;
};

const LIVE_SPECIMENS: LiveSpec[] = [
  {
    key: "wind",
    domain: "world/wind · world/scatter",
    title: "Wind that moves the grass",
    blurb:
      "The blades are placed by the real scatter() and lean, every frame, toward the real windField sample. The gust fronts rippling across the meadow are the field's own turbulence — no shader fakery, no baked animation.",
    filename: "meadow.wind.ts",
    code: `import { windField } from "@jgengine/core/world/wind";
import { scatter } from "@jgengine/core/world/scatter";

const blades = scatter({ area: { w: 60, d: 40 }, count: 2600, seed: "meadow" });
const wind = windField({ speed: 2.6, gust: 1.6, turbulence: 0.6 });

// per frame, lean each blade by the real field vector at its point
const [wx, wz] = wind.atPoint(blade.x, blade.z, elapsed);
// ↑ the meadow beside this code runs exactly this call, per blade`,
  },
  {
    key: "catenary",
    domain: "world/catenary",
    title: "A cable that actually hangs",
    blurb:
      "Drag either pole. The festoon cord between the tips is the true hyperbolic cosh curve a uniform cable takes under gravity — not a bezier approximation — re-solved from the live anchor positions the moment you move one.",
    filename: "festoon.cable.ts",
    code: `import { catenaryCurve } from "@jgengine/core/world/catenary";

// true cosh catenary between the two live pole tips
const points = catenaryCurve(
  [poleA.x, 6, poleA.z],
  [poleB.x, 6, poleB.z],
  slack, // extra length as a fraction: 0.1 = 10% longer than taut
  56,
);
// drag a pole in the demo → the cable re-solves from these anchors`,
  },
  {
    key: "terrain",
    domain: "world/terrain",
    title: "Terrain from a single seed",
    blurb:
      "Every vertex height is one call into the core value-noise fractal. Turn octaves, frequency, and ridged, or reseed, and the whole field is rebuilt in place from the same function a shipped game bakes into its heightfield.",
    filename: "terrain.noise.ts",
    code: `import { fractalNoise } from "@jgengine/core/world/terrain";

const cfg = { seed, frequency, octaves, lacunarity: 2, persistence: 0.5, ridged };

// displace every plane vertex by real fractal value noise
for (const v of vertices) {
  v.y = fractalNoise(v.x, v.z, cfg);
}
// the terrain in the demo is this loop, over 91×91 vertices`,
  },
];

function Capabilities() {
  return (
    <Page>
      <PageHero
        eyebrow="Capabilities"
        title="Every system, shown as the code you'd actually write."
        blurb="JGengine is a stack of deep primitives behind narrow surfaces — worlds, entities, combat, netcode, authored scenes, HUDs, assets. Each one is a few lines of intent, not a subsystem you build. Here they are, for real."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            to="/editor"
            className="rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-300 px-5 py-2.5 text-sm font-semibold text-ink-deep shadow-[0_0_36px_-8px_rgba(52,211,153,0.7)] transition hover:shadow-[0_0_48px_-8px_rgba(52,211,153,0.9)]"
          >
            The 3D editor →
          </Link>
          <Link
            to="/why"
            className="rounded-xl border border-white/12 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.06]"
          >
            Why JGengine
          </Link>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
        <SectionHeading
          eyebrow="Live specimens"
          title="Alive, not annotated."
          blurb="Each demo below is the actual zero-dependency @jgengine/core function running in this tab, feeding three.js — exactly how @jgengine/shell consumes core in a real game. The code beside each one isn't a description of the canvas; it's what the canvas runs. Drive the dials."
        />
        <div className="mt-10 space-y-16 sm:mt-12 sm:space-y-20">
          {LIVE_SPECIMENS.map((spec, i) => (
            <section key={spec.key} className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <LiveSpecimen specimen={spec.key} />
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400/90">{spec.domain}</p>
                <h3 className="mt-3 text-balance text-2xl font-bold tracking-tight text-slate-50">{spec.title}</h3>
                <p className="mt-3 text-pretty leading-relaxed text-slate-400">{spec.blurb}</p>
                <div className="mt-5">
                  <CodeBlock code={spec.code} filename={spec.filename} tone="good" />
                </div>
              </div>
            </section>
          ))}
        </div>
        <div className="hairline mx-auto mt-16 max-w-4xl sm:mt-20" />
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="space-y-16 py-12 sm:space-y-20">
          {CAPABILITIES.map((cap, i) => (
            <section
              key={cap.title}
              className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12"
            >
              <div className={`min-w-0 ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.2em] text-emerald-400/90">
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-sm">
                    {cap.glyph}
                  </span>
                  {cap.domain}
                </p>
                <h2 className="mt-4 text-balance text-2xl font-bold tracking-tight text-slate-50">
                  {cap.title}
                </h2>
                <p className="mt-3 text-pretty leading-relaxed text-slate-400">{cap.blurb}</p>
              </div>
              <div className={`min-w-0 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                <CodeBlock code={cap.code} filename={cap.filename} />
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="relative">
        <div className="hairline mx-auto max-w-4xl" />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="And the rest"
            title="Loot, quests, economy, crafting, turns, inventory, social…"
            blurb="Genre systems are all opt-in primitives on the same core. Your agent pulls in only the domains your game needs — and nothing it doesn't."
          />
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {["loot", "quests", "economy", "crafting", "cards", "turns", "inventory", "leaderboards", "chat", "presence", "voxels", "vehicles"].map(
              (tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-xs text-slate-400"
                >
                  {tag}
                </span>
              ),
            )}
          </div>
        </div>
      </section>
    </Page>
  );
}
