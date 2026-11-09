import { useGame, useGameStore } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";
import { LiveText } from "@jgengine/core/ui/liveBind.view";
import { live } from "@jgengine/core/ui/liveValue";
import { KitObjective } from "@jgengine/core/ui/kit/kitFlow.view";
import { KitButton, KitMeter, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import type { KitTone } from "@jgengine/core/ui/kit/uiKit.view";

import { guestCap } from "../../catalog";
import { BOOK_LINES, CAMPAIGNS, MONTH_DAYS, monthLabel, parkDateLabel, parkDate, parkDuration, type BookLine } from "../../books";
import { LOAN, linesNet, monthLine, park, parkMetrics, reportLine } from "../../park";
import { scenarioView } from "../../parkReset";
import { rideBoard } from "../../rides";
import { isShut } from "../../rideRefits";
import { scenarioDef } from "../../scenarios";
import { session } from "../../session";
import { BLUE_RIBBON } from "../../milestones";
import { nextMilestone, nextStepText } from "../nextStep";
import { Rows } from "./Inspector";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const tone = (value: number, good: number, warn: number): KitTone => (value >= good ? "good" : value >= warn ? "warn" : "bad");

/** The park at a glance: funds, crowd and rating up front; mood and tidiness as meters that warn. Every number is the world's. */
export function ParkStatus() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const v = useGameStore((c) => {
    const w = park.of(c), m = parkMetrics(w);
    const gate = w.fact("park.gate") === true;
    // A ride the player closed to refurbish is not "down": it is resting by choice.
    const refurbishing = w.instances("ride").filter((ride) => isShut(w, ride.id)).length;
    return {
      gate, gateRefusal: gate ? null : w.canAct("open_gate")?.message ?? null, day: w.num("park.day"), open: w.fact("park.open") === true,
      broke: w.num("park.cash") < 0, rating: Math.round(w.num("park.rating")), refurbishing, down: Math.max(0, m.rides - m.ridesOpen - refurbishing),
    };
  });
  const guests = useGameStore(() => session.guests.size);
  const world = () => park.of(ctx);
  const { gate, gateRefusal, rating, refurbishing, down } = v;
  const mood = live(() => world().num("park.mood")), clean = live(() => 100 - world().num("park.litter"));
  const moodTone = useGameStore((c) => tone(park.of(c).num("park.mood"), 50, 35)), cleanTone = useGameStore((c) => tone(100 - park.of(c).num("park.litter"), 60, 40));
  // What the crowd is thinking most, freshest first: complaints in the warning colour.
  const said = useGameStore(() => session.thoughts.top.slice(0, 3).map((t) => `${t.label}:${t.count}:${t.complaint ? 1 : 0}`).join("|"));
  return (
    <KitPanel className="bw-status" eyebrow={<>{parkDateLabel(v.day)} · <LiveText get={() => { const c = ctx.time.calendar(); return `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`; }} /> · {!gate ? "Gate shut" : v.open ? "Gates open" : "After hours"}</>}
      title={<LiveText get={() => money(world().num("park.cash"))} />} tone={v.broke ? "bad" : undefined} aside={`★ ${rating}`}
      footer={<KitButton size="sm" variant={gate ? "ghost" : "primary"} data-hint="gate" disabled={gateRefusal !== null} title={gateRefusal ?? undefined}
        onClick={() => commands.run("brightway.act", { action: gate ? "close_gate" : "open_gate" })}>{gate ? "Close the gate" : "Open the gate"}</KitButton>}>
      <div className="bw-line"><span>{guests} / {guestCap(rating)} guests</span>{down > 0 ? <b data-bad="">{down} {down === 1 ? "ride" : "rides"} down</b> : refurbishing > 0 ? <b>{refurbishing} refurbishing</b> : null}</div>
      <div className="bw-meters">
        <KitMeter size="sm" label="Mood" value={mood} max={100} readout={(value) => `${Math.round(value)}%`} tone={moodTone} />
        <KitMeter size="sm" label="Clean" value={clean} max={100} readout={(value) => `${Math.round(value)}%`} tone={cleanTone} />
      </div>
      {/* Always three lines tall, so the goal card below never has to move as thoughts come and go. */}
      <ul className="bw-said" aria-label="What guests are saying">
        {said ? said.split("|").map((entry) => { const [label, count, complaint] = entry.split(":"); return <li key={label} data-bad={complaint === "1" ? "" : undefined}>“{label}” <b>{count}</b></li>; })
          : <li data-quiet="">{guests === 0 ? "No guests yet to say anything" : "Guests are making up their minds"}</li>}
      </ul>
    </KitPanel>
  );
}

/** The one card that says what to do next: the first unmet goal, the checklist, and a hint when stuck. */
export function ParkGoal() {
  const goal = useGameStore((ctx) => parkGoal(ctx));
  return <KitObjective className="bw-goal" {...goal} />;
}

/** What {@link ParkGoal} draws, as plain values: the card re-renders only when one of them changes. */
function parkGoal(ctx: GameContext): { eyebrow: string; title: string; steps?: { id: string; label: string; done: boolean }[]; hint: string; progressKey: number } {
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
    return { eyebrow: `${scenario.title}${left}`, title: scenario.goal, steps, hint, progressKey: steps.filter((s) => s.done).length };
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
    ...(won ? {} : { steps: steps.map(({ id, label, done }) => ({ id, label, done })) }), hint, progressKey: steps.filter((s) => s.done).length,
  };
}

/** The ledger, the gate price, the bank and the next award: open when the player asks for them. Buttons run `brightway.act`. */
export function ParkBooks({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  const v = useGameStore((ctx) => booksView(ctx));
  const act = (action: string) => commands.run("brightway.act", { action });
  return (
    <KitPanel variant="card" eyebrow="The office" title="Park books" aside={<KitButton variant="ghost" size="sm" cue="close" aria-label="Close park books" onClick={onClose}>✕</KitButton>}
      footer={<>
        <KitButton size="sm" aria-label="Borrow from the bank" disabled={v.owed > LOAN.max - LOAN.step} onClick={() => act("take_loan")}>Borrow {money(LOAN.step)}</KitButton>
        <KitButton size="sm" aria-label="Repay the bank" disabled={v.owed < LOAN.step} onClick={() => act("repay_loan")}>Repay {money(LOAN.step)}</KitButton>
      </>}>
      <div className="bw-line"><span>Entry ticket</span><span className="bw-stepper">
        <KitButton size="sm" aria-label="Lower ticket price" onClick={() => act("ticket_down")}>−</KitButton><b>${v.ticket}</b>
        <KitButton size="sm" aria-label="Raise ticket price" onClick={() => act("ticket_up")}>+</KitButton></span></div>
      <Rows rows={v.today} />
      {v.next !== null ? <KitMeter size="sm" label={`Next award: ${v.next.label} · ${money(v.next.prize)}`} value={v.peak} max={v.next.rating} readout={`★ ${Math.round(v.peak)} / ${v.next.rating}`} /> : null}
      <h4 className="bw-subhead">{v.month} so far{v.lastMonth !== null ? ` · then ${v.lastMonth}` : ""} <small>day {v.dayOfMonth} of {MONTH_DAYS}</small></h4>
      <Rows rows={v.monthRows} />
      <h4 className="bw-subhead">Marketing</h4>
      <div className="bw-ads">{v.campaigns.map((c) => (
        <KitButton key={c.id} size="sm" data-campaign={c.id} disabled={c.disabled} title={c.blurb} onClick={() => act(c.id)}>{c.text}</KitButton>
      ))}</div>
    </KitPanel>
  );
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
