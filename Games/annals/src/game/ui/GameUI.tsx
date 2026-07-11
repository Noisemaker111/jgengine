import { useState } from "react";

import { useGameClock, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";

import { dateLabel, seasonOf } from "../calendar";
import { monarch } from "../people";
import { totalPopulation } from "../sim";
import { ChroniclePanel } from "./components/ChroniclePanel";

const GAME_NAME = "The Annals";

function Credit() {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href="https://x.com/emollick"
      target="_blank"
      rel="noreferrer"
      className="pointer-events-auto absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-amber-200/20 bg-stone-950/70 px-3 py-1.5 text-amber-100/80 shadow-lg backdrop-blur-sm transition hover:bg-amber-200/10"
    >
      {failed ? (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-200/20 text-[0.6rem] font-semibold text-amber-100">
          EM
        </span>
      ) : (
        <img
          src="https://unavatar.io/x/emollick"
          alt="Ethan Mollick"
          width={24}
          height={24}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-6 w-6 rounded-full object-cover ring-1 ring-amber-200/30"
        />
      )}
      <span className="text-xs">
        From a prompt by <span className="text-amber-200">Ethan Mollick</span>
      </span>
    </a>
  );
}

export function GameUI() {
  const { paused, playSpeed, speeds, calendar, controls } = useGameClock();
  const ruler = useGameStore(() => monarch());
  const population = useGameStore(() => totalPopulation());
  const layout = useHudLayout({ storageKey: "annals" });

  return (
    <HudCanvas layout={layout} className="font-serif text-amber-50">
      <HudPanel
        id="status-bar"
        anchor="top-left"
        inset={{ x: 16, y: 16 }}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200/20 bg-stone-950/70 px-4 py-2 shadow-lg backdrop-blur-sm"
      >
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
        <span className="h-4 w-px bg-amber-200/30" />
        <SettingsTrigger className="flex h-6 w-6 items-center justify-center rounded border border-amber-200/30 text-amber-100/80 hover:bg-amber-200/10" />
      </HudPanel>
      <Credit />
      <ChroniclePanel />
    </HudCanvas>
  );
}
