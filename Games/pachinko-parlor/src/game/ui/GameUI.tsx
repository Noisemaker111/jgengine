import { HudCanvas, HudPanel, useEngineState, useHudLayout } from "@jgengine/react";
import { PALETTE } from "../palette";
import { pachinkoStore } from "../store";
import { Board } from "./Board";
import { FeverBanner, BrokeScreen } from "./components/overlays";
import { PowerControls, StatReadout, Title, WinsFeed } from "./components/panels";

const parlorBg: React.CSSProperties = {
  background: `radial-gradient(120% 80% at 50% -10%, #4a2c17 0%, #2a1810 45%, #17100b 100%)`,
};

export function GameUI() {
  const snap = useEngineState(pachinkoStore);
  const layout = useHudLayout({ storageKey: "pachinko-parlor", snap: 8 });

  return (
    <div className="relative h-full w-full overflow-hidden" style={parlorBg}>
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <div className="relative h-full" style={{ aspectRatio: "2 / 3", maxWidth: "100%" }}>
          <div
            className="absolute -inset-2 rounded-[22px]"
            style={{
              background: `linear-gradient(160deg, ${PALETTE.frameLight}, ${PALETTE.frame} 40%, ${PALETTE.frameDark})`,
              boxShadow: `0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 3px ${PALETTE.brass}, inset 0 2px 0 rgba(255,220,150,0.4)`,
            }}
          />
          <div className="relative h-full w-full overflow-hidden rounded-[12px]" style={{ boxShadow: "inset 0 0 24px rgba(0,0,0,0.35)" }}>
            <Board />
          </div>
        </div>
      </div>

      <HudCanvas layout={layout}>
        <HudPanel id="Parlor" anchor="top-left" compact="chip" chip="Info" interactive={false}>
          <Title />
        </HudPanel>
        <HudPanel id="Bank" anchor="top-right" compact="keep" interactive={false}>
          <StatReadout snap={snap} />
        </HudPanel>
        <HudPanel id="Wins" anchor="left" compact="chip" chip="Wins" interactive={false}>
          <WinsFeed snap={snap} />
        </HudPanel>
        <HudPanel id="Launch" anchor="bottom" compact="keep">
          <PowerControls snap={snap} />
        </HudPanel>
      </HudCanvas>

      {snap.feverActive && <FeverBanner snap={snap} />}
      {snap.broke && <BrokeScreen snap={snap} />}
    </div>
  );
}
