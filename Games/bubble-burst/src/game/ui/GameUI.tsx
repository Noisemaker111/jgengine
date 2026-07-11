import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { SettingsTrigger } from "@jgengine/react";

import { bubbleStore } from "../bubble/store";
import { Banner, CompressorPanel, LevelPanel, NextPanel, ScorePanel } from "./components/Hud";
import { Overlays } from "./components/Overlays";
import { Playfield } from "./Playfield";

const CREDIT = "Homage to Puzzle Bobble — Taito (1994)";
const FONT = "'Trebuchet MS', system-ui, sans-serif";

export function GameUI() {
  const snap = useEngineState(bubbleStore);
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "bubble-burst" });
  useDisplayProfile();

  return (
    <div
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        fontFamily: FONT,
        background: "radial-gradient(circle at 50% 12%, #0d4a41 0%, #052a25 55%, #03201d 100%)",
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <Playfield />
      </div>

      <HudCanvas layout={layout} className="select-none">
        <HudPanel id="level" anchor="top-left" compact="chip" chip="LVL" interactive={false} inset={{ x: 16, y: 16 }}>
          <LevelPanel snap={snap} />
        </HudPanel>

        <HudPanel id="score" anchor="top-right" compact="keep" interactive={false} inset={{ x: 16, y: 16 }}>
          <ScorePanel snap={snap} />
        </HudPanel>

        <HudPanel id="settings" anchor="top-right" compact="keep" inset={{ x: 16, y: 16 }}>
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(233,196,106,0.30)] bg-[rgba(4,32,29,0.74)] text-[#e9c46a] shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:bg-[rgba(233,196,106,0.16)]" />
        </HudPanel>

        <HudPanel id="compressor" anchor="bottom-left" compact="keep" interactive={false} inset={{ x: 16, y: 44 }}>
          <div className="w-44 max-w-[46vw]">
            <CompressorPanel snap={snap} />
          </div>
        </HudPanel>

        <HudPanel id="next" anchor="bottom-right" compact="keep" inset={{ x: 16, y: 44 }}>
          <NextPanel snap={snap} onSwap={() => commands.run("swap", {})} />
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false} inset={{ x: 0, y: 12 }}>
          <span
            className="rounded-full px-3 py-1 text-center text-[11px] font-medium tracking-wide"
            style={{ color: "#9fc7bc", background: "rgba(4,32,29,0.6)" }}
          >
            {CREDIT}
          </span>
        </HudPanel>
      </HudCanvas>

      <Banner snap={snap} />
      <Overlays snap={snap} onRestart={() => commands.run("restart", {})} />
    </div>
  );
}
