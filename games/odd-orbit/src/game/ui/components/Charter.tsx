import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useGame, useGameClock, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";

import { householdStore } from "../../session/store";
import type { PendingIncident } from "../../session/types";
import { charterGrade, charterOf, GOALS_TO_PASS, STRIKES_TO_EVICT, TERM_DAYS, TERMS, termGoals } from "../../sim/charter";
import { rentFor } from "../../sim/economy";
import { ANSWER_SECONDS, incidentDef } from "../../sim/events";
import { Enamel, PaperNote } from "../fiction/kit";

const INCIDENT_ICON: Record<string, GameIconName> = {
  trader: "coin", overtime: "hourglass", dust: "leaf", brownout: "lightning", spoilage: "poison",
  traveller: "hand", quarrel: "fist", fever: "potionRed", meteor: "fire", hullLeak: "frost",
};

/** The Authority's charter pinned under the fridge: the term, its three goals and the strikes so far. */
export function CharterNote({ compact = false }: { compact?: boolean }) {
  const household = useStore(householdStore);
  const objects = useSceneObjects();
  const charter = charterOf(household);
  if (charter.outcome !== "active") {
    const grade = charterGrade(charter);
    return (
      <GameFrame material="paper" cut="box" padding="8px 12px" edgeWidth={0} shadow={false} tint="#d9f2e4" className="orbit-charter" role="status">
        <b className="orbit-charter-head"><GameIcon name="flag" size={15} /> {charter.outcome === "kept" ? `Charter kept · ${grade.word}` : "Evicted"}</b>
        <small>{grade.stars} of {grade.of} goals across the charter</small>
      </GameFrame>
    );
  }
  const term = TERMS[charter.term]!;
  const sheet = termGoals(household, objects);
  const dayOfTerm = household.day - charter.term * TERM_DAYS + 1;
  return (
    <GameFrame material="paper" cut="box" padding="8px 12px 9px" edgeWidth={0} shadow={false} tint="#e8f0ff" className="orbit-charter" role="region" aria-label="Habitat charter">
      <b className="orbit-charter-head">
        <GameIcon name="scroll" size={15} /> Term {charter.term + 1}/{TERMS.length} · {term.name}
        <span className="orbit-strikes" aria-label={`${charter.strikes} of ${STRIKES_TO_EVICT} strikes`}>
          {Array.from({ length: STRIKES_TO_EVICT }, (_, i) => <i key={i} className={i < charter.strikes ? "on" : ""} />)}
        </span>
      </b>
      <small>Day {Math.min(TERM_DAYS, dayOfTerm)} of {TERM_DAYS} · rent {rentFor(household)} a night · meet {GOALS_TO_PASS} of 3</small>
      {!compact && (
        <ul className="orbit-goals">
          {sheet.statuses.map((status, i) => {
            const goal = sheet.goals[i]!;
            return (
              <li key={goal.id} className={status.met ? "met" : ""} title={goal.hint}>
                <GameIcon name={status.met ? "check" : "hourglass"} size={13} />
                <span>{goal.label}</span>
                <em>{goal.metric === "debtFree" ? (status.met ? "clear" : "in debt") : `${Math.min(status.value, status.target)}/${status.target}`}</em>
              </li>
            );
          })}
        </ul>
      )}
    </GameFrame>
  );
}

/** A transmission slip from the Authority's relay: what happened, the household's answers and the time left. */
export function TransmissionSlip() {
  const household = useStore(householdStore);
  const clock = useGameClock();
  const { commands } = useGame();
  const pending: PendingIncident | null | undefined = household.incident;
  if (pending == null) return null;
  const def = incidentDef(pending.id);
  if (def?.choices === undefined) return null;
  const left = Math.max(0, pending.deadline - clock.now);
  return (
    <PaperNote tilt={-0.8} pin="#ff9e8c" padding="16px 18px 18px" className="orbit-transmission" role="alertdialog" aria-label={`Transmission: ${def.title}`}>
      <header className="orbit-transmission-head">
        <span className="orbit-transmission-icon"><GameIcon name={INCIDENT_ICON[def.id] ?? "flag"} size={22} /></span>
        <div><small>Incoming transmission</small><h2>{def.title}</h2></div>
      </header>
      <p>{def.text(household, pending)}</p>
      <div className="orbit-transmission-choices" role="group" aria-label="Answers">
        {def.choices.map((choice) => {
          const blocked = choice.blocked?.(household, pending) ?? null;
          const fallback = choice.id === def.fallback;
          return (
            <Enamel key={choice.id} as="button" tone={fallback ? "cream" : "mint"} radius={14} padding="7px 12px" className="orbit-choice" disabled={blocked !== null} onClick={() => commands.run("incident.answer", { choice: choice.id })}>
              <strong>{choice.label}</strong>
              <small>{blocked ?? choice.detail(household, pending)}{fallback ? " · default" : ""}</small>
            </Enamel>
          );
        })}
      </div>
      <div className="orbit-transmission-timer" role="timer" aria-label={`${Math.ceil(left)} seconds to answer`}>
        <i style={{ width: `${Math.min(100, (left / ANSWER_SECONDS) * 100)}%` }} />
      </div>
    </PaperNote>
  );
}

/** The Authority's letter at the close of a term, or the notice that ends the charter. */
export function TermLetter() {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const charter = charterOf(household);
  const review = charter.review;
  if (review === null) return null;
  const evicted = review.outcome === "evicted";
  const kept = review.outcome === "kept";
  const grade = charterGrade(charter);
  const title = evicted ? "Notice of eviction" : kept ? "Charter kept" : `Term ${review.term + 1} review`;
  return (
    <div className="orbit-letter-veil">
      <PaperNote tilt={0.6} pin={evicted ? "#ff6b7d" : "#9fe0c4"} torn padding="26px 28px 30px" className="orbit-letter" role="dialog" aria-label={title}>
        <small className="orbit-letter-from">Habitat Authority · Ring Four</small>
        <h2>{title}</h2>
        {review.reason !== undefined && <p className="orbit-warning">{review.reason}</p>}
        {review.met.length + review.missed.length > 0 && (
          <ul className="orbit-goals orbit-letter-goals">
            {review.met.map((label) => <li key={label} className="met"><GameIcon name="check" size={14} /><span>{label}</span></li>)}
            {review.missed.map((label) => <li key={label}><GameIcon name="cross" size={14} /><span>{label}</span></li>)}
          </ul>
        )}
        {!evicted && <p>Grant paid: <b>{review.grant} credits</b>.{review.strike ? " Fewer than two goals were met — the household carries a strike." : ""}</p>}
        {!evicted && !kept && <p>Next term: <b>{TERMS[review.term + 1]!.name}</b>. Rent rises to <b>{TERMS[review.term + 1]!.rent}</b> a night. Strikes: {charter.strikes} of {STRIKES_TO_EVICT}.</p>}
        {kept && <p>The household is <b>{grade.word}</b> on Ring Four: {grade.stars} of {grade.of} goals met across four terms. The habitat is yours to keep living in.</p>}
        {evicted && <p>The household met {grade.stars} of {grade.of} goals before the Authority closed the door. A new household can move in from the menu.</p>}
        <div className="orbit-letter-actions">
          {evicted
            ? <Enamel as="button" tone="coral" radius={16} padding="8px 16px" onClick={() => commands.run("orbit.pause", {})}><GameIcon name="menu" size={16} /> Back to the menu</Enamel>
            : <Enamel as="button" tone="mint" radius={16} padding="8px 16px" onClick={() => commands.run("charter.dismiss", {})}><GameIcon name="check" size={16} /> {kept ? "Keep living here" : "Carry on"}</Enamel>}
        </div>
      </PaperNote>
    </div>
  );
}
