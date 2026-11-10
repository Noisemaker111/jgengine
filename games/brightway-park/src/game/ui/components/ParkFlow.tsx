/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { KitBanner, KitResultScreen } from "@jgengine/core/ui/kit/kitFlow.view";

import { parkDateLabel } from "../../books";
import { park } from "../../park";
import { scenarioView } from "../../parkReset";
import { scenarioDef } from "../../scenarios";
import { session } from "../../session";
import { parkFlags } from "../parkFlags";

/** A result screen is up: the scenario ended, the park went bankrupt, or the blue ribbon landed. */
export function resultOpen(ctx: GameContext): boolean {
  const flags = parkFlags(park.of(ctx));
  return session.started && (flags.gameOver || flags.ribbon || scenarioView(ctx)?.result != null);
}
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

/** The park's moments: a banner when the gates open or close, and the end-of-run screens. Read from the world. */
export function ParkFlow() {
  const { commands } = useGame();
  const started = useGameStore(() => session.started);
  // Only what the banner and the result screens draw: the tally is read while a screen is up, not every tick.
  const v = useGameStore((ctx) => {
    const w = park.of(ctx), flags = parkFlags(w), scenario = scenarioView(ctx);
    const id = w.fact("scenario.id"), def = typeof id === "string" ? scenarioDef(id) : null;
    const open = w.fact("park.open") === true;
    const screen = session.started && (flags.gameOver || flags.ribbon || scenario?.result != null);
    return {
      gameOver: flags.gameOver, ribbon: flags.ribbon, gate: w.fact("park.gate") === true, open, day: w.num("park.day"),
      result: scenario?.result ?? null, title: scenario?.title, reason: scenario?.reason ?? null, hasScenario: scenario !== null,
      reward: def?.mission.rewards?.economy?.["cash"] ?? 0,
      takings: open ? 0 : w.num("park.revenue_today"), yesterday: w.num("park.revenue_yesterday") - w.num("park.upkeep_yesterday"),
      cash: screen ? w.num("park.cash") : 0, rating: screen ? Math.round(w.num("park.rating")) : 0, guests: screen ? session.guests.size : 0,
      revenue: screen ? scenario?.revenue ?? 0 : 0, visitors: screen ? scenario?.visitors ?? 0 : 0, screen,
    };
  });
  const flags = { gameOver: v.gameOver, ribbon: v.ribbon };
  const scenarioWon = v.result === "won", reward = v.reward;
  const { gate, open, day, cash, rating, guests } = v;
  const scenario = v.hasScenario ? { title: v.title, result: v.result, reason: v.reason, revenue: v.revenue, visitors: v.visitors } : null;
  // The night after closing still belongs to that day: the banner must not re-fire at midnight.
  const openDay = useRef(day);
  if (open) openDay.current = day;
  const tally = [{ label: "Park funds", value: money(cash) }, { label: "Rating", value: `★ ${rating}` }, { label: "Guests in the park", value: guests }];
  return <>
    <KitBanner cue={started && !v.screen ? `${open}-${openDay.current}` : null} initial title={`${parkDateLabel(openDay.current)} · Gates ${open ? "open" : "closed"}`}
      subtitle={!gate ? "Build a ride, then open the gate" : !open ? `Takings ${money(v.takings)}` : scenario?.title ?? (day > 1 ? `Yesterday ${money(v.yesterday)} net` : "Welcome to Brightway")} />
    <KitResultScreen open={started && scenario?.result != null} tone={scenarioWon ? "good" : "bad"} eyebrow={scenario?.title} title={scenarioWon ? "Scenario won!" : "Scenario failed"}
      summary={scenarioWon ? `You hit the target with the park still standing${reward > 0 ? `: ${money(reward)} is in the till` : ""}.` : scenario?.reason ?? "The target slipped away."}
      stats={[{ label: "Takings", value: money(scenario?.revenue ?? 0) }, { label: "Visitors", value: scenario?.visitors ?? 0 }, ...tally.slice(0, 2)]}
      actions={[{ id: "replay", label: "Play it again", primary: true }, { id: "free", label: "Keep this park" }]} onAction={(action) => commands.run(action === "replay" ? "park.replay" : "park.freeplay", {})} />
    <KitResultScreen open={started && flags.gameOver} tone="bad" eyebrow="The lights go down" title="Park bankrupt"
      summary={`Two months in a row ended in the red, and the bank closed the gates after ${day - 1} days. Next time watch the monthly books, borrow before the month ends, and give guests food and drink.`}
      stats={tally.slice(0, 2)} actions={[{ id: "new", label: "Open a new park" }]} onAction={() => commands.run("park.new", {})} />
    <KitResultScreen open={started && flags.ribbon && !flags.gameOver} tone="good" eyebrow="Bright days ahead" title="Blue ribbon!"
      summary="Three rides, a profitable day and a happy, tidy park: Brightway is a seaside favourite. Your park is saved." stats={tally}
      actions={[{ id: "continue", label: "Keep building" }]} onAction={() => commands.run("park.continue", {})} />
  </>;
}
