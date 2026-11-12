/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";

import { Link } from "../site/link";
import { definePage } from "../site/routes";

import { GitHubIcon, Page } from "../components/Layout";
import { CodeBlock } from "../components/marketing";
import { PromptStudio } from "../components/PromptStudio";
import { HomeHero } from "../components/story/HomeHero";
import { Showcase } from "../components/story/Showcase";
import { GAME_IDS } from "../lib/games";
import { seo } from "../lib/seo";
import { REPO_URL, SITE_DESCRIPTION, SITE_TITLE } from "../lib/site";

export const Route = definePage({
  head: () => seo({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  component: Home,
});

const CREATE_OUTPUT = `$ npx jgengine create "Tide Runner"
$ cd Tide-Runner && bun install && bun dev
# a walkable 3D world with a HUD; F2+E opens the scene editor`;

function Reason({ mark, title, children }: { mark: string; title: string; children: ReactNode }) {
  return (
    <li className="lp-reason">
      <span className="lp-reason-mark" aria-hidden>
        {mark}
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  );
}

function Home() {
  return (
    <Page>
      <HomeHero />
      <Showcase />

      <section id="why" className="band band-alt" aria-labelledby="why-heading">
        <div className="band-inner">
          <header className="lp-head">
            <p className="eyebrow">Why jgengine</p>
            <h2 id="why-heading" className="story-h2">
              Your agent writes the game. The engine keeps it on track.
            </h2>
          </header>
          <ul className="lp-reasons">
            <Reason mark="›_" title="Built for coding agents">
              The skills ship inside the npm packages, so your agent reads the API where it already looks. The CLI tells it where
              things live and whether the engine already does something, then lets it screenshot and play what it built.
            </Reason>
            <Reason mark="▶" title={`Proven on ${GAME_IDS.length} real games`}>
              The games on this site live in the engine's repo and run its source from the same commit. A change that breaks one
              gets fixed in the same pull request.
            </Reason>
            <Reason mark="⧉" title="Small parts, not a black box">
              Features are combined from eleven small parts, such as meters, schedules and loot tables. Each one can be turned
              off, swapped or retuned, or taken into a three.js game you already have.
            </Reason>
            <Reason mark="⇄" title="Editor, multiplayer, desktop">
              A scene editor in the browser, one multiplayer protocol over WebSocket, WebRTC or Convex with a Node host, and
              builds for the web, a Windows .exe and npm.
            </Reason>
          </ul>
          <p className="lp-more">
            <Link to="/decisions" className="link">
              How it's built: the decisions and the numbers behind them
            </Link>
          </p>
        </div>
      </section>

      <section id="start" className="band" aria-labelledby="start-heading">
        <div className="band-inner">
          <header className="lp-head">
            <p className="eyebrow">Get started</p>
            <h2 id="start-heading" className="story-h2">
              One sentence to start.
            </h2>
            <p className="band-lede">
              Say it to Claude Code, Codex, Cursor or any agent that runs commands. Or scaffold the project yourself.
            </p>
          </header>
          <div className="lp-start">
            <div className="lp-start-col">
              <h3>Ask your agent</h3>
              <PromptStudio />
            </div>
            <div className="lp-start-col">
              <h3>Or scaffold it</h3>
              <CodeBlock code={CREATE_OUTPUT} filename="terminal" />
              <p className="lp-start-note">
                Needs <a href="https://bun.sh" className="link">Bun</a> or npm. Already have a three.js game?{" "}
                <Link to="/adopt" className="link">
                  Add one system
                </Link>{" "}
                like health, XP, saves or a minimap, or{" "}
                <Link to="/docs" className="link">
                  search the docs
                </Link>
                .
              </p>
            </div>
          </div>
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
            <a href="#games" className="btn btn-primary">
              Play a game
            </a>
            <a href={REPO_URL} className="btn btn-secondary">
              <GitHubIcon /> Star on GitHub
            </a>
          </div>
        </div>
      </section>
    </Page>
  );
}
