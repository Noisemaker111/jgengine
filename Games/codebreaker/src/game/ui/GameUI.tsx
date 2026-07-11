import { useEffect, useState } from "react";

import { useDisplayProfile } from "@jgengine/react/display";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useGame } from "@jgengine/react/hooks";
import { SettingsTrigger } from "@jgengine/react";

import { modeKey } from "../codebreaker";
import { shareUrl } from "../seedShare";
import { Board } from "./components/Board";
import { Controls } from "./components/Controls";
import { RecordsPanel, ResultBanner, TitleCard } from "./components/Panels";
import { CREDIT, DECK_STYLE, GAME_CSS, TABLE_FELT } from "./theme";
import { useApp } from "./useApp";

export function GameUI() {
  const app = useApp();
  const { commands } = useGame();
  const { compact } = useDisplayProfile();
  const layout = useHudLayout({ storageKey: "codebreaker:hud" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  if (app === undefined) return null;

  const round = app.round;
  const pegSize = compact ? 20 : 26;
  const run = (name: string) => {
    commands.run(name, {});
  };
  const copyLink = () => {
    const link = shareUrl(round.seed, round.options);
    void navigator.clipboard
      ?.writeText(link)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <>
      <style>{GAME_CSS}</style>
      <div aria-hidden style={{ position: "absolute", inset: 0, ...TABLE_FELT }} />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-auto p-2 sm:p-4">
        <div className="pointer-events-auto flex flex-col items-center gap-3">
          <div className="rounded-2xl p-3 sm:p-4" style={DECK_STYLE}>
            <Board round={round} pegSize={pegSize} />
          </div>
          <Controls round={round} run={run} onCopy={copyLink} copied={copied} pegSize={pegSize} />
        </div>
      </div>

      <HudCanvas layout={layout} className="select-none text-amber-50">
        <HudPanel id="title" anchor="top-left" compact="hide" interactive={false}>
          <TitleCard />
        </HudPanel>

        <HudPanel id="settings" anchor="top-right" order={-1} compact="hide">
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/15 bg-[#241a12]/85 text-amber-100 shadow-lg backdrop-blur transition hover:bg-amber-100/20" />
        </HudPanel>

        <HudPanel id="records" anchor="top-right" compact="chip" chip="Records" interactive={false}>
          <RecordsPanel records={app.records} mode={modeKey(round.options)} />
        </HudPanel>

        {app.result !== null && (
          <HudPanel id="result" anchor="top" order={0} compact="keep">
            <ResultBanner result={app.result} onAgain={() => run("newGame")} />
          </HudPanel>
        )}

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
          <p className="rounded-full bg-black/50 px-3 py-1 text-center text-[11px] text-amber-100/70 ring-1 ring-amber-200/10">
            {CREDIT}
          </p>
        </HudPanel>
      </HudCanvas>
    </>
  );
}
