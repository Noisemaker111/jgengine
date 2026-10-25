import { useEffect, useState, type ReactNode } from "react";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGameContext } from "@jgengine/react/provider";

import { BRIEFING, CONTROLS, CREDITS } from "../controls";
import { continueGame, newGame, openTitle, play, saveNow, togglePause } from "../flow";
import { idea } from "../idea";

/** The kit's own tokens carry the look; the accent is the idea's. */
const MENU_STYLE = { "--jg-accent": idea.accent, "--jg-menu-logo-size": "clamp(40px, 6vw, 84px)" } as const;

function Controls(): ReactNode {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", margin: 0 }}>
      {CONTROLS.map(([keys, does]) => (
        <div key={keys} style={{ display: "contents" }}>
          <dt style={{ fontWeight: 800, letterSpacing: "0.06em" }}>{keys}</dt>
          <dd style={{ margin: 0, opacity: 0.8 }}>{does}</dd>
        </div>
      ))}
    </dl>
  );
}

function Briefing(): ReactNode {
  return (
    <ol style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, paddingLeft: 22, maxWidth: 520, fontSize: "1.05em" }}>
      {BRIEFING.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
  );
}

function Credits(): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
      {CREDITS.map((line) => (
        <span key={line} style={{ opacity: 0.85 }}>
          {line}
        </span>
      ))}
    </div>
  );
}

/** Title screen: Continue opens the autosave, New game starts clean. */
export function TitleMenu(): ReactNode {
  const ctx = useGameContext();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void ctx.game.save?.hasSave().then(setSaved);
  }, [ctx]);
  return (
    <GameMenu
      label={idea.name}
      logo={{ text: idea.name }}
      eyebrow={idea.tagline}
      tagline={idea.pitch}
      style={MENU_STYLE}
      items={[
        { id: "continue", label: "Continue", disabled: !saved, hint: saved ? "Back where you left off" : "No save yet" },
        { id: "new", label: "New game", hint: "Start from nothing" },
        { id: "controls", label: "Controls" },
        { id: "credits", label: "Credits" },
      ]}
      initialId={saved ? "continue" : "new"}
      detail={(id) => (id === "controls" ? <Controls /> : id === "credits" ? <Credits /> : <Briefing />)}
      onSelect={(id) => {
        if (id === "continue") void continueGame(ctx);
        if (id === "new") void newGame(ctx);
      }}
    />
  );
}

/** Pause: resume, save, the controls, or back to the title (the autosave keeps the run). */
export function PauseMenu(): ReactNode {
  const ctx = useGameContext();
  return (
    <GamePauseMenu
      style={MENU_STYLE}
      items={[
        { id: "resume", label: "Resume" },
        { id: "save", label: "Save" },
        { id: "controls", label: "Controls" },
        { id: "title", label: "Quit to title" },
      ]}
      detail={(id) => (id === "controls" ? <Controls /> : null)}
      onResume={() => togglePause(ctx)}
      onSelect={(id) => {
        if (id === "resume") play(ctx);
        if (id === "save") void saveNow(ctx);
        if (id === "title") void saveNow(ctx).then(() => openTitle(ctx));
      }}
    />
  );
}
