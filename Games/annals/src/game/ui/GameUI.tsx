import { useGameClock, useGameStore } from "@jgengine/react/hooks";

import { dateLabel, seasonOf } from "../calendar";
import { monarch } from "../people";
import { totalPopulation } from "../sim";
import { ChroniclePanel } from "./components/ChroniclePanel";

const GAME_NAME = "The Annals";

export function GameUI() {
  const { paused, playSpeed, speeds, calendar, controls } = useGameClock();
  const ruler = useGameStore(() => monarch());
  const population = useGameStore(() => totalPopulation());

  return (
    <div className="pointer-events-none absolute inset-0 font-serif text-amber-50">
      <div className="pointer-events-auto absolute left-4 top-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200/20 bg-stone-950/70 px-4 py-2 shadow-lg backdrop-blur-sm">
        <span className="text-lg tracking-wide text-amber-200">{GAME_NAME}</span>
        <span className="h-4 w-px bg-amber-200/30" />
        <span className="tabular-nums text-sm text-amber-100/90">
          {dateLabel(calendar.day)} · {seasonOf(calendar.day)}
        </span>
        <span className="h-4 w-px bg-amber-200/30" />
        <span className="text-sm text-amber-100/80">Realm {population.toLocaleString()}</span>
        <span className="h-4 w-px bg-amber-200/30" />
        <span className="text-sm text-amber-100/80">
          {ruler !== undefined ? `${ruler.name}, ${ruler.epithet}` : "The throne stands empty"}
        </span>
        <button
          type="button"
          onClick={() => controls.toggle()}
          className="rounded border border-amber-200/30 px-2 py-0.5 text-xs text-amber-100/80 hover:bg-amber-200/10"
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <div className="flex gap-1">
          {speeds.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => controls.setSpeed(speed)}
              className={`rounded border px-1.5 py-0.5 text-xs ${
                !paused && speed === playSpeed
                  ? "border-amber-300 bg-amber-300/20 text-amber-100"
                  : "border-amber-200/20 text-amber-100/60 hover:bg-amber-200/10"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
      <ChroniclePanel />
    </div>
  );
}
