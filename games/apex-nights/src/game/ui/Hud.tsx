import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { idea } from "../idea";
import { raceView } from "../race";
import { Count, Counts, HudFrame } from "./HudFrame";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const useRace = () => useGameStore(raceView, same);
const ordinal = (place: number) => `${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

function Wallet(): ReactNode {
  const race = useRace();
  return (
    <KitPanel variant="strip">
      <Counts>
        <Count id="cash" value={race.cash} label={idea.currency.label} />
        <Count id="wins" value={race.wins} label="wins" />
      </Counts>
    </KitPanel>
  );
}

/** Between races: the next race. */
function NextRace(): ReactNode {
  const ctx = useGameContext();
  const race = useRace();
  return (
    <div style={{ width: 290 }}>
      <KitPanel variant="hud" eyebrow={`Race ${race.nextIndex + 1} of ${idea.races.length}`} title={race.next.title}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <span>
            <strong>{idea.guide.name}:</strong> {race.allDone ? "Every race on the board is won. Race them again for money." : race.next.pitch}
          </span>
          <span style={{ opacity: 0.75, fontSize: 12 }}>
            {race.next.laps} laps - {race.next.rivals} rivals - pays {race.next.pay}
          </span>
          <KitButton size="sm" variant="primary" glyph="Enter" onClick={() => ctx.game.commands.run("race", {})}>
            Start race
          </KitButton>
        </div>
      </KitPanel>
    </div>
  );
}

/** Between races: the car's upgrades. */
function Garage(): ReactNode {
  const ctx = useGameContext();
  const race = useRace();
  return (
    <div style={{ width: 260 }}>
      <KitPanel variant="hud" eyebrow="Garage">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {race.upgrades.map((upgrade, index) => {
            const maxed = upgrade.stage > upgrade.levels;
            return (
              <div key={upgrade.id} data-upgrade={upgrade.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <KitMeter size="sm" label={`${upgrade.label} ${upgrade.stage}`} value={upgrade.stage - 1} max={upgrade.levels} variant="segments" segments={upgrade.levels} tone="accent" />
                <KitButton size="sm" variant={maxed || race.cash < upgrade.price ? "ghost" : "secondary"} glyph={String(index + 1)} onClick={() => ctx.game.commands.run(`buy${index + 1}`, {})}>
                  {maxed ? "Max" : `${upgrade.price}`}
                </KitButton>
              </div>
            );
          })}
        </div>
      </KitPanel>
    </div>
  );
}

/** While racing: place and lap. */
function Standing(): ReactNode {
  const race = useRace();
  return (
    <KitPanel variant="hud" eyebrow={race.result?.title ?? race.next.title}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <span data-position="" style={{ fontSize: 30, fontWeight: 900, lineHeight: 1 }}>
          {ordinal(race.position)}
          <span style={{ fontSize: 12, opacity: 0.7 }}> / {race.field}</span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
          <span data-lap="" style={{ fontWeight: 800 }}>
            Lap {race.lap} / {race.laps}
          </span>
          <span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{clock(race.time)}</span>
          {race.assist ? <span style={{ opacity: 0.6, fontSize: 10 }}>ASSIST</span> : null}
        </span>
      </div>
    </KitPanel>
  );
}

/** While racing: speed and nitro. */
function Speedo(): ReactNode {
  const race = useRace();
  return (
    <div style={{ width: 170 }}>
      <KitPanel variant="hud">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span data-speed="" style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
            {race.speed}
            <span style={{ fontSize: 12, opacity: 0.7 }}> km/h</span>
          </span>
          <KitMeter size="sm" label="Nitro" value={Math.round(race.nitro * 100)} max={100} tone={race.nitro > 0.25 ? "accent" : "warn"} />
        </div>
      </KitPanel>
    </div>
  );
}

function Countdown(): ReactNode {
  const race = useRace();
  return <KitBanner cue={race.phase === "countdown" ? race.countdown : race.phase === "racing" ? "go" : null} title={race.phase === "countdown" ? String(race.countdown) : "Go!"} tone="accent" />;
}

function Result(): ReactNode {
  const ctx = useGameContext();
  const race = useRace();
  const result = race.result;
  return (
    <KitResultScreen
      open={race.phase === "finished" && result !== null}
      tone={result !== null && result.place <= 3 ? "good" : "bad"}
      eyebrow={result?.title ?? ""}
      title={result === null ? "" : result.place === 1 ? "You won!" : result.place <= 3 ? `${ordinal(result.place)} place` : `${ordinal(result.place)} - off the podium`}
      summary={result === null ? "" : result.pay > 0 ? `+${result.pay} ${idea.currency.label.toLowerCase()} for the garage.` : "Top three get paid. Tune the car and try again."}
      stats={result === null ? [] : [
        { label: "Place", value: ordinal(result.place) },
        { label: "Time", value: clock(result.time) },
        { label: "Paid", value: result.pay },
      ]}
      actions={[{ id: "garage", label: "Back to the garage", primary: true }]}
      onAction={() => ctx.game.commands.run("garage", {})}
    />
  );
}

/** In the garage: the next race and the upgrades; on track: place, lap and speed. */
export function Hud(): ReactNode {
  const garage = useGameStore((ctx) => raceView(ctx).phase === "garage");
  return (
    <HudFrame
      slots={garage ? { topRight: <Wallet />, bottomLeft: <NextRace />, bottomRight: <Garage /> } : { topLeft: <Standing />, topRight: <Wallet />, top: <Countdown />, bottomRight: <Speedo /> }}
      overlay={<Result />}
    />
  );
}
