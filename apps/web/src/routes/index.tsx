import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { HeroShowcase } from "../components/HeroShowcase";
import { GitHubIcon, Page } from "../components/Layout";
import { CodeBlock } from "../components/marketing";
import { PromptStudio } from "../components/PromptStudio";
import { CAPABILITIES, capability } from "../lib/capabilities";
import { GAME_IDS, gameCover, gameTitle } from "../lib/games";
import { seo } from "../lib/seo";
import { REPO_URL, SITE_DESCRIPTION, SITE_TITLE } from "../lib/site";
import { BASELINE_GPU, MEASURED_GAME_COUNT, SCENE_READY_RANGE_MS, WORST_MENU_CLICK_MS, secondsCeil } from "../lib/siteFacts";
import { snippet } from "../snippets";
import { SYSTEMS } from "../lib/systems";

export const Route = createFileRoute("/")({
  head: () => seo({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  component: Home,
});

const CREATE_OUTPUT = `$ npx jgengine create "Tide Runner"
created Tide Runner (3d, standalone) → ./Tide-Runner

next steps:
  cd Tide-Runner
  bun install
  bun dev   # walkable base: WASD + jump, HUD canvas
  # F2+E in the browser opens the scene editor`;

const SYNC_OUTPUT = `# add "ws" to engine in jgengine.json, then:
$ npx jgengine sync
sync Tide-Runner: updated package.json`;

const AGENT_TOOLS: readonly { command: string; does: string }[] = [
  { command: "jgengine create", does: "Starts a playable game and installs the engine's skills into the project, so the agent knows the API before it writes a line." },
  { command: "jgengine find <words>", does: "Names the folder, exports and capability for a concept, so the agent reuses the engine instead of writing its own." },
  { command: "jgengine recipe <name>", does: "Prints a wired, type-checked snippet for a common joint: combat, loot, quests, vehicles, co-op." },
  { command: "jgengine shoot · drive", does: "Boots the game headless, takes a real screenshot and plays it with keys and clicks, so the agent sees what it built." },
];

/** Games that use the controllers shown in the movement section, and what each one does there. */
const CONTROLLER_PROOF: readonly { id: string; does: string }[] = [
  { id: "apex-nights", does: "Drive: night street racing on the vehicle model" },
  { id: "harbor-heat", does: "Walk, drive and fly in one city" },
  { id: "the-sunken-crown", does: "Walk and glide through ruins" },
];

function Home() {
  const controllerProof = CONTROLLER_PROOF.filter((item) => GAME_IDS.includes(item.id) && gameCover(item.id) !== null);
  return (
    <Page>
      <HeroShowcase />

      <section className="proof-strip" aria-label="jgengine in numbers">
        <div className="proof-inner">
          <Stat value="1" label="command to a walkable 3D game" />
          <Stat value={String(CAPABILITIES.length)} label="engine capabilities, each with its import" />
          <Stat value={`< ${secondsCeil(WORST_MENU_CLICK_MS)}`} label="slowest menu click while a game loads" />
          <Stat value={String(GAME_IDS.length)} label="games built on it, playable here" />
        </div>
      </section>

      <div id="features">
        <Feature
          id="start"
          eyebrow="Start"
          title="One command to a game you can walk around in."
          body={
            <>
              <p>
                You get terrain, sky, a player that walks and jumps, a HUD and the scene editor, plus the engine's skills
                for your coding agent. <code className="inline-code">jgengine.json</code> lists the engine packages the game
                uses; add one and <code className="inline-code">sync</code> installs it.
              </p>
            </>
          }
        >
          <CodeBlock code={CREATE_OUTPUT} filename="terminal" />
          <CodeBlock code={SYNC_OUTPUT} filename="terminal" />
        </Feature>

        <Feature
          id="mobile"
          alt
          eyebrow="Phones"
          title="A HUD that fits every screen, with touch controls."
          body={
            <>
              <p>
                Give each panel an anchor and a priority. The engine places them so they never cover each other, folds the
                least important into a tap-to-open chip when room runs out, and only then scales the HUD down.
              </p>
              <p>
                On a phone, movement gets a stick and your actions get buttons, with no extra code. List the buttons you
                want, or swap sets when the player gets in a car.
              </p>
            </>
          }
          demo={
            <figure className="device-pair">
              <img src="/demo/hud-desktop.webp" alt="Beacon Bastion's HUD on a desktop screen" width={1280} height={720} loading="lazy" decoding="async" />
              <img src="/demo/hud-phone.webp" alt="The same HUD laid out on a phone" width={390} height={844} loading="lazy" decoding="async" className="device-phone" />
              <figcaption>Beacon Bastion, one HUD on desktop and phone. Real captures.</figcaption>
            </figure>
          }
        >
          <CodeBlock code={snippet("mobile-hud.tsx")} filename="src/game/ui/GameUI.tsx" />
        </Feature>

        <Feature
          id="save"
          eyebrow="Saves"
          title="Saving is on before you write a line."
          body={
            <>
              <p>
                A single-player game saves its whole world to the browser and loads it back, by default. Set how often it
                writes, bump a version and migrate old saves, or turn it off with{" "}
                <code className="inline-code">persist: false</code>.
              </p>
              <p>Add the game-flow system for the title, pause and checkpoint flow, and a Continue that picks up the last save.</p>
            </>
          }
        >
          <CodeBlock code={snippet("save.ts")} filename="src/game.config.ts" />
        </Feature>

        <Feature
          id="movement"
          alt
          eyebrow="Movement"
          title="Walking, driving and flying that feel right from the start."
          body={
            <>
              <p>
                A new game already walks: capsule movement with jump, steps and slopes. Cars are force-based, with arcade,
                sim and drift styles you adjust with grip, drift, assist and body roll. Flight comes in hover, creative,
                spectator and noclip modes, and aircraft have their own model.
              </p>
            </>
          }
          demo={
            controllerProof.length > 0 ? (
              <ul className="proof-tiles" aria-label="Games using these controllers">
                {controllerProof.map((item) => (
                  <li key={item.id}>
                    <Link to="/games/$id" params={{ id: item.id }}>
                      <img src={gameCover(item.id)!} alt="" width={800} height={450} loading="lazy" decoding="async" />
                      <span className="proof-tile-title">{gameTitle(item.id)}</span>
                      <span className="proof-tile-does">{item.does}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : undefined
          }
        >
          <CodeBlock code={snippet("controllers.ts")} filename="src/game/movement.ts" />
        </Feature>

        <Feature
          id="physics"
          eyebrow="Physics"
          title="Physics built in. Rapier when you need more."
          body={
            <>
              <p>
                The built-in solver handles gravity, jumping, character movement and collision with no dependencies. Pass{" "}
                <code className="inline-code">@jgengine/rapier</code> as the backend for rigid bodies, joints (fixed, hinge,
                ball, distance, spring) and continuous collision. Both pass the same backend test suite.
              </p>
            </>
          }
        >
          <CodeBlock code={snippet("physics.ts")} filename="src/world.ts" />
        </Feature>
      </div>

      <section className="band band-alt" aria-labelledby="systems-heading">
        <div className="band-inner">
          <header className="band-head">
            <div>
              <p className="eyebrow">Systems</p>
              <h2 id="systems-heading" className="band-title">
                Deep systems, all with knobs.
              </h2>
            </div>
            <p className="band-lede">
              The hard parts ship in the engine and are tuned with plain options, not rewritten per game. Each card shows the
              line that imports it.
            </p>
          </header>
          <ul className="systems">
            {SYSTEMS.map((system) => {
              const row = system.ref === undefined ? undefined : capability(system.ref);
              return (
                <li key={system.name} className="system">
                  <h3>{system.name}</h3>
                  <p>{system.line}</p>
                  <ul className="knobs" aria-label={`${system.name} options`}>
                    {system.knobs.map((knob) => (
                      <li key={knob}>{knob}</li>
                    ))}
                  </ul>
                  <code className="system-import">{row?.exports[0]?.importLine ?? system.home}</code>
                </li>
              );
            })}
          </ul>
          <div className="band-foot">
            <Link to="/playground" className="btn btn-primary">
              Grow a city with sliders <span className="arrow" aria-hidden>→</span>
            </Link>
            <Link to="/capabilities" className="btn btn-secondary">
              Search all {CAPABILITIES.length} capabilities <span className="arrow" aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="speed-heading">
        <div className="band-inner">
          <header className="band-head">
            <div>
              <p className="eyebrow">Loading</p>
              <h2 id="speed-heading" className="band-title">
                The menu answers in under a second.
              </h2>
            </div>
            <p className="band-lede">
              The menu answers while the world is still loading. Every change that touches a game is timed against a saved
              baseline, and one that makes a game load slower fails the check.
            </p>
          </header>
          <div className="speed-grid">
            <Stat value={`${WORST_MENU_CLICK_MS} ms`} label={`slowest menu click on a cold load, across ${MEASURED_GAME_COUNT} games`} />
            <Stat
              value={`${secondsCeil(SCENE_READY_RANGE_MS[0])}–${secondsCeil(SCENE_READY_RANGE_MS[1])}`}
              label="until the full 3D scene is ready, by game"
            />
            <Stat value={BASELINE_GPU} label="the machine the baseline is measured on" />
          </div>
        </div>
      </section>

      <section className="band band-alt" aria-labelledby="agents-heading">
        <div className="band-inner agents">
          <div>
            <p className="eyebrow">Made for coding agents</p>
            <h2 id="agents-heading" className="band-title">
              Say what you want. Your agent builds it.
            </h2>
            <p className="band-lede mt-5">
              Claude Code, Codex, Cursor or any agent that runs commands. The engine gives it the map, the parts, and a way to
              check its own work.
            </p>
            <ul className="agent-tools">
              {AGENT_TOOLS.map((tool) => (
                <li key={tool.command}>
                  <code>{tool.command}</code>
                  <p>{tool.does}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted">
              Agents can also read{" "}
              <a href="/llms.txt" className="link">
                llms.txt
              </a>{" "}
              and{" "}
              <a href="/agents.md" className="link">
                agents.md
              </a>
              .
            </p>
          </div>
          <PromptStudio />
        </div>
      </section>

      <section className="closing" aria-labelledby="open-heading">
        <div className="bg-grid bg-grid-fade closing-grid" aria-hidden />
        <div className="closing-inner">
          <p className="eyebrow">Apache-2.0</p>
          <h2 id="open-heading" className="closing-title">
            Free to use. Yours to ship.
          </h2>
          <p className="band-lede mx-auto">
            Commercial and closed-source games are fine. Keep the license and NOTICE file in what you ship. No royalties.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={REPO_URL} className="btn btn-primary">
              <GitHubIcon /> Get the source
            </a>
            <Link to="/games" className="btn btn-secondary">
              See games built with it
            </Link>
          </div>
        </div>
      </section>
    </Page>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Feature({
  id,
  eyebrow,
  title,
  body,
  demo,
  alt = false,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
  demo?: ReactNode;
  alt?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={alt ? "band band-alt" : "band"} aria-labelledby={`${id}-heading`}>
      <div className="band-inner feature">
        <div className="feature-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={`${id}-heading`} className="band-title">
            {title}
          </h2>
          <div className="feature-body">{body}</div>
          {demo}
        </div>
        <div className="feature-code">{children}</div>
      </div>
    </section>
  );
}
