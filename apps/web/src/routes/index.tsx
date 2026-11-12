/** @jsxImportSource @jgengine/core/ui/jsx */
import { Link } from "../site/link";
import { definePage } from "../site/routes";

import { GitHubIcon, Page } from "../components/Layout";
import { CodeBlock } from "../components/marketing";
import { PromptStudio } from "../components/PromptStudio";
import { DecisionLog } from "../components/story/DecisionLog";
import { Different, OpenNumbers, Stack } from "../components/story/Different";
import { HomeHero } from "../components/story/HomeHero";
import { PressStart } from "../components/story/PressStart";
import { EngineTour } from "../live/EngineTour";
import { CAPABILITIES } from "../lib/capabilities";
import { seo } from "../lib/seo";
import { REPO_URL, SITE_DESCRIPTION, SITE_TITLE } from "../lib/site";

export const Route = definePage({
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

function Home() {
  return (
    <Page>
      <HomeHero />
      <PressStart />
      <Different />
      <DecisionLog />
      <Stack />

      <EngineTour
        demos={["car", "projectiles", "keys", "grass", "saves", "minimap", "xp"]}
        eyebrow="Touch the engine"
        title="This page runs the engine too."
        lede="Each demo plays itself in your browser. Take over with the keys or mouse, or move a control and the code under it changes. The highlighted lines are the ones doing the work right now."
      />

      <OpenNumbers />

      <section id="start" className="band" aria-labelledby="start-heading">
        <div className="band-inner">
          <header className="band-head">
            <div>
              <p className="eyebrow">Start</p>
              <h2 id="start-heading" className="story-h2">
                Three ways in. Pick the one that fits.
              </h2>
            </div>
            <p className="band-lede">
              Most people only need the first. The second is what the agent runs for you. The third is for a game you already have.
            </p>
          </header>
          <ol className="doors">
            <li className="door">
              <span className="door-n">1</span>
              <h3>Say it to your agent.</h3>
              <p>Claude Code, Codex, Cursor, or any agent that can run commands. Edit the idea, copy it, paste it.</p>
              <PromptStudio />
            </li>
            <li className="door">
              <span className="door-n">2</span>
              <h3>Scaffold it yourself.</h3>
              <p>
                One command gives you a walkable 3D game, a HUD, the scene editor and the agent skills. Bun or npm, no global
                install.
              </p>
              <CodeBlock code={CREATE_OUTPUT} filename="terminal" />
            </li>
            <li className="door">
              <span className="door-n">3</span>
              <h3>Take one part.</h3>
              <p>
                Already have a three.js game? Pull in health, XP, saves or the minimap on their own, with no rewrite. Search all{" "}
                {CAPABILITIES.length} capabilities with their imports.
              </p>
              <div className="door-links">
                <Link to="/adopt" className="btn btn-secondary">
                  Use one system <span className="arrow" aria-hidden>→</span>
                </Link>
                <Link to="/docs" className="btn btn-secondary">
                  Search capabilities <span className="arrow" aria-hidden>→</span>
                </Link>
                <Link to="/cookbook" className="btn btn-secondary">
                  Cookbook <span className="arrow" aria-hidden>→</span>
                </Link>
              </div>
            </li>
          </ol>
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
              Play the games
            </Link>
          </div>
        </div>
      </section>
    </Page>
  );
}
