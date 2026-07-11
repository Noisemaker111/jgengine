import { HudCanvas, HudPanel, useEngineState, useHudLayout } from "@jgengine/react";
import { PALETTE } from "../palette";
import { pinballStore } from "../store";
import { Backglass } from "./components/backglass";
import { GameOverScreen, MessageBanner, PlungePrompt, SaverBadge, TiltBanner } from "./components/overlays";
import { ControlBar, ScoreFeed, StatusReadout, Title } from "./components/panels";
import { Table } from "./Table";

const cabinetBg: React.CSSProperties = {
  background: `radial-gradient(130% 90% at 50% -10%, ${PALETTE.cabinetLight} 0%, ${PALETTE.cabinet} 42%, ${PALETTE.cabinetDark} 100%)`,
};

const frameStyle: React.CSSProperties = {
  background: `linear-gradient(158deg, ${PALETTE.orangeLight}, ${PALETTE.orangeDark} 42%, ${PALETTE.cabinetDark})`,
  boxShadow: `0 20px 54px rgba(0,0,0,0.6), inset 0 0 0 3px ${PALETTE.brass}, inset 0 2px 0 rgba(255,220,150,0.4)`,
};

export function GameUI() {
  const snap = useEngineState(pinballStore);
  const layout = useHudLayout({ storageKey: "pinball", snap: 8 });

  return (
    <div className="relative h-full w-full overflow-hidden" style={cabinetBg}>
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <div className="relative h-full" style={{ aspectRatio: "216 / 384", maxWidth: "100%" }}>
          <div className="absolute -inset-2 rounded-[22px]" style={frameStyle} />
          <div className="relative h-full w-full overflow-hidden rounded-[14px]" style={{ boxShadow: "inset 0 0 26px rgba(0,0,0,0.4)" }}>
            <Table />
          </div>
        </div>
      </div>

      <HudCanvas layout={layout}>
        <HudPanel id="Title" anchor="top-left" compact="chip" chip="Info" interactive={false}>
          <Title />
        </HudPanel>
        <HudPanel id="Backglass" anchor="top-right" compact="keep" interactive={false}>
          <Backglass snap={snap} />
        </HudPanel>
        <HudPanel id="Table" anchor="left" compact="chip" chip="Table" interactive={false}>
          <StatusReadout snap={snap} />
        </HudPanel>
        <HudPanel id="Scoring" anchor="right" compact="chip" chip="Score" interactive={false}>
          <ScoreFeed snap={snap} />
        </HudPanel>
        <HudPanel id="Controls" anchor="bottom" compact="keep" interactive={false}>
          <ControlBar snap={snap} />
        </HudPanel>
      </HudCanvas>

      <MessageBanner snap={snap} />
      <SaverBadge snap={snap} />
      <PlungePrompt snap={snap} />
      <TiltBanner snap={snap} />
      <GameOverScreen snap={snap} />
    </div>
  );
}
