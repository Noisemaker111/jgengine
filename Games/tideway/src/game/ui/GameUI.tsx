import { GateToasts } from "./components/GateToasts";
import { KnotsMeter } from "./components/KnotsMeter";
import { ResultsScreen } from "./components/ResultsScreen";
import { StartScreen } from "./components/StartScreen";
import { StatusPanel } from "./components/StatusPanel";
import { SwingBanner } from "./components/SwingBanner";
import { TidewayMinimap } from "./components/TidewayMinimap";
import { useCurrentField, useHud, useResults } from "./store";

export function GameUI() {
  const hud = useHud();
  const current = useCurrentField();
  const results = useResults();

  if (hud === undefined || current === undefined) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-sm border border-[#f2c14e]/25 bg-[#0e2a30]/75 px-4 py-3">
          <StatusPanel hud={hud} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto">
            <TidewayMinimap current={current} />
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-1.5">
            <GateToasts />
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center pt-2">
        {hud.status === "racing" ? <SwingBanner current={current} /> : null}
      </div>

      <div className="flex justify-center pb-1">
        {hud.status === "racing" ? (
          <div className="pointer-events-auto">
            <KnotsMeter hud={hud} />
          </div>
        ) : null}
      </div>

      {hud.status === "start" ? (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0e2a30]/85 px-4">
          <StartScreen />
        </div>
      ) : null}
      {hud.status === "finished" && results !== undefined ? (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0e2a30]/88 px-4">
          <ResultsScreen results={results} />
        </div>
      ) : null}
    </div>
  );
}
