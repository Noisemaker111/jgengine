import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitObjective } from "@jgengine/react/kitFlow";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";
import type { KitTone } from "@jgengine/react/uiKit";

import { guestCap } from "../../catalog";
import { LOAN, parkMetrics } from "../../park";
import { scenarioView } from "../../parkReset";
import { rideBoard } from "../../rides";
import { scenarioDef } from "../../scenarios";
import { session } from "../../session";
import { BLUE_RIBBON } from "../../milestones";
import { nextMilestone, nextStepText } from "../nextStep";
import { usePark } from "../usePark";
import { Rows } from "./Inspector";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const tone = (value: number, good: number, warn: number): KitTone => (value >= good ? "good" : value >= warn ? "warn" : "bad");

/** The park at a glance: funds, crowd and rating up front; mood and tidiness as meters that warn. Every number is the world's. */
export function ParkStatus() {
  const w = usePark();
  const guests = useGameStore(() => session.guests.size);
  const clock = useGameStore((ctx) => { const c = ctx.time.calendar(); return `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`; });
  const m = parkMetrics(w);
  const cash = w.num("park.cash"), rating = w.num("park.rating"), mood = w.num("park.mood"), clean = 100 - w.num("park.litter");
  const open = w.fact("park.open") === true, down = m.rides - m.ridesOpen;
  // What the crowd is thinking most, freshest first: complaints in the warning colour.
  const said = useGameStore(() => session.thoughts.top.slice(0, 3).map((t) => `${t.label}:${t.count}:${t.complaint ? 1 : 0}`).join("|"));
  return (
    <KitPanel className="bw-status" eyebrow={`Day ${w.num("park.day")} · ${clock} · ${open ? "Gates open" : "After hours"}`} title={money(cash)} tone={cash < 0 ? "bad" : undefined} aside={`★ ${Math.round(rating)}`}>
      <div className="bw-line"><span>{guests} / {guestCap(rating)} guests</span>{down > 0 ? <b data-bad="">{down} {down === 1 ? "ride" : "rides"} down</b> : null}</div>
      <KitMeter size="sm" label="Mood" value={mood} max={100} readout={`${Math.round(mood)}%`} tone={tone(mood, 50, 35)} />
      <KitMeter size="sm" label="Clean" value={clean} max={100} readout={`${Math.round(clean)}%`} tone={tone(clean, 60, 40)} />
      {said ? <ul className="bw-said" aria-label="What guests are saying">
        {said.split("|").map((entry) => { const [label, count, complaint] = entry.split(":"); return <li key={label} data-bad={complaint === "1" ? "" : undefined}>“{label}” <b>{count}</b></li>; })}
      </ul> : null}
    </KitPanel>
  );
}

/** The one card that says what to do next: the first unmet goal, the checklist, and a hint when stuck. */
export function ParkGoal() {
  const w = usePark();
  const ctx = useGameContext();
  const m = parkMetrics(w), scenario = scenarioView(ctx);
  const rating = w.num("park.rating"), peak = w.num("park.peak"), mood = w.num("park.mood"), litter = w.num("park.litter"), day = w.num("park.day");
  const net = w.num("park.revenue_yesterday") - w.num("park.upkeep_yesterday"), won = w.fact("park.won") === true;
  if (scenario !== null) {
    const id = w.fact("scenario.id");
    const when = (typeof id === "string" ? scenarioDef(id) : null)?.mission.objectives[0]?.branches?.find((b) => b.to === "done")?.when;
    const target = Array.isArray(when) ? when[0] : when;
    const goal = target?.atLeast ?? 0, fact = target?.fact ?? "park.scenario_revenue";
    const isMoney = fact === "park.scenario_revenue";
    const have = isMoney ? money(w.num(fact)) : fact === "park.rating" ? `★ ${Math.round(w.num(fact))}` : `${w.num(fact)}`;
    return <KitObjective className="bw-goal" eyebrow={`Scenario · ${scenario.title}`} title={scenario.goal}
      steps={[{ id: "target", label: `${have} of ${isMoney ? money(goal) : goal}`, done: scenario.result === "won" }, { id: "till", label: `Till ${money(scenario.cash)}`, done: scenario.cash > 0 }]}
      deadline={scenario.remaining !== null && scenario.duration !== null ? { remaining: scenario.remaining, total: scenario.duration } : undefined}
      hint="Cheaper tickets and more rides pull a bigger crowd." progressKey={`${Math.round(scenario.visitors / 5)}`} />;
  }
  const steps = [
    { id: "rides", label: `${BLUE_RIBBON.rides} rides · ${Math.min(m.rides, BLUE_RIBBON.rides)}/${BLUE_RIBBON.rides}`, done: m.rides >= BLUE_RIBBON.rides, next: `Build up to ${BLUE_RIBBON.rides} rides` },
    { id: "rating", label: `Rating · ${Math.round(rating)}/${BLUE_RIBBON.rating}`, done: rating >= BLUE_RIBBON.rating, next: `Raise the rating to ${BLUE_RIBBON.rating}` },
    { id: "profit", label: day > 1 ? `Last day ${net < 0 ? "lost" : "made"} ${money(Math.abs(net))}` : "Finish a profitable day", done: day > 1 && net >= 0, next: "Finish a day in profit" },
    { id: "happy", label: `Happy ${BLUE_RIBBON.mood}%+ · clean ${100 - BLUE_RIBBON.litter}%+`, done: mood >= BLUE_RIBBON.mood && litter <= BLUE_RIBBON.litter, next: "Cheer guests up and tidy the paths" },
  ];
  const next = steps.find((s) => !s.done);
  const hint = litter > 25 ? "Litter is piling up: hire a handyman from Staff." : m.stalls < 3 ? "Hungry guests turn grumpy: add food and drink from Shops." : m.rides < 3 ? "Open Rides in the build palette and place one on an empty plot." : nextStepText(peak) ?? "Mix gentle rides and thrills: families and thrill seekers want different days out.";
  return <KitObjective className="bw-goal" eyebrow={won ? "Blue ribbon park" : "Your first blue ribbon"} title={won ? "Keep the good days rolling" : next?.next ?? "Hold it until midnight"}
    steps={won ? undefined : steps} hint={hint} progressKey={steps.filter((s) => s.done).length} />;
}

/** The ledger, the gate price, the bank and the next award: open when the player asks for them. Buttons run `brightway.act`. */
export function ParkBooks({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  const w = usePark();
  useGameStore(() => session.guests.size);
  const act = (action: string) => commands.run("brightway.act", { action });
  const m = parkMetrics(w), peak = w.num("park.peak"), next = nextMilestone(peak), rides = rideBoard();
  const owed = w.num("park.loan_owed");
  return (
    <KitPanel variant="card" eyebrow="The office" title="Park books" aside={<KitButton variant="ghost" size="sm" cue="close" aria-label="Close park books" onClick={onClose}>✕</KitButton>}
      footer={<>
        <KitButton size="sm" aria-label="Borrow from the bank" disabled={owed > LOAN.max - LOAN.step} onClick={() => act("take_loan")}>Borrow {money(LOAN.step)}</KitButton>
        <KitButton size="sm" aria-label="Repay the bank" disabled={owed < LOAN.step} onClick={() => act("repay_loan")}>Repay {money(LOAN.step)}</KitButton>
      </>}>
      <div className="bw-line"><span>Entry ticket</span><span className="bw-stepper">
        <KitButton size="sm" aria-label="Lower ticket price" onClick={() => act("ticket_down")}>−</KitButton><b>${w.num("park.ticket")}</b>
        <KitButton size="sm" aria-label="Raise ticket price" onClick={() => act("ticket_up")}>+</KitButton></span></div>
      <Rows rows={[["Today’s sales", money(w.num("park.revenue_today"))], ["Rides & shops upkeep", `${money(m.facilitiesUpkeep)} / day`], ["Staff wages", `${money(m.wages)} / day`],
        ...(rides.rides > 0 ? [["Ride lines", `${rides.queued} waiting`] as [string, string]] : []),
        ["Loan owed", owed > 0 ? `${money(owed)} of ${money(LOAN.max)} · ${money(owed * LOAN.dailyRate)}/night interest` : `none · up to ${money(LOAN.max)}`]]} />
      {next !== null ? <KitMeter size="sm" label={`Next award: ${next.label} · ${money(next.prize)}`} value={peak} max={next.rating} readout={`★ ${Math.round(peak)} / ${next.rating}`} /> : null}
    </KitPanel>
  );
}
