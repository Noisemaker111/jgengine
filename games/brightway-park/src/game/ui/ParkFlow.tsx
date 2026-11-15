/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useRef, useState } from "@jgengine/core/ui/jsx";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { isFullMoon, parkDateLabel } from "../books";
import { park } from "../park";
import { scenarioView } from "../parkReset";
import { scenarioDef } from "../scenarios";
import { session } from "../session";
import { parkFlags } from "./parkFlags";
import { money } from "./ParkDashboard";
import { BAD, Button, CORAL, CREAM, DISPLAY, GOLD, GOOD, Heading, INK, Row, SHADE, Tag, Text } from "./look";

/** A result screen is up: the scenario ended, the haunt faded, or the ghost paradise landed. */
export function resultOpen(ctx: GameContext): boolean {
  const flags = parkFlags(park.of(ctx));
  return session.started && (flags.gameOver || flags.ribbon || scenarioView(ctx)?.result != null);
}

const BANNER_MS = 3600;

/** The haunt's moments: a banner at dusk and at dawn, and the end-of-run screens. Read from the world. */
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
      cash: screen ? w.num("park.cash") : 0, rating: screen ? Math.round(w.num("park.rating")) : 0, guests: screen ? session.guests.size : 0,
      screams: screen ? w.num("park.screams") : 0, ghosts: screen ? w.num("park.ghosts") : 0, screamsToday: w.num("park.screams_today"),
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
  const tally: [string, string][] = [["Ectoplasm", money(v.cash)], ["Rumor", String(v.rating)], ["Screamed out", String(v.screams)], ["Ghosts at home", String(v.ghosts)]];
  const won = v.result === "won";
  const festival = v.title === "Full Moon Festival";
  const subtitle = !v.gate ? "Build a ride, then unchain the gate" : !v.open ? `${v.screamsToday} fled screaming · ${money(v.takings)} harvested` : v.title ?? (v.day > 1 ? `Last night ${money(v.yesterday)} net` : "The living are coming");
  return <>
    {banner === null ? null : <RuneView anchor="top" safe inset={0} padding={[150, 0, 0, 0]} responsive={{ phone: { padding: [300, 0, 0, 0] } }}>
      <RuneView fill={INK} radius={4} padding={[10, 26, 10, 26]} gap={2} items="center" border={{ width: 3, color: GOLD }} label="Gate banner">
        <Text family={DISPLAY} size={26} color={CREAM} align="center">{`${parkDateLabel(openDay.current)} · ${v.open ? "Dusk falls" : "Dawn breaks"}`}</Text>
        <Text color={GOLD} weight={700} align="center">{v.open && isFullMoon(openDay.current) ? "Full moon tonight: the living come in droves and every scare is worth more" : subtitle}</Text>
      </RuneView>
    </RuneView>}
    {!v.started ? null : v.result != null ? <Result tone={won ? "good" : "bad"} eyebrow={v.title ?? ""} title={won ? festival ? "The Full Moon Festival" : "The night is yours" : "The haunt falls quiet"}
      summary={won ? festival
        ? `Under the last full moon of the season every ghost on the coast came home to your pier: the carousel turns for the Victorian Child, the Banshee has her crowd, the Keeper's lanterns burn along every path. The living will be telling this story for a hundred years${v.reward > 0 ? `, and ${money(v.reward)} is in the vault` : ""}.`
        : `You hit every target with the haunt still standing${v.reward > 0 ? `: ${money(v.reward)} is in the vault` : ""}.` : v.reason ?? "The target slipped away."}
      stats={[["Harvested", money(v.revenue)], ["The living", String(v.visitors)], ...tally.slice(2, 4)]}
      actions={[["Haunt it again", () => commands.run("park.replay", {}), true], ["Keep this haunt", () => commands.run("park.freeplay", {}), false]]} />
      : v.gameOver ? <Result tone="bad" eyebrow="The lanterns gutter out" title="The haunt has faded"
        summary={`Two moons in a row ended with the vault dry, and after ${v.day - 1} nights the park was only a park again. Next time watch the moon's ledger, borrow from the Ferryman before the moon closes, and keep the living fed and frightened.`}
        stats={tally.slice(0, 2)} actions={[["Wake a new haunt", () => commands.run("park.new", {}), true]]} />
      : v.ribbon ? <Result tone="good" eyebrow="Long may it haunt" title="A ghost paradise!"
        summary="Eight rides, a houseful of ghosts, a night in the black and a crowd that runs screaming and comes back for more: Hauntworks is the most haunted place on the coast. Your haunt is saved." stats={tally}
        actions={[["Keep haunting", () => commands.run("park.continue", {}), true]]} /> : null}
  </>;
}

function Result({ tone, eyebrow, title, summary, stats, actions }: { tone: "good" | "bad"; eyebrow: string; title: string; summary: string; stats: [string, string][]; actions: [string, () => void, boolean][] }) {
  const { width } = useRuneViewport();
  return <RuneView anchor="fill" fill={SHADE} modal justify="center" items="center" role="dialog" label={title}>
    <RuneView variant="card" width={Math.min(520, width - 32)} padding={24} gap={12} border={{ width: 3, color: tone === "good" ? GOOD : CORAL }}>
      <Tag color={tone === "good" ? GOOD : BAD}>{eyebrow.toUpperCase()}</Tag>
      <Heading size={34}>{title}</Heading>
      <Text>{summary}</Text>
      <RuneView layout="grid" columns={2} gap={8}>{stats.map(([label, value]) => <RuneView key={label} gap={1}><Tag>{label.toUpperCase()}</Tag><Text family={DISPLAY} size={22}>{value}</Text></RuneView>)}</RuneView>
      <Row gap={8}>{actions.map(([label, run, primary]) => <Button key={label} tone={primary ? "primary" : "ticket"} onPress={run}>{label}</Button>)}</Row>
    </RuneView>
  </RuneView>;
}
