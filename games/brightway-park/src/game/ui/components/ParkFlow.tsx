import { useRef } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitResultScreen } from "@jgengine/react/kitFlow";

import { park } from "../../park";
import { scenarioView } from "../../parkReset";
import { scenarioDef } from "../../scenarios";
import { session } from "../../session";
import { parkFlags, usePark } from "../usePark";

/** A result screen is up: the scenario ended, the park went bankrupt, or the blue ribbon landed. */
export function resultOpen(ctx: GameContext): boolean {
  const flags = parkFlags(park.of(ctx));
  return session.started && (flags.gameOver || flags.ribbon || scenarioView(ctx)?.result != null);
}
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

/** The park's moments: a banner when the gates open or close, and the end-of-run screens. Read from the world. */
export function ParkFlow() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const w = usePark(), flags = parkFlags(w);
  const started = useGameStore(() => session.started);
  const guests = useGameStore(() => session.guests.size);
  const scenario = scenarioView(ctx), id = w.fact("scenario.id"), def = typeof id === "string" ? scenarioDef(id) : null;
  const scenarioWon = scenario?.result === "won", reward = def?.mission.rewards?.economy?.cash ?? 0;
  const open = w.fact("park.open") === true, day = w.num("park.day"), cash = w.num("park.cash"), rating = w.num("park.rating");
  // The night after closing still belongs to that day: the banner must not re-fire at midnight.
  const openDay = useRef(day);
  if (open) openDay.current = day;
  const tally = [{ label: "Park funds", value: money(cash) }, { label: "Rating", value: `★ ${Math.round(rating)}` }, { label: "Guests in the park", value: guests }];
  return <>
    <KitBanner cue={started && !resultOpen(ctx) ? `${open}-${openDay.current}` : null} initial title={`Day ${openDay.current} · Gates ${open ? "open" : "closed"}`}
      subtitle={!open ? `Takings ${money(w.num("park.revenue_today"))}` : scenario?.title ?? (day > 1 ? `Yesterday ${money(w.num("park.revenue_yesterday") - w.num("park.upkeep_yesterday"))} net` : "Welcome to Brightway")} />
    <KitResultScreen open={started && scenario?.result != null} tone={scenarioWon ? "good" : "bad"} eyebrow={scenario?.title} title={scenarioWon ? "Scenario won!" : "Scenario failed"}
      summary={scenarioWon ? `You hit the target with the park still standing${reward > 0 ? `: ${money(reward)} is in the till` : ""}.` : scenario?.reason ?? "The target slipped away."}
      stats={[{ label: "Takings", value: money(scenario?.revenue ?? 0) }, { label: "Visitors", value: scenario?.visitors ?? 0 }, ...tally.slice(0, 2)]}
      actions={[{ id: "replay", label: "Play it again", primary: true }, { id: "free", label: "Keep this park" }]} onAction={(action) => commands.run(action === "replay" ? "park.replay" : "park.freeplay", {})} />
    <KitResultScreen open={started && flags.gameOver} tone="bad" eyebrow="The lights go down" title="Park bankrupt"
      summary={`Three days in debt closed the gates after ${day - 1} days. Next time watch the nightly bills, the loan and give guests food and drink.`}
      stats={tally.slice(0, 2)} actions={[{ id: "new", label: "Open a new park" }]} onAction={() => commands.run("park.new", {})} />
    <KitResultScreen open={started && flags.ribbon && !flags.gameOver} tone="good" eyebrow="Bright days ahead" title="Blue ribbon!"
      summary="Three rides, a profitable day and a happy, tidy park: Brightway is a seaside favourite. Your park is saved." stats={tally}
      actions={[{ id: "continue", label: "Keep building" }]} onAction={() => commands.run("park.continue", {})} />
  </>;
}
