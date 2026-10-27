import { Link } from "@tanstack/react-router";

import { CopyButton } from "./Copy";
import { CodeBlock } from "./marketing";

export const CREATE_COMMAND = 'npx jgengine create "My Game"';

/** src/game.config.ts as `jgengine create "Tide Runner"` writes it (packages/jgengine/src/templates/gameFiles.ts), comments trimmed. */
const NEW_GAME_CONFIG = `import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { entityModels, objectModels } from "./game/models";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { world } from "./world";

export const game = defineGame({
  name: "Tide Runner",
  simulation: { hz: 60 },
  look: "cinematic",
  mood: "day",
  assets,
  world,
  input: { ...DEFAULT_WALK_CODES, interact: ["KeyE"] },
  systems,
  loop: { onNewPlayer },
  GameUI,
  editorLayers,
  entityModels,
  objectModels,
});`;

export function HeroShowcase() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="bg-grid bg-grid-fade hero-grid" aria-hidden />
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow animate-fade-up">Open-source TypeScript engine on three.js</p>
          <h1 id="hero-heading" className="hero-title animate-fade-up" style={{ animationDelay: "60ms" }}>
            Build three.js games <span>10x faster.</span>
          </h1>
          <p className="hero-lede animate-fade-up" style={{ animationDelay: "120ms" }}>
            jgengine ships the parts every 3D game rebuilds: a HUD that fits any screen, touch controls, saves, walking,
            driving and flying, physics, terrain, grass, cities, combat and multiplayer. You set the options and write
            the part that makes your game yours.
          </p>
          <div className="hero-actions animate-fade-up" style={{ animationDelay: "180ms" }}>
            <div className="command-chip">
              <span aria-hidden>$</span>
              <code>{CREATE_COMMAND}</code>
              <CopyButton value={CREATE_COMMAND} label="" ariaLabel="Copy the create command" variant="ghost" />
            </div>
            <a href="#features" className="btn btn-secondary">
              See what you get <span className="arrow" aria-hidden>↓</span>
            </a>
          </div>
        </div>

        <div className="hero-viewport animate-fade-up" style={{ animationDelay: "120ms" }}>
          <CodeBlock code={NEW_GAME_CONFIG} filename="src/game.config.ts · as create writes it" className="hero-code" />
          <p className="hero-code-note">
            That is the whole game file of a new project. <code className="inline-code">bun dev</code> and you are walking a
            3D world with a HUD; F2+E opens the scene editor.{" "}
            <Link to="/playground" hash="editor" className="link">
              Try the editor
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
