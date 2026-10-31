import { useEffect, useState, type ReactNode } from "react";

import { continueGame, newGame, openTitle, playGame, runPlayed, saveNow, togglePause } from "@jgengine/core/game/gameFlow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { useHasSettings, useSettings } from "@jgengine/core/settings/settings.view";
import { useGamePhase } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import type { CreditsDocument } from "./credits";
import { GameMenu } from "./gameMenu.view";
import { CreditsPane } from "./gameMenuSaves.view";
import { PauseMenu } from "./pauseMenu.view";

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
  /** The Credits pane: one line each, or a sectioned credits document. Omit to drop the Credits verb. */
  credits?: readonly string[] | CreditsDocument;
  /** The Settings verb on both menus, opening the engine settings surface. Default true; it shows only when the game has settings. */
  settings?: boolean;
  /**
   * A screen between New game and play (a character creator, a start-region choice), drawn in place
   * of the title over the standing world. Call `begin()` once the choices are applied to start the
   * run, or `back()` to return to the title. Omit to go straight into play.
   */
  newGameSetup?: (begin: () => void, back: () => void) => ReactNode;
}

/** Session key that reopens the setup after the page restarts for a second New game. */
const SETUP_AFTER_RESTART = "jgengine:new-game-setup";

function setupAfterRestart(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const pending = sessionStorage.getItem(SETUP_AFTER_RESTART) === "1";
  sessionStorage.removeItem(SETUP_AFTER_RESTART);
  return pending;
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

function CreditsDetail({ credits }: { credits: NonNullable<GameFlowMenuContent["credits"]> }): ReactNode {
  if ("sections" in credits) return <CreditsPane sections={credits.sections} heading={credits.title ?? "Credits"} notice={credits.notice} />;
  return <CreditsLines lines={credits} />;
}

function SettingsDetail(): ReactNode {
  return <p style={{ margin: 0, maxWidth: 420, opacity: 0.85 }}>Graphics quality, sound, key bindings and accessibility.</p>;
}

/** Whether the Settings verb shows: the game has settings and did not turn the verb off. */
function useSettingsVerb(content: GameFlowMenuContent): boolean {
  const has = useHasSettings();
  return has && content.settings !== false;
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

/** Title screen over the standing world: Continue opens the save, New game starts clean, then Controls, Settings and Credits. */
function GameFlowTitle({ content }: { content: GameFlowMenuContent }): ReactNode {
  const ctx = useGameContext();
  const settings = useSettings();
  const withSettings = useSettingsVerb(content);
  const [saved, setSaved] = useState(false);
  const setup = content.newGameSetup;
  const [settingUp, setSettingUp] = useState(() => setup !== undefined && setupAfterRestart());
  useEffect(() => {
    void ctx.game.save?.hasSave().then(setSaved);
  }, [ctx]);
  const startNew = (): void => {
    if (setup === undefined) {
      void startNewGame(ctx);
      return;
    }
    if (runPlayed(ctx)) {
      sessionStorage.setItem(SETUP_AFTER_RESTART, "1");
      location.reload();
      return;
    }
    setSettingUp(true);
  };
  if (settingUp && setup !== undefined) {
    return setup(
      () => void startNewGame(ctx),
      () => setSettingUp(false),
    );
  }
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
        ...(withSettings ? [{ id: "settings", label: "Settings", hint: "Graphics, sound, keys" }] : []),
        ...(content.credits === undefined ? [] : [{ id: "credits", label: "Credits" }]),
      ]}
      initialId={saved ? "continue" : "new"}
      detail={(id) =>
        id === "controls" ? (
          <ControlsPane rows={content.controls} />
        ) : id === "settings" ? (
          <SettingsDetail />
        ) : id === "credits" && content.credits !== undefined ? (
          <CreditsDetail credits={content.credits} />
        ) : content.briefing === undefined ? null : (
          <BriefingPane lines={content.briefing} />
        )
      }
      onSelect={(id) => {
        if (id === "continue") void continueGame(ctx);
        if (id === "new") startNew();
        if (id === "settings") settings.open();
      }}
    />
  );
}

/** Pause: resume, save, the controls, or back to the title (the save keeps the run). */
function GameFlowPause({ content }: { content: GameFlowMenuContent }): ReactNode {
  const ctx = useGameContext();
  const settings = useSettings();
  const withSettings = useSettingsVerb(content);
  return (
    <PauseMenu
      style={menuStyle(content)}
      items={[
        { id: "resume", label: "Resume" },
        { id: "save", label: "Save" },
        { id: "controls", label: "Controls" },
        ...(withSettings ? [{ id: "settings", label: "Settings" }] : []),
        { id: "title", label: "Quit to title" },
      ]}
      detail={(id) => (id === "controls" ? <ControlsPane rows={content.controls} /> : id === "settings" ? <SettingsDetail /> : null)}
      onResume={() => togglePause(ctx)}
      onSelect={(id) => {
        if (id === "resume") playGame(ctx);
        if (id === "save") void saveNow(ctx);
        if (id === "settings") settings.open();
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
