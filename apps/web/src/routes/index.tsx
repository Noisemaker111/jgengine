import { Link, createFileRoute } from "@tanstack/react-router";

import { Blueprints } from "../components/Blueprints";
import { GameCard } from "../components/GameCard";
import { HeroShowcase } from "../components/HeroShowcase";
import { GitHubIcon, Page } from "../components/Layout";
import { PromptStudio } from "../components/PromptStudio";
import { CAPABILITIES, SKILL_DOMAINS } from "../lib/capabilities";
import { GAME_IDS } from "../lib/games";
import { seo } from "../lib/seo";
import { REPO_URL, SITE_DESCRIPTION, SITE_TITLE } from "../lib/site";

export const Route = createFileRoute("/")({
  head: () =>
    seo({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  component: Home,
});

const SYSTEMS = [
  {
    number: "01",
    name: "Worlds you can play.",
    type: "WORLD + PHYSICS",
    body: "Move through authored scenes, drive vehicles, and build characters that navigate and react. Terrain, weather, and physics share the same foundation.",
    tags: ["Character & vehicle controls", "Rapier physics", "AI & navigation"],
    to: "/games",
    action: "See the playable worlds",
    symbol: "world",
  },
  {
    number: "02",
    name: "The depth behind play.",
    type: "COMBAT + GAMEPLAY",
    body: "Weapons, abilities, loot, quests, crafting, and progression. Compose the systems your game needs and make the rules your own.",
    tags: [
      "Combat & abilities",
      "Inventory & crafting",
      "Quests & progression",
    ],
    to: "/capabilities",
    action: "Explore the systems",
    symbol: "combat",
  },
  {
    number: "03",
    name: "Room for everyone.",
    type: "MULTIPLAYER + STATE",
    body: "Authoritative hosts, player sessions, and persistent worlds. The same game state can run locally or connect through a network adapter.",
    tags: ["WebSocket & WebRTC", "Server authority", "Save & restore"],
    to: "/why",
    action: "See how it fits together",
    symbol: "network",
  },
  {
    number: "04",
    name: "A world you can edit.",
    type: "EDITOR + INTERFACE",
    body: "Place scenes, terrain, foliage, and assets in the editor. Build your interface from reskinnable HUD parts, then inspect the game as it runs.",
    tags: ["Visual scene editor", "Agent authoring", "Composable HUD"],
    to: "/editor",
    action: "Explore the editor",
    symbol: "editor",
  },
] as const;

function SystemDrawing({ kind }: { kind: string }) {
  return (
    <div className={`system-drawing system-drawing-${kind}`} aria-hidden>
      <svg
        viewBox="0 0 240 150"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {kind === "world" ? (
          <>
            <path d="m20 100 100 40 100-40-100-40zM20 80l100 40 100-40-100-40zM20 60l100 40 100-40-100-40z" />
            <path
              d="M120 20v120M20 60v40m200-40v40m-150-60v80m100-80v80"
              strokeDasharray="3 5"
            />
            <path d="m20 60 100 40 100-40-100-40z" className="drawing-fill" />
          </>
        ) : kind === "combat" ? (
          <>
            <circle cx="120" cy="75" r="50" />
            <circle cx="120" cy="75" r="32" strokeDasharray="4 6" />
            <path d="M120 12v35m0 56v35M57 75h35m56 0h35m-75-12 24 24m0-24-24 24" />
            <path d="m120 23 52 52-52 52-52-52z" className="drawing-fill" />
          </>
        ) : kind === "network" ? (
          <>
            <path d="m120 75-75-40m75 40 75-40m-75 40-75 40m75-40 75 40m-75-40V12m0 63v63" />
            <circle cx="120" cy="75" r="22" className="drawing-fill" />
            <circle cx="45" cy="35" r="12" />
            <circle cx="195" cy="35" r="12" />
            <circle cx="45" cy="115" r="12" />
            <circle cx="195" cy="115" r="12" />
            <circle cx="120" cy="12" r="5" />
            <circle cx="120" cy="138" r="5" />
          </>
        ) : (
          <>
            <rect x="25" y="20" width="190" height="110" rx="2" />
            <path d="M25 40h190M65 40v90m-30-80h20m-20 12h20m-20 12h12" />
            <path
              d="m100 85 37 20 38-20-38-20zM100 85v20l37 20 38-20V85m-38 20v20"
              className="drawing-fill"
            />
            <path d="m178 100 16 9-9 3-4 10z" />
          </>
        )}
      </svg>
    </div>
  );
}

function Home() {
  const featured = [
    "harbor-heat",
    "scrap-signal",
    "ember-command",
    "drift-foundry",
  ].filter((id) => GAME_IDS.includes(id));
  return (
    <Page>
      <div className="engine-home">
        <HeroShowcase />

        <div className="engine-strip" aria-label="Framework at a glance">
          <span>
            <strong>{CAPABILITIES.length}</strong> capabilities
          </span>
          <span>
            <strong>{SKILL_DOMAINS.length}</strong> focused skill domains
          </span>
          <span>
            <strong>0</strong> core dependencies
          </span>
          <span>
            <strong>100%</strong> TypeScript
          </span>
          <span className="strip-open">
            OPEN SOURCE <span aria-hidden>↗</span>
          </span>
        </div>

        <section
          id="engine"
          className="home-section"
          aria-labelledby="engine-heading"
        >
          <div className="section-index">
            <span>01 / UNDER THE HOOD</span>
            <span aria-hidden>+</span>
          </div>
          <div className="editorial-heading">
            <h2 id="engine-heading">
              A game takes
              <br />
              <span>more than graphics.</span>
            </h2>
            <p>
              JGengine gives your agent the systems behind the screen. Small,
              composable building blocks. A different game every time.
            </p>
          </div>
          <div className="systems-grid">
            {SYSTEMS.map((system) => (
              <Link key={system.number} to={system.to} className="system-card">
                <div className="system-card-top">
                  <span>{system.type}</span>
                  <span>{system.number}</span>
                </div>
                <SystemDrawing kind={system.symbol} />
                <h3>{system.name}</h3>
                <p>{system.body}</p>
                <ul>
                  {system.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
                <span className="system-action">
                  {system.action}
                  <span aria-hidden>↗</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section
          className="games-showcase home-section"
          aria-labelledby="games-heading"
        >
          <div className="section-index">
            <span>02 / BUILT WITH JGENGINE</span>
            <span>REAL GAME CAPTURES</span>
          </div>
          <div className="editorial-heading">
            <h2 id="games-heading">
              Less imagining.
              <br />
              <span>More playing.</span>
            </h2>
            <div>
              <p>
                Different worlds. Different rules. The same framework
                underneath. Play the reference games we use to push the engine
                forward.
              </p>
              <Link to="/games" className="text-action">
                Explore all {GAME_IDS.length || ""} games{" "}
                <span aria-hidden>↗</span>
              </Link>
            </div>
          </div>
          <div className="showcase-grid">
            {featured.map((id, index) => (
              <div className="showcase-item" key={id}>
                <div className="showcase-label">
                  <span>0{index + 1} / ENGINE IN ACTION</span>
                  <span aria-hidden>↗</span>
                </div>
                <GameCard id={id} size="lg" />
              </div>
            ))}
          </div>
          <p className="showcase-note">
            Playable reference projects, not templates. Each game has its own
            art, rules, and credits.
          </p>
        </section>

        <section
          className="build-section home-section"
          id="start-building"
          aria-labelledby="build-heading"
        >
          <div className="section-index">
            <span>03 / FROM IDEA TO PLAY</span>
            <span aria-hidden>+</span>
          </div>
          <div className="build-composition">
            <div className="build-copy">
              <p className="eyebrow">You bring the idea</p>
              <h2 id="build-heading">
                Start with
                <br />
                <span>a sentence.</span>
              </h2>
              <p>
                Tell Claude Code, Codex, Cursor, or your coding agent what you
                want to make. JGengine ships the skills and APIs it needs to get
                building.
              </p>
              <ol className="build-steps">
                <li>
                  <span>01</span>
                  <div>
                    <h3>Describe your game</h3>
                    <p>The world, the rules, the thing that makes it yours.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <h3>Your agent uses the engine</h3>
                    <p>
                      Focused skills guide design, implementation, and testing.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <h3>Play. Change. Repeat.</h3>
                    <p>
                      Your own project, real TypeScript, and room to keep
                      building.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
            <PromptStudio />
          </div>
        </section>

        <section
          className="blueprint-section home-section"
          aria-labelledby="blueprint-heading"
        >
          <div className="section-index">
            <span>04 / LOOK INSIDE</span>
            <span>REAL SDK IMPORTS</span>
          </div>
          <div className="editorial-heading">
            <h2 id="blueprint-heading">
              Your game.
              <br />
              <span>Not a genre kit.</span>
            </h2>
            <p>
              See how an agent combines existing capabilities for different
              ideas. Every block below comes from the engine’s skill indexes.
            </p>
          </div>
          <Blueprints />
        </section>

        <section className="open-source-section" aria-labelledby="open-heading">
          <div>
            <span className="micro-label">NO ROYALTIES. NO BLACK BOX.</span>
            <h2 id="open-heading">
              Make it yours.
              <br />
              Keep it yours.
            </h2>
            <p>
              Apache-2.0. Commercial and closed-source games welcome.
              <br />
              Keep the license and attribution notices. Ship your idea.
            </p>
            <a href={REPO_URL} className="btn">
              <GitHubIcon /> Explore the source <span aria-hidden>↗</span>
            </a>
          </div>
          <span className="source-asterisk" aria-hidden>
            ✳
          </span>
        </section>
      </div>
    </Page>
  );
}
