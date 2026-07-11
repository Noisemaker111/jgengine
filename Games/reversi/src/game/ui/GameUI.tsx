import { SettingsTrigger } from "@jgengine/react";
import { useDisplayProfile } from "@jgengine/react/display";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { DARK } from "../board";
import type { AppState } from "../state";
import { Board } from "./components/Board";
import { GameOverPanel } from "./components/GameOverPanel";
import { Menu } from "./components/Menu";
import { RecordsPanel } from "./components/RecordsPanel";
import { ScoreBug } from "./components/ScoreBug";
import { CREDIT_LINE } from "./credit";
import { COLORS } from "./theme";
import { useApp } from "./useApp";

function Card({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "12px",
        background: COLORS.panelBg,
        boxShadow: `0 10px 26px rgba(0,0,0,0.45), inset 0 0 0 1px ${COLORS.panelBorder}`,
        backdropFilter: "blur(2px)",
      }}
    >
      {children}
    </div>
  );
}

function PassBanner({ app }: { app: AppState }): React.ReactElement | null {
  if (app.passBanner === null) return null;
  const who = app.mode === "ai" ? (app.passBanner === app.aiSide ? "Computer" : "You") : app.passBanner === DARK ? "Dark" : "Light";
  return (
    <div
      style={{
        position: "absolute",
        top: "16%",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "10px 22px",
        borderRadius: "9999px",
        background: COLORS.panelBg,
        color: COLORS.text,
        fontSize: "14px",
        fontWeight: 700,
        letterSpacing: "0.02em",
        boxShadow: `0 8px 22px rgba(0,0,0,0.5), inset 0 0 0 1.5px ${COLORS.panelBorder}`,
        animation: "reversiBanner 220ms ease-out",
        pointerEvents: "none",
      }}
    >
      {who} pass — no legal move
    </div>
  );
}

export function GameUI(): React.ReactElement | null {
  const layout = useHudLayout({ storageKey: "reversi:hud" });
  const { compact } = useDisplayProfile();
  const app = useApp();
  if (app === undefined) return null;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <HudCanvas layout={layout}>
        <HudPanel id="menu" anchor="top-left" compact="chip" chip="Menu">
        <Card>
          <Menu app={app} />
        </Card>
      </HudPanel>

      <HudPanel id="score" anchor="top" order={0} compact="keep">
        <Card>
          <ScoreBug app={app} />
        </Card>
      </HudPanel>

      <HudPanel id="records" anchor="top-right" compact="chip" chip="Records">
        <Card>
          <RecordsPanel app={app} />
        </Card>
      </HudPanel>

      <HudPanel id="settings" anchor="top-right" order={-1} compact="keep">
        <Card>
          <SettingsTrigger className="flex h-6 w-6 items-center justify-center text-[#f3eede]" />
        </Card>
      </HudPanel>

      <HudPanel id="board" anchor="center" compact="keep">
        <Board app={app} />
      </HudPanel>

      <HudPanel id="credit" anchor="bottom" compact={compact ? "hide" : "keep"} interactive={false}>
        <p
          style={{
            margin: 0,
            maxWidth: "min(92vw, 640px)",
            textAlign: "center",
            fontSize: "11px",
            lineHeight: 1.4,
            color: COLORS.subtext,
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          }}
        >
          {CREDIT_LINE}
        </p>
      </HudPanel>

      </HudCanvas>

      <PassBanner app={app} />
      <GameOverPanel app={app} />
    </div>
  );
}
