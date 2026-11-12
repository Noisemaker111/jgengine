/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useRef, useState } from "@jgengine/core/ui/jsx";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { parkDateLabel } from "../books";
import { park } from "../park";
import { scenarioView } from "../parkReset";
import { scenarioDef } from "../scenarios";
import { session } from "../session";
import { guestPopulation } from "../sim/guests";
import { parkFlags } from "./parkFlags";
import { money } from "./ParkDashboard";
import { BAD, Button, CORAL, CREAM, DISPLAY, GOLD, GOOD, Heading, INK, Row, Tag, Text } from "./look";

/** A result screen is up: the scenario ended, the park went bankrupt, or the blue ribbon landed. */
export function resultOpen(ctx: GameContext): boolean {
  const flags = parkFlags(park.of(ctx));
  return session.started && (flags.gameOver || flags.ribbon || scenarioView(ctx)?.result != null);
}

const BANNER_MS = 3600;

/** The park's moments: a banner when the gates open or close, and the end-of-run screens. Read from the world. */
export function ParkFlow() {
  const { commands } = useGame();
  // Only what the banner and the result screens draw: the tally is read while a screen is up, not every tick.
  const v = useGameStore((ctx) => {
    const w = park.of(ctx), flags = parkFlags(w), scenario = scenarioView(ctx);
    const id = w.fact("scenario.id"), def = typeof id === "string" ? scenarioDef(id) : null;
    const open = w.fact("park.open") === true;
    const screen = session.started && (flags.gameOver || flags.ribbon || scenario?.result != null);
    return {
      started: session.started, gameOver: flags.gameOver, ribbon: flags.ribbon, gate: w.fact("park.gate") === true, open, day: w.num("park.day"),
      result: scenario?.result ?? null, title: scenario?.title ?? null, reason: scenario?.reason ?? null, hasScenario: scenario !== null,
      reward: def?.mission.rewards?.economy?.["cash"] ?? 0,
      takings: open ? 0 : w.num("park.revenue_today"), yesterday: w.num("park.revenue_yesterday") - w.num("park.upkeep_yesterday"),
      cash: screen ? w.num("park.cash") : 0, rating: screen ? Math.round(w.num("park.rating")) : 0, guests: screen ? guestPopulation(ctx).onSite() : 0,
      revenue: screen ? scenario?.revenue ?? 0 : 0, visitors: screen ? scenario?.visitors ?? 0 : 0, screen,
    };
  });
  // The night after closing still belongs to that day: the banner must not re-fire at midnight.
  const openDay = useRef(v.day);
  if (v.open) openDay.current = v.day;
  const cue = v.started && !v.screen ? `${v.open}-${openDay.current}` : null;
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    if (cue === null) { setBanner(null); return undefined; }
    setBanner(cue);
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [cue]);
  const tally: [string, string][] = [["Park funds", money(v.cash)], ["Rating", `★ ${v.rating}`], ["Guests in the park", String(v.guests)]];
  const won = v.result === "won";
  const subtitle = !v.gate ? "Build a ride, then open the gate" : !v.open ? `Takings ${money(v.takings)}` : v.title ?? (v.day > 1 ? `Yesterday ${money(v.yesterday)} net` : "Welcome to Brightway");
  return <>
    {banner === null ? null : <RuneView anchor="top" safe inset={0} padding={[150, 0, 0, 0]} responsive={{ phone: { padding: [300, 0, 0, 0] } }}>
      <RuneView fill={INK} radius={4} padding={[10, 26, 10, 26]} gap={2} items="center" border={{ width: 3, color: GOLD }} label="Gate banner">
        <Text family={DISPLAY} size={26} color={CREAM} align="center">{`${parkDateLabel(openDay.current)} · Gates ${v.open ? "open" : "closed"}`}</Text>
        <Text color={GOLD} weight={700} align="center">{subtitle}</Text>
      </RuneView>
    </RuneView>}
    {!v.started ? null : v.result != null ? <Result tone={won ? "good" : "bad"} eyebrow={v.title ?? ""} title={won ? "Scenario won!" : "Scenario failed"}
      summary={won ? `You hit the target with the park still standing${v.reward > 0 ? `: ${money(v.reward)} is in the till` : ""}.` : v.reason ?? "The target slipped away."}
      stats={[["Takings", money(v.revenue)], ["Visitors", String(v.visitors)], ...tally.slice(0, 2)]}
      actions={[["Play it again", () => commands.run("park.replay", {}), true], ["Keep this park", () => commands.run("park.freeplay", {}), false]]} />
      : v.gameOver ? <Result tone="bad" eyebrow="The lights go down" title="Park bankrupt"
        summary={`Two months in a row ended in the red, and the bank closed the gates after ${v.day - 1} days. Next time watch the monthly books, borrow before the month ends, and give guests food and drink.`}
        stats={tally.slice(0, 2)} actions={[["Open a new park", () => commands.run("park.new", {}), true]]} />
      : v.ribbon ? <Result tone="good" eyebrow="Bright days ahead" title="Blue ribbon!"
        summary="Three rides, a profitable day and a happy, tidy park: Brightway is a seaside favourite. Your park is saved." stats={tally}
        actions={[["Keep building", () => commands.run("park.continue", {}), true]]} /> : null}
  </>;
}

function Result({ tone, eyebrow, title, summary, stats, actions }: { tone: "good" | "bad"; eyebrow: string; title: string; summary: string; stats: [string, string][]; actions: [string, () => void, boolean][] }) {
  const { width } = useRuneViewport();
  return <RuneView anchor="fill" fill="#14323899" modal justify="center" items="center" role="dialog" label={title}>
    <RuneView variant="card" width={Math.min(520, width - 32)} padding={24} gap={12} border={{ width: 3, color: tone === "good" ? GOOD : CORAL }}>
      <Tag color={tone === "good" ? GOOD : BAD}>{eyebrow.toUpperCase()}</Tag>
      <Heading size={34}>{title}</Heading>
      <Text>{summary}</Text>
      <RuneView layout="grid" columns={2} gap={8}>{stats.map(([label, value]) => <RuneView key={label} gap={1}><Tag>{label.toUpperCase()}</Tag><Text family={DISPLAY} size={22}>{value}</Text></RuneView>)}</RuneView>
      <Row gap={8}>{actions.map(([label, run, primary]) => <Button key={label} tone={primary ? "primary" : "ticket"} onPress={run}>{label}</Button>)}</Row>
    </RuneView>
  </RuneView>;
}
