import { Fragment } from "react";
import { ResultsScreen } from "@/components/ui/results-screen";

import { WATER_MAX } from "../../caravan/water";
import type { RunState } from "../../run/runState";

function formatMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function EndOverlay({ state, onRestart }: { state: RunState; onRestart: () => void }) {
  const won = state.phase === "won";
  const time = state.finishSeconds ?? state.elapsed;
  const waterMargin = state.finishWaterFraction !== null ? Math.round(state.finishWaterFraction * WATER_MAX) : Math.round(state.water);

  const title = won ? "Meridaan" : state.reason === "rival" ? "Outpaced" : "Stranded";
  const subline = won
    ? "Meridaan's gates remember the caravans that reach them."
    : state.reason === "rival"
      ? "The wind favored another skin today."
      : "Every dune remembers a caravan that did not.";

  return (
    <Fragment>
      <ResultsScreen
        outcome={won ? "victory" : "defeat"}
        title={title}
        lines={[
          { label: "Time", value: formatMinutes(time), accent: won },
          { label: won ? "Water Margin" : "Water Left", value: `${waterMargin} / ${WATER_MAX}` },
          { label: "Oases Visited", value: state.oasesVisited.length },
        ]}
        entries={[{ id: "restart", label: "Ride Again", keybind: "R" }]}
        selectedId="restart"
        onActivate={onRestart}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <span className="text-[11px] italic" style={{ color: "var(--jg-text-dim)" }}>
          {subline}
        </span>
      </div>
    </Fragment>
  );
}
