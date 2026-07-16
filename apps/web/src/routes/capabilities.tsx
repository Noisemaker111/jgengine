import { Link, createFileRoute } from "@tanstack/react-router";

import { Page, PageHero, SectionHeading } from "../components/Layout";
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
    title: "Terrain, sky, and weather from intent",
    blurb:
      "Describe the world; the SDK generates the mesh, GPU-instanced vegetation, fog, and a collision heightfield every consumer reads from one field.",
    filename: "world.ts",
    code: `import { environment, terrain, sky, grass } from "@jgengine/core/world/features";

export const world = environment({
  terrain: terrain({ bounds: { w: 256, d: 256 }, height: 8, material: "grass" }),
  sky: sky({ preset: "dusk" }),
  vegetation: grass({ area: { w: 200, d: 200 }, density: 2, seed: "meadow" }),
});`,
  },
  {
    glyph: "🧩",
    domain: "Scene & entities",
    title: "Spawn and simulate entities",
    blurb:
      "A per-world entity store you spawn into and tick. State serializes cleanly and scales to many entities and many players — no module-global maps.",
    filename: "loop.ts",
    code: `export function onNewPlayer(ctx: GameContext) {
  ctx.scene.entity.spawn(PLAYER, { id: ctx.player.userId, position: SPAWN });
}

export function onTick(ctx: GameContext, dt: number) {
  for (const mob of ctx.scene.entity.all("mob")) {
    mob.position.x += mob.velocity.x * dt;
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
    code: `import { createAbilityKit } from "@jgengine/core/combat/abilities";
import { createDeathSystem } from "@jgengine/core/combat/death";

const abilities = createAbilityKit({
  fireball: { cost: 20, cooldown: 1.5, cast: 0.4, range: 30 },
});
const death = createDeathSystem({ onDeath: (e) => dropLoot(e) });`,
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
  gameId: "meadow-run",
});
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
import { resolveScatter } from "@jgengine/core/world/scatterRegion";

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
  const fireball = useAbilitySlot("fireball");
  return <HudPanel anchor="top-right">{gold} · {fireball.cooldown}</HudPanel>;
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

      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="space-y-16 py-12 sm:space-y-20">
          {CAPABILITIES.map((cap, i) => (
            <section
              key={cap.title}
              className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12"
            >
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
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
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
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
