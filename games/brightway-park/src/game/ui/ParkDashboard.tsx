/** @jsxImportSource @jgengine/core/ui/jsx */
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { RuneLabel, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { clockLabel, guestCap } from "../catalog";
import { ecto } from "../ecto";
import { residentCount } from "../ghosts";
import { EXORCIST_EVIDENCE } from "../threats";
import { BOOK_LINES, CAMPAIGNS, MONTH_DAYS, monthLabel, parkDateLabel, parkDate, parkDuration, type BookLine } from "../books";
import { LOAN, linesNet, monthLine, park, parkMetrics, reportLine } from "../park";
import { scenarioView } from "../parkReset";
import { rideBoard } from "../rides";
import { isShut } from "../rideRefits";
import { scenarioDef } from "../scenarios";
import { session } from "../session";
import { BLUE_RIBBON } from "../milestones";
import { nextMilestone, nextStepText } from "./nextStep";
import { BAD, Button, Card, DISPLAY, GOLD, GOOD, Heading, INK, Meter, PENCIL, Row, Rows, Stepper, Tag, TEAL, Text, WARN, Window } from "./look";

export const money = ecto;
const toneColor = (value: number, good: number, warn: number): string => (value >= good ? GOOD : value >= warn ? WARN : BAD);

/** The haunt at a glance: ectoplasm, the living and the rumor up front; screams, ghosts, evidence and mood below. Every number is the world's. */
export function ParkStatus() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const phone = useRuneViewport().width < 600;
  const v = useGameStore((c) => {
    const w = park.of(c), m = parkMetrics(w);
    const gate = w.fact("park.gate") === true;
    // A ride the player closed to refurbish is not "down": it is resting by choice.
    const refurbishing = w.instances("ride").filter((ride) => isShut(w, ride.id)).length;
    return {
      gate, gateRefusal: gate ? null : w.canAct("open_gate")?.message ?? null, day: w.num("park.day"), open: w.fact("park.open") === true,
      rating: Math.round(w.num("park.rating")), refurbishing, down: Math.max(0, m.rides - m.ridesOpen - refurbishing), guests: session.guests.size,
      screams: w.num("park.screams_today"), ghosts: residentCount(w), chain: w.num("park.best_chain"),
    };
  });
  const world = () => park.of(ctx);
  const { gate, gateRefusal, rating, refurbishing, down, guests, screams, ghosts, chain } = v;
  // What the crowd is thinking most, freshest first: complaints in the warning colour.
  const said = useGameStore(() => session.thoughts.top.slice(0, phone ? 1 : 3).map((t) => ({ label: t.label, count: t.count, complaint: t.complaint })));
  const clock = () => clockLabel(ctx.time.calendar().dayFraction);
  return <Card {...(phone ? {} : { width: 300 })} grow={phone ? 1 : 0} shrink padding={phone ? 10 : 14} gap={phone ? 5 : 8} label="Haunt status">
    <Tag text={bind(() => `${parkDateLabel(v.day)} · ${clock()} · ${!gate ? "Gate chained" : v.open ? "The living are here" : "Daylight"}`.toUpperCase())} />
    <Row justify="between">
      <RuneLabel value={bind(() => world().num("park.cash"))} format={money} family={DISPLAY} size={phone ? 22 : 28} color={bind(() => world().num("park.cash") < 0 ? BAD : TEAL)} />
      <Text family={DISPLAY} size={phone ? 16 : 20} color={INK}>{`Rumor ${rating}`}</Text>
    </Row>
    <Row justify="between"><Text>{`${guests} / ${guestCap(rating)} living`}</Text>{down > 0 ? <Text weight={800} color={BAD}>{`${down} ${down === 1 ? "ride" : "rides"} jammed`}</Text> : refurbishing > 0 ? <Text weight={800}>{`${refurbishing} resting`}</Text> : null}</Row>
    <Row justify="between"><Text size={13} color={GOOD}>{`${screams} screamed out tonight`}</Text><Text size={13} weight={800} color={chain >= 3 ? GOLD : PENCIL}>{chain > 1 ? `best chain ×${chain}` : ""}</Text></Row>
    <Row justify="between"><Text size={13}>{ghosts === 0 ? "No ghosts in residence" : `${ghosts} ${ghosts === 1 ? "ghost" : "ghosts"} in residence`}</Text></Row>
    <Row gap={12} items="start">
      <Meter label="MOOD" read={() => world().num("park.mood")} max={() => 100} readout={(n) => `${Math.round(n)}%`} color={bind(() => toneColor(world().num("park.mood"), 50, 35))} />
      <Meter label="EVIDENCE" read={() => world().num("park.evidence")} max={() => EXORCIST_EVIDENCE} readout={(n) => `${Math.round(n)}`} color={bind(() => world().num("park.evidence") >= 70 ? BAD : world().num("park.evidence") >= 40 ? WARN : PENCIL)} />
    </Row>
    {/* A fixed number of lines, so the goal card below never has to move as thoughts come and go. */}
    <RuneView gap={1} minHeight={phone ? 18 : 52} label="What the living are saying">
      {said.length > 0 ? said.map((t) => <Row key={t.label} justify="between"><Text size={13} color={t.complaint ? BAD : GOOD} grow={1} shrink>{`“${t.label}”`}</Text><Text size={13} weight={800}>{String(t.count)}</Text></Row>)
        : <Text size={13} color={PENCIL}>{guests === 0 ? "No one living has come in yet" : "The living are working up their nerve"}</Text>}
    </RuneView>
    <Button tone={gate ? "ticket" : "primary"} hint="hud:gate" disabled={gateRefusal !== null} tooltip={gateRefusal ?? undefined}
      onPress={() => commands.run("brightway.act", { action: gate ? "close_gate" : "open_gate" })}>{gate ? "Chain the gate" : "Unchain the gate"}</Button>
  </Card>;
}

/** The one card that says what to do next: the first unmet goal, the checklist, and a hint when stuck. */
export function ParkGoal() {
  const goal = useGameStore((ctx) => parkGoal(ctx));
  const phone = useRuneViewport().width < 600;
  return <Card width={300} gap={5} label="Goal" responsive={{ phone: { width: { fraction: 1 }, padding: 10 } }}>
    <Tag>{goal.eyebrow.toUpperCase()}</Tag>
    <Heading size={16}>{goal.title}</Heading>
    {phone ? null : goal.steps?.map((s) => <Row key={s.id} gap={6}><Text weight={800} color={s.done ? GOOD : PENCIL}>{s.done ? "✓" : "○"}</Text><Text size={13} color={s.done ? PENCIL : INK} grow={1} shrink>{s.label}</Text></Row>)}
    {phone ? null : <Text size={12} color={PENCIL}>{goal.hint}</Text>}
  </Card>;
}

/** What {@link ParkGoal} draws, as plain values: the card re-renders only when one of them changes. */
function parkGoal(ctx: GameContext): { eyebrow: string; title: string; steps?: { id: string; label: string; done: boolean }[]; hint: string } {
  const w = park.of(ctx);
  const m = parkMetrics(w), scenario = scenarioView(ctx);
  const rating = w.num("park.rating"), peak = w.num("park.peak"), mood = w.num("park.mood"), litter = w.num("park.litter"), day = w.num("park.day");
  const net = w.num("park.revenue_yesterday") - w.num("park.upkeep_yesterday"), won = w.fact("park.won") === true;
  if (scenario !== null) {
    const id = w.fact("scenario.id");
    const targets = (typeof id === "string" ? scenarioDef(id) : null)?.targets ?? [];
    const steps = targets.map((t) => ({ id: t.fact, label: `${Math.floor(w.num(t.fact)).toLocaleString()} / ${t.atLeast.toLocaleString()} ${t.label}`, done: scenario.result === "won" || w.num(t.fact) >= t.atLeast }));
    const hint = m.rides === 0 ? "Lay a path from the gate, build a ride and connect it."
      : m.ridesOpen === 0 ? "No ride is running: connect it, or bind a gremlin to un-jam it." : w.fact("park.gate") !== true ? "Unchain the gate: the living come at dusk."
      : w.num("park.props") === 0 ? "Line the paths with scare props: scares close together chain for more ectoplasm."
      : w.num("park.ghosts") === 0 ? "Open Ghosts to see what each ghost wants before it will move in." : "Chain scares along the path, but don't break their nerve before the best rides.";
    // The deadline in park nights, not clock seconds: a scenario runs for moons.
    const left = scenario.remaining === null ? "" : ` · ${parkDuration(scenario.remaining)} left`;
    return { eyebrow: `${scenario.title}${left}`, title: scenario.goal, steps, hint };
  }
  const ghosts = residentCount(w);
  const steps = [
    { id: "rides", label: `${BLUE_RIBBON.rides} rides · ${Math.min(m.rides, BLUE_RIBBON.rides)}/${BLUE_RIBBON.rides}`, done: m.rides >= BLUE_RIBBON.rides, next: `Build up to ${BLUE_RIBBON.rides} rides` },
    { id: "rating", label: `Rumor · ${Math.round(rating)}/${BLUE_RIBBON.rating}`, done: rating >= BLUE_RIBBON.rating, next: `Spread the rumor to ${BLUE_RIBBON.rating}` },
    { id: "ghosts", label: `Ghosts in residence · ${Math.min(ghosts, BLUE_RIBBON.ghosts)}/${BLUE_RIBBON.ghosts}`, done: ghosts >= BLUE_RIBBON.ghosts, next: `Give ${BLUE_RIBBON.ghosts} ghosts a home` },
    { id: "profit", label: day > 1 ? `Last night ${net < 0 ? "lost" : "gathered"} ${money(Math.abs(net))}` : "Finish a night with ectoplasm to spare", done: day > 1 && net >= 0, next: "Finish a night with ectoplasm to spare" },
    { id: "happy", label: `Thrilled ${BLUE_RIBBON.mood}%+ · tidy ${100 - BLUE_RIBBON.litter}%+`, done: mood >= BLUE_RIBBON.mood && litter <= BLUE_RIBBON.litter, next: "Give the living a night to remember and sweep the paths" },
  ];
  const next = steps.find((s) => !s.done);
  const hint = litter > 25 ? "Litter is piling up: raise a Ghoul Groundskeeper from Spooks." : m.stalls < 3 ? "Hungry visitors lose interest: add Cursed Candy Floss and Witch's Brew from Stalls." : m.rides < 3 ? "Open Rides in the build palette and place one on an empty plot." : nextStepText(peak) ?? "Mix eerie rides and frenzies: families and dared teens want different nights out.";
  return {
    eyebrow: won ? "A ghost paradise" : "Your ghost paradise", title: won ? "Keep the nights screaming" : next?.next ?? "Hold it until noon",
    ...(won ? {} : { steps: steps.map(({ id, label, done }) => ({ id, label, done })) }), hint,
  };
}

/** The ledger, the gate price, the bank and the next award: open when the player asks for them. Buttons run `brightway.act`. */
export function ParkBooks({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  const v = useGameStore((ctx) => booksView(ctx));
  const act = (action: string) => commands.run("brightway.act", { action });
  return <Window eyebrow="The crypt office" title="The ledger" close={onClose} closeLabel="Close the ledger" footer={<>
    <Button label="Borrow from the Ferryman" disabled={v.owed > LOAN.max - LOAN.step} onPress={() => act("take_loan")}>{`Borrow ${money(LOAN.step)}`}</Button>
    <Button label="Repay the Ferryman" disabled={v.owed < LOAN.step} onPress={() => act("repay_loan")}>{`Repay ${money(LOAN.step)}`}</Button>
  </>}>
    <Stepper label="Gate toll" value={`${v.ticket}`} down={() => act("ticket_down")} up={() => act("ticket_up")} downLabel="Lower the gate toll" upLabel="Raise the gate toll" />
    <Rows rows={v.today} />
    {v.next !== null ? <Meter label={`NEXT RUMOR: ${v.next.label.toUpperCase()} · ${money(v.next.prize)}`} read={() => v.peak} max={() => v.next?.rating ?? 1} readout={() => `${Math.round(v.peak)} / ${v.next?.rating ?? 0}`} color={GOOD} /> : null}
    <Row justify="between"><Heading size={16}>{`${v.month} so far${v.lastMonth !== null ? ` · then ${v.lastMonth}` : ""}`}</Heading><Text size={12} color={PENCIL}>{`night ${v.dayOfMonth} of ${MONTH_DAYS}`}</Text></Row>
    <Rows rows={v.monthRows} />
    <Heading size={16}>Spread a rumor</Heading>
    {v.campaigns.map((c) => <Button key={c.id} disabled={c.disabled} tooltip={c.blurb} onPress={() => act(c.id)}>{c.text}</Button>)}
  </Window>;
}

/** What {@link ParkBooks} draws, as plain values: the ledger re-renders when a shown figure changes, not on every tick. */
function booksView(ctx: GameContext) {
  const w = park.of(ctx);
  const m = parkMetrics(w), peak = w.num("park.peak"), next = nextMilestone(peak), rides = rideBoard();
  const owed = w.num("park.loan_owed"), date = parkDate(w.num("park.day")), lastMonth = w.num("report.month");
  const hasReport = lastMonth >= 0;
  const signed = (line: BookLine, amount: number) => money(line.income ? amount : -amount);
  const bookRows: [string, string][] = BOOK_LINES
    .filter((line) => w.num(monthLine(line.id)) !== 0 || (hasReport && w.num(reportLine(line.id)) !== 0))
    .map((line) => [line.label, `${signed(line, w.num(monthLine(line.id)))}${hasReport ? ` · ${signed(line, w.num(reportLine(line.id)))}` : ""}`]);
  const profit = w.num("park.cash") - w.num("month.cash_start");
  const ads = w.orders("ads");
  const today: [string, string][] = [["Tonight’s harvest", money(w.num("park.revenue_today"))], ["Rides, stalls & props upkeep", `${money(m.facilitiesUpkeep)} / night`], ["Spooks' upkeep", `${money(m.wages)} / night`],
    ...(rides.rides > 0 ? [["Ride lines", `${rides.queued} waiting`] as [string, string]] : []),
    ["Owed to the Ferryman", owed > 0 ? `${money(owed)} · ${money(owed * LOAN.monthlyRate)}/moon` : `nothing · up to ${money(LOAN.max)}`]];
  const monthRows: [string, string][] = [...bookRows, ["Building and land", `${money(profit - linesNet(w, monthLine))}${hasReport ? ` · ${money(-w.num("report.building"))}` : ""}`],
    ["Gathered", `${money(profit)}${hasReport ? ` · ${money(w.num("report.profit"))}` : ""}`]];
  const campaigns = CAMPAIGNS.map((c) => {
    const running = ads.find((order) => order.label === c.label);
    return { id: c.id, blurb: c.blurb, disabled: running !== undefined || w.canAct(c.id) !== null, text: running !== undefined ? `${c.label} · ${parkDuration(running.remaining)} left` : `${c.label} · ${money(c.cost)}` };
  });
  return {
    owed, ticket: w.num("park.ticket"), today, peak, next: next === null ? null : { label: next.label, prize: next.prize, rating: next.rating },
    month: date.month, dayOfMonth: date.dayOfMonth, lastMonth: hasReport ? monthLabel(lastMonth) : null, monthRows, campaigns,
  };
}
