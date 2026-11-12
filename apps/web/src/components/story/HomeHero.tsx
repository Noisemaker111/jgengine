/** @jsxImportSource @jgengine/core/ui/jsx */
import { GitHubIcon } from "../Layout";
import { CopyButton } from "../Copy";
import { GAME_IDS, gameCover, gameTitle } from "../../lib/games";
import { REPO_URL } from "../../lib/site";

export const CREATE_COMMAND = 'npx jgengine create "My Game"';

/** The game on the hero screen: its cover is the strongest frame, and its orange matches the brand accent. */
const HERO_GAME = "drift-foundry";

/** One-line pitch, three calls to action, and a real game running on the engine. */
export function HomeHero() {
  const cover = gameCover(HERO_GAME);
  return (
    <section className="lp-hero" aria-labelledby="hero-heading">
      <div className="lp-hero-glow" aria-hidden />
      <div className="lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="eyebrow animate-fade-up">Open source · TypeScript · three.js</p>
          <h1 id="hero-heading" className="lp-h1 animate-fade-up" style={{ animationDelay: "60ms" }}>
            The game engine your <em>coding agent</em> builds on.
          </h1>
          <p className="lp-sub animate-fade-up" style={{ animationDelay: "120ms" }}>
            Tell Claude Code, Codex or Cursor <q>Make a game that … with jgengine</q>. The engine gives it ready-made game parts,
            the docs to find them, and tools to screenshot and play what it built. {GAME_IDS.length} games already run on it, right
            in your browser.
          </p>
          <div className="lp-actions animate-fade-up" style={{ animationDelay: "180ms" }}>
            <a href="#games" className="btn btn-primary">
              Play a game <span className="arrow" aria-hidden>→</span>
            </a>
            <a href="#start" className="btn btn-secondary">
              Get started
            </a>
            <a href={REPO_URL} className="btn btn-quiet">
              <GitHubIcon /> GitHub
            </a>
          </div>
          <div className="command-chip lp-command animate-fade-up" style={{ animationDelay: "220ms" }}>
            <span aria-hidden>$</span>
            <code>{CREATE_COMMAND}</code>
            <CopyButton value={CREATE_COMMAND} label="" ariaLabel="Copy the create command" variant="ghost" />
          </div>
        </div>
        {cover !== null && (
          <a href={`/games/${HERO_GAME}`} className="lp-hero-shot gizmo animate-fade-up" style={{ animationDelay: "140ms" }}>
            <img src={cover} alt={`${gameTitle(HERO_GAME)}, a racing game built on jgengine`} width={800} height={450} decoding="async" />
            <span className="lp-hero-caption">
              <span className="lp-play-dot" aria-hidden>
                ▶
              </span>
              <span>
                <strong>{gameTitle(HERO_GAME)}</strong> Built on jgengine. Play it in your browser.
              </span>
            </span>
          </a>
        )}
      </div>
    </section>
  );
}
