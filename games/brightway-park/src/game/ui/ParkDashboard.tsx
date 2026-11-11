/** @jsxImportSource @jgengine/core/ui/jsx */
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { RuneLabel, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { guestCap } from "../catalog";
import { BOOK_LINES, CAMPAIGNS, MONTH_DAYS, monthLabel, parkDateLabel, parkDate, parkDuration, type BookLine } from "../books";
import { LOAN, linesNet, monthLine, park, parkMetrics, reportLine } from "../park";
import { scenarioView } from "../parkReset";
import { rideBoard } from "../rides";
import { isShut } from "../rideRefits";
import { scenarioDef } from "../scenarios";
import { session } from "../session";
import { BLUE_RIBBON } from "../milestones";
import { nextMilestone, nextStepText } from "./nextStep";
import { BAD, Button, Card, DISPLAY, GOOD, Heading, INK, Meter, PENCIL, Row, Rows, Stepper, Tag, Text, WARN, Window } from "./look";

export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const toneColor = (value: number, good: number, warn: number): string => (value >= good ? GOOD : value >= warn ? WARN : BAD);

/** The park at a glance: funds, crowd and rating up front; mood and tidiness as meters that warn. Every number is the world's. */
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
    };
  });
  const world = () => park.of(ctx);
  const { gate, gateRefusal, rating, refurbishing, down, guests } = v;
  // What the crowd is thinking most, freshest first: complaints in the warning colour.
  const said = useGameStore(() => session.thoughts.top.slice(0, phone ? 1 : 3).map((t) => ({ label: t.label, count: t.count, complaint: t.complaint })));
  const clock = () => { const c = ctx.time.calendar(); return `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`; };
  return <Card {...(phone ? {} : { width: 290 })} grow={phone ? 1 : 0} shrink padding={phone ? 10 : 14} gap={phone ? 5 : 8} label="Park status">
    <Tag text={bind(() => `${parkDateLabel(v.day)} · ${clock()} · ${!gate ? "Gate shut" : v.open ? "Gates open" : "After hours"}`.toUpperCase())} />
    <Row justify="between">
      <RuneLabel value={bind(() => world().num("park.cash"))} format={money} family={DISPLAY} size={phone ? 24 : 30} color={bind(() => world().num("park.cash") < 0 ? BAD : INK)} />
      <Text family={DISPLAY} size={phone ? 18 : 22} color={INK}>{`★ ${rating}`}</Text>
    </Row>
    <Row justify="between"><Text>{`${guests} / ${guestCap(rating)} guests`}</Text>{down > 0 ? <Text weight={800} color={BAD}>{`${down} ${down === 1 ? "ride" : "rides"} down`}</Text> : refurbishing > 0 ? <Text weight={800}>{`${refurbishing} refurbishing`}</Text> : null}</Row>
    <Row gap={12} items="start">
      <Meter label="MOOD" read={() => world().num("park.mood")} max={() => 100} readout={(n) => `${Math.round(n)}%`} color={bind(() => toneColor(world().num("park.mood"), 50, 35))} />
      <Meter label="CLEAN" read={() => 100 - world().num("park.litter")} max={() => 100} readout={(n) => `${Math.round(n)}%`} color={bind(() => toneColor(100 - world().num("park.litter"), 60, 40))} />
    </Row>
    {/* A fixed number of lines, so the goal card below never has to move as thoughts come and go. */}
    <RuneView gap={1} minHeight={phone ? 18 : 52} label="What guests are saying">
      {said.length > 0 ? said.map((t) => <Row key={t.label} justify="between"><Text size={13} color={t.complaint ? BAD : GOOD} grow={1} shrink>{`“${t.label}”`}</Text><Text size={13} weight={800}>{String(t.count)}</Text></Row>)
        : <Text size={13} color={PENCIL}>{guests === 0 ? "No guests yet to say anything" : "Guests are making up their minds"}</Text>}
    </RuneView>
    <Button tone={gate ? "ticket" : "primary"} hint="hud:gate" disabled={gateRefusal !== null} tooltip={gateRefusal ?? undefined}
      onPress={() => commands.run("brightway.act", { action: gate ? "close_gate" : "open_gate" })}>{gate ? "Close the gate" : "Open the gate"}</Button>
  </Card>;
}

/** The one card that says what to do next: the first unmet goal, the checklist, and a hint when stuck. */
export function ParkGoal() {
  const goal = useGameStore((ctx) => parkGoal(ctx));
  const phone = useRuneViewport().width < 600;
  return <Card width={290} gap={5} label="Goal" responsive={{ phone: { width: { fraction: 1 }, padding: 10 } }}>
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
      : m.ridesOpen === 0 ? "No ride is running: connect it, or hire a mechanic to mend it." : w.fact("park.gate") !== true ? "Open the gate to let guests in." : "More rides, shops and scenery raise the rating; marketing in the Books brings more guests.";
    // The deadline in park days, not clock seconds: a scenario runs for months.
    const left = scenario.remaining === null ? "" : ` · ${parkDuration(scenario.remaining)} left`;
    return { eyebrow: `${scenario.title}${left}`, title: scenario.goal, steps, hint };
  }
  const steps = [
    { id: "rides", label: `${BLUE_RIBBON.rides} rides · ${Math.min(m.rides, BLUE_RIBBON.rides)}/${BLUE_RIBBON.rides}`, done: m.rides >= BLUE_RIBBON.rides, next: `Build up to ${BLUE_RIBBON.rides} rides` },
    { id: "rating", label: `Rating · ${Math.round(rating)}/${BLUE_RIBBON.rating}`, done: rating >= BLUE_RIBBON.rating, next: `Raise the rating to ${BLUE_RIBBON.rating}` },
    { id: "profit", label: day > 1 ? `Last day ${net < 0 ? "lost" : "made"} ${money(Math.abs(net))}` : "Finish a profitable day", done: day > 1 && net >= 0, next: "Finish a day in profit" },
    { id: "happy", label: `Happy ${BLUE_RIBBON.mood}%+ · clean ${100 - BLUE_RIBBON.litter}%+`, done: mood >= BLUE_RIBBON.mood && litter <= BLUE_RIBBON.litter, next: "Cheer guests up and tidy the paths" },
  ];
  const next = steps.find((s) => !s.done);
  const hint = litter > 25 ? "Litter is piling up: hire a handyman from Staff." : m.stalls < 3 ? "Hungry guests turn grumpy: add food and drink from Shops." : m.rides < 3 ? "Open Rides in the build palette and place one on an empty plot." : nextStepText(peak) ?? "Mix gentle rides and thrills: families and thrill seekers want different days out.";
  return {
    eyebrow: won ? "Blue ribbon park" : "Your first blue ribbon", title: won ? "Keep the good days rolling" : next?.next ?? "Hold it until midnight",
    ...(won ? {} : { steps: steps.map(({ id, label, done }) => ({ id, label, done })) }), hint,
  };
}

/** The ledger, the gate price, the bank and the next award: open when the player asks for them. Buttons run `brightway.act`. */
export function ParkBooks({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  const v = useGameStore((ctx) => booksView(ctx));
  const act = (action: string) => commands.run("brightway.act", { action });
  return <Window eyebrow="The office" title="Park books" close={onClose} closeLabel="Close park books" footer={<>
    <Button label="Borrow from the bank" disabled={v.owed > LOAN.max - LOAN.step} onPress={() => act("take_loan")}>{`Borrow ${money(LOAN.step)}`}</Button>
    <Button label="Repay the bank" disabled={v.owed < LOAN.step} onPress={() => act("repay_loan")}>{`Repay ${money(LOAN.step)}`}</Button>
  </>}>
    <Stepper label="Entry ticket" value={`$${v.ticket}`} down={() => act("ticket_down")} up={() => act("ticket_up")} downLabel="Lower ticket price" upLabel="Raise ticket price" />
    <Rows rows={v.today} />
    {v.next !== null ? <Meter label={`NEXT AWARD: ${v.next.label.toUpperCase()} · ${money(v.next.prize)}`} read={() => v.peak} max={() => v.next?.rating ?? 1} readout={() => `★ ${Math.round(v.peak)} / ${v.next?.rating ?? 0}`} color={GOOD} /> : null}
    <Row justify="between"><Heading size={16}>{`${v.month} so far${v.lastMonth !== null ? ` · then ${v.lastMonth}` : ""}`}</Heading><Text size={12} color={PENCIL}>{`day ${v.dayOfMonth} of ${MONTH_DAYS}`}</Text></Row>
    <Rows rows={v.monthRows} />
    <Heading size={16}>Marketing</Heading>
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
  const today: [string, string][] = [["Today’s sales", money(w.num("park.revenue_today"))], ["Rides & shops upkeep", `${money(m.facilitiesUpkeep)} / day`], ["Staff wages", `${money(m.wages)} / day`],
    ...(rides.rides > 0 ? [["Ride lines", `${rides.queued} waiting`] as [string, string]] : []),
    ["Loan owed", owed > 0 ? `${money(owed)} · ${money(owed * LOAN.monthlyRate)}/mo` : `none · up to ${money(LOAN.max)}`]];
  const monthRows: [string, string][] = [...bookRows, ["Building and land", `${money(profit - linesNet(w, monthLine))}${hasReport ? ` · ${money(-w.num("report.building"))}` : ""}`],
    ["Profit", `${money(profit)}${hasReport ? ` · ${money(w.num("report.profit"))}` : ""}`]];
  const campaigns = CAMPAIGNS.map((c) => {
    const running = ads.find((order) => order.label === c.label);
    return { id: c.id, blurb: c.blurb, disabled: running !== undefined || w.canAct(c.id) !== null, text: running !== undefined ? `${c.label} · ${parkDuration(running.remaining)} left` : `${c.label} · ${money(c.cost)}` };
  });
  return {
    owed, ticket: w.num("park.ticket"), today, peak, next: next === null ? null : { label: next.label, prize: next.prize, rating: next.rating },
    month: date.month, dayOfMonth: date.dayOfMonth, lastMonth: hasReport ? monthLabel(lastMonth) : null, monthRows, campaigns,
  };
}
