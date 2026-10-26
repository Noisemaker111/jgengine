import { useEffect, useState, type ReactNode } from "react";

import { continueGame, newGame, openTitle, playGame, saveNow, togglePause } from "@jgengine/core/game/gameFlow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { useGamePhase } from "../hooks";
import { useGameContext } from "../provider";
import { GameMenu } from "./gameMenu";
import { PauseMenu } from "./pauseMenu";

/**
 * New game in a browser page: a second run reloads the page so nothing from the first carries over.
 *
 * @capability start-new-game start a fresh run from a menu or result screen; reloads the page when a run already played
 */
export function startNewGame(ctx: GameContext): Promise<void> {
  return newGame(ctx, () => location.reload());
}

/** What the title and pause menus of {@link GameFlowUI} say: the game's words, keys and credits. */
export interface GameFlowMenuContent {
  /** Wordmark and accessible name. */
  name: string;
  /** Small line above the wordmark. */
  tagline?: ReactNode;
  /** One line under the wordmark. */
  pitch?: ReactNode;
  /** `--jg-accent` for both menus. */
  accent?: string;
  /** `--jg-menu-logo-size`. Default `clamp(40px, 6vw, 84px)`. */
  logoSize?: string;
  /** Rows of the Controls pane: keys, then what they do. */
  controls: readonly (readonly [string, string])[];
  /** The title's default pane: a numbered list of how a run goes. */
  briefing?: readonly string[];
  /** The Credits pane, one line each. Omit to drop the Credits verb. */
  credits?: readonly string[];
}

function menuStyle(content: GameFlowMenuContent) {
  return {
    ...(content.accent === undefined ? {} : { "--jg-accent": content.accent }),
    "--jg-menu-logo-size": content.logoSize ?? "clamp(40px, 6vw, 84px)",
  } as const;
}

function ControlsPane({ rows }: { rows: GameFlowMenuContent["controls"] }): ReactNode {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", margin: 0 }}>
      {rows.map(([keys, does]) => (
        <div key={keys} style={{ display: "contents" }}>
          <dt style={{ fontWeight: 800, letterSpacing: "0.06em" }}>{keys}</dt>
          <dd style={{ margin: 0, opacity: 0.8 }}>{does}</dd>
        </div>
      ))}
    </dl>
  );
}

function BriefingPane({ lines }: { lines: readonly string[] }): ReactNode {
  return (
    <ol style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, paddingLeft: 22, maxWidth: 520, fontSize: "1.05em" }}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
  );
}

function CreditsLines({ lines }: { lines: readonly string[] }): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
      {lines.map((line) => (
        <span key={line} style={{ opacity: 0.85 }}>
          {line}
        </span>
      ))}
    </div>
  );
}

/** Title screen over the standing world: Continue opens the save, New game starts clean, then Controls and Credits. */
function GameFlowTitle({ content }: { content: GameFlowMenuContent }): ReactNode {
  const ctx = useGameContext();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void ctx.game.save?.hasSave().then(setSaved);
  }, [ctx]);
  return (
    <GameMenu
      label={content.name}
      logo={{ text: content.name }}
      eyebrow={content.tagline}
      tagline={content.pitch}
      style={menuStyle(content)}
      items={[
        { id: "continue", label: "Continue", disabled: !saved, hint: saved ? "Back where you left off" : "No save yet" },
        { id: "new", label: "New game", hint: "Start from nothing" },
        { id: "controls", label: "Controls" },
        ...(content.credits === undefined ? [] : [{ id: "credits", label: "Credits" }]),
      ]}
      initialId={saved ? "continue" : "new"}
      detail={(id) =>
        id === "controls" ? (
          <ControlsPane rows={content.controls} />
        ) : id === "credits" && content.credits !== undefined ? (
          <CreditsLines lines={content.credits} />
        ) : content.briefing === undefined ? null : (
          <BriefingPane lines={content.briefing} />
        )
      }
      onSelect={(id) => {
        if (id === "continue") void continueGame(ctx);
        if (id === "new") void startNewGame(ctx);
      }}
    />
  );
}

/** Pause: resume, save, the controls, or back to the title (the save keeps the run). */
function GameFlowPause({ content }: { content: GameFlowMenuContent }): ReactNode {
  const ctx = useGameContext();
  return (
    <PauseMenu
      style={menuStyle(content)}
      items={[
        { id: "resume", label: "Resume" },
        { id: "save", label: "Save" },
        { id: "controls", label: "Controls" },
        { id: "title", label: "Quit to title" },
      ]}
      detail={(id) => (id === "controls" ? <ControlsPane rows={content.controls} /> : null)}
      onResume={() => togglePause(ctx)}
      onSelect={(id) => {
        if (id === "resume") playGame(ctx);
        if (id === "save") void saveNow(ctx);
        if (id === "title") void saveNow(ctx).then(() => openTitle(ctx));
      }}
    />
  );
}

/** Props for {@link GameFlowUI}. */
export interface GameFlowUIProps {
  /** The game's words, keys and credits for both menus. */
  menu: GameFlowMenuContent;
  /** The play HUD, shown in every phase but the title. */
  hud: ReactNode;
}

/**
 * A game's whole UI over `createGameFlowSystem`: the title over the standing world, the HUD while
 * playing, and the pause menu over it. The game supplies its HUD and its menu words; the look comes
 * from the UI kit and `menu.accent`.
 *
 * @capability game-flow-ui title, HUD and pause menu wired to the game-flow system — the game passes its HUD and menu words
 */
export function GameFlowUI({ menu, hud }: GameFlowUIProps): ReactNode {
  const { phase } = useGamePhase();
  return (
    <>
      {phase === "menu" ? <GameFlowTitle content={menu} /> : hud}
      {phase === "paused" ? <GameFlowPause content={menu} /> : null}
    </>
  );
}
