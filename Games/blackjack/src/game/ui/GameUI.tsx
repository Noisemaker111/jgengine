import { useDisplayProfile } from "@jgengine/react/display";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import type { TableState } from "../state/machine";
import type { CardSize } from "./components/Card";
import { Dock, type Run } from "./components/Dock";
import { BankPanel, HistoryPanel, ShoePanel } from "./components/Panels";
import { DealerArea, PlayerArea } from "./components/Table";

function TableInscription() {
  return (
    <div className="pointer-events-none text-center text-[11px] font-semibold uppercase leading-relaxed tracking-[0.16em] text-amber-200/35">
      Blackjack pays 3 to 2 · Insurance pays 2 to 1
      <br />
      Dealer must stand on 17 and draw to 16
    </div>
  );
}

function CenterBanner({ state }: { state: TableState }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {state.message !== null ? (
        <span className="rounded-full bg-black/40 px-4 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/30">
          {state.message}
        </span>
      ) : null}
      <TableInscription />
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "blackjack-hud" });
  const { compact } = useDisplayProfile();
  const { commands } = useGame();
  const state = useGameStore((ctx) => ctx.game.store.get("bj") as TableState | undefined);

  if (state === undefined) return null;
  const size: CardSize = compact ? "sm" : "md";
  const run: Run = (name, input) => {
    commands.run(name, input);
  };

  return (
    <HudCanvas layout={layout} className="h-full w-full select-none overflow-hidden text-emerald-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_36%,#1f7a52_0%,#125537_46%,#082a1e_100%)]" />
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 px-3 pt-4"
        style={{ paddingBottom: compact ? 232 : 190 }}
      >
        <DealerArea dealer={state.dealer} holeShown={state.dealerHoleShown} size={size} />
        <CenterBanner state={state} />
        <PlayerArea hands={state.hands} activeHand={state.activeHand} phase={state.phase} size={size} />
      </div>

      <HudPanel id="bank" anchor="top-left" compact="keep">
        <BankPanel state={state} />
      </HudPanel>
      <HudPanel id="shoe" anchor="top-right" compact="keep">
        <ShoePanel state={state} />
      </HudPanel>
      <HudPanel id="history" anchor="right" compact="chip" chip="History">
        <HistoryPanel state={state} />
      </HudPanel>
      <HudPanel id="dock" anchor="bottom" compact="keep" interactive>
        <Dock state={state} run={run} />
      </HudPanel>
    </HudCanvas>
  );
}
