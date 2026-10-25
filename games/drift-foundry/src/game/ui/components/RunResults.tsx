import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import type { SessionSnapshot } from "../../run/session";
import { PART_SLOTS } from "../../parts/catalog";
import { PartIcon } from "./PartIcon";
import { MedalBadge, MedalRow } from "./MedalBadge";

export function RunResults({ snapshot, onRestart, onTitle }: { snapshot: SessionSnapshot; onRestart: () => void; onTitle: () => void }) {
  const outcome = snapshot.outcome;
  if (!outcome) return null;
  const won = outcome.kind === "won";
  return <div className="df-overlay"><HudSurface className="df-card df-results" role="dialog" aria-label={won ? "Escape results" : "Crushed results"} elevation="modal">
    <div className="df-eyebrow">{won ? "PIT RADIO / SIGNAL RECEIVED" : "PIT RADIO / SIGNAL LOST"}</div>
    <h1>{won ? "OUT OF" : snapshot.track.label.toUpperCase()}<br/><em>{won ? "THE YARD" : "CAUGHT YOU"}</em></h1>
    <p>{won ? "The salvage special lives to race another shift." : `Caught in ${outcome.zoneLabel.toLowerCase()}. Watch the next barrier cue and jump on the teal marks.`}</p>
    <div className="df-result-grid"><div><b>{outcome.place}/{outcome.fieldSize}</b><span>FINISH</span></div><div><b>{outcome.time.toFixed(1)}s</b><span>RUN TIME</span></div><div><b>{won ? snapshot.track.exitAt : Math.max(0, Math.floor(snapshot.run))}m</b><span>DISTANCE</span></div><div><b>{[...snapshot.clearedGateIds].filter(id => !id.endsWith(":beaten")).length}/{snapshot.track.gates}</b><span>BARRIERS CLEARED</span></div><div><b>{outcome.armorSaves}</b><span>ARMOR SAVES</span></div><div><b>{outcome.carried} cr</b><span>SALVAGE CARRIED</span></div></div>
    <div className="df-result-grid"><div><b>{won ? `×${outcome.lineMultiplier.toFixed(2)}` : "×0.00"}</b><span>{won ? "LINE" : "LINE CUT"}</span></div><div><b>{outcome.banked} cr</b><span>BANKED</span></div><div><b>{outcome.lost} cr</b><span>LOST</span></div><div><b>{snapshot.career.credits} cr</b><span>YARD CREDITS</span></div></div>
    {won && outcome.lineNotes.length > 0 && <p className="df-eyebrow">{outcome.lineNotes.join(" · ")}</p>}
    <div className="df-event" data-medal={outcome.event.medal ?? undefined}>
      <div className="df-event-head"><span>{outcome.event.label.toUpperCase()}</span><b>{outcome.event.result ?? "NO RESULT"}</b>{outcome.event.newBest && outcome.event.result !== null ? <em>EVENT BEST</em> : null}<MedalRow held={outcome.event.medal} size={22} /></div>
      {outcome.event.firstTime.length > 0 && <div className="df-event-pay">{outcome.event.firstTime.map(entry => <span key={entry.medal}><MedalBadge medal={entry.medal} size={18} />FIRST {entry.medal.toUpperCase()} +{entry.credits} cr</span>)}</div>}
      {outcome.event.openedTiers.length > 0 && <p className="df-event-open" role="status">{outcome.event.openedTiers.join(", ").toUpperCase()} EVENTS NOW OPEN ON THE YARD CALENDAR</p>}
      <p className="df-event-next">{outcome.event.next === null ? "Every medal on this event is yours." : `Next: ${outcome.event.next.medal} - ${outcome.event.next.text}.`}</p>
    </div>
    <div className="df-field-order">{snapshot.race.standings.map(entry => <span key={entry.id} className={entry.id === "player" ? "df-you" : ""}><i>{entry.place}</i>{entry.name}{entry.id === "player" && !entry.finished ? (won ? " · RUNNING" : " · OUT") : ""}</span>)}</div>
    <div className="df-result-build">{PART_SLOTS.map(slot => <span key={slot}><PartIcon partId={snapshot.installed[slot]?.id ?? null}/>{snapshot.installed[slot]?.label ?? "Empty slot"}</span>)}</div>
    {won && snapshot.personalBest !== "unchanged" && <p className="df-eyebrow">{snapshot.personalBest === "first" ? "FIRST ESCAPE ON RECORD" : snapshot.personalBest === "improved" ? "NEW PERSONAL BEST" : "PERSONAL BEST MATCHED"}</p>}
    {outcome.nextShift && <p className="df-next-shift" role="status"><b>NEXT RUN · {outcome.nextShift.label}</b> {outcome.nextShift.hint}</p>}
    <p className="df-save-status" role="status">{snapshot.recordsSaved ? `${outcome.banked > 0 ? `${outcome.banked} cr banked. ` : ""}${snapshot.records.escapes} escape${snapshot.records.escapes === 1 ? "" : "s"} · best ${snapshot.records.bestTime?.toFixed(1) ?? "—"}s · ${snapshot.runsPlayed} run${snapshot.runsPlayed === 1 ? "" : "s"} settled` : "Record could not be saved in this browser. This result remains available until reload."}</p>
    <div className="df-actions"><HudButton variant="primary" className="df-primary" cue="confirm" onClick={onRestart}>RUN IT AGAIN <kbd>R</kbd></HudButton><HudButton onClick={onTitle}>BACK TO PIT</HudButton></div>
  </HudSurface></div>;
}
