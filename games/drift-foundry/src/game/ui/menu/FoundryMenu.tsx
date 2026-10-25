import { type ReactNode, useEffect, useState } from "react";
import { parkedRunMetres } from "../../run/progress";
import { ContinuePane, CreditsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGameContext } from "@jgengine/react/provider";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { GameFrame } from "@jgengine/react/gameFrame";
import { gameFontStacks } from "@jgengine/react/gameFonts";
import { GAME_FONTS } from "../../../art/fonts/fonts";
import { plate } from "../DashHud";
import { PartIcon } from "../components/PartIcon";
import { MedalRow } from "../components/MedalBadge";
import { PART_SLOTS } from "../../parts/catalog";

import { FOUNDRY_CREDITS } from "../../credits";
import { foundrySlots, refreshFoundrySlots, saveParkedRunHere } from "../../menuSave";
import type { RunSession, SessionSnapshot } from "../../run/session";
import type { GarageRow } from "../../career";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

const FONTS = gameFontStacks(GAME_FONTS);

/** The pit wall's chrome the kit does not draw (header, footer, tint), handed over as CSS tokens. */
const MENU_TOKENS = {
  "--jg-accent": "#f2c230",
  "--jg-accent-soft": "rgba(242,194,48,0.22)",
  "--jg-accent-glow": "rgba(242,194,48,0.3)",
  "--jg-text": "#f1e8d2",
  "--jg-text-dim": "rgba(236,227,204,0.72)",
  "--jg-font-display": FONTS.fontDisplay,
  "--jg-font-body": FONTS.fontBody,
  "--jg-menu-logo-size": "clamp(30px, 4.6vw, 66px)",
  "--jg-menu-card-radius": "0px",
} as const;

/** The factory gate's sign: stencilled steel between two hazard bands. */
function GateLogo({ lines, sub, small = false }: { lines: readonly string[]; sub: ReactNode; small?: boolean }): ReactNode {
  return (
    <GameFrame material="steel" cut="notch" depth={small ? 10 : 14} tint="#454c50" {...plate("#0b0d0e")} padding="0" className={`fd-rimmed fd-gate-sign${small ? " fd-gate-sign-small" : ""}`}>
      <span className="fd-gate-band" aria-hidden="true" />
      <span className="fd-gate-word">{lines.map((line) => <span key={line}>{line}</span>)}</span>
      <span className="fd-gate-sub">{sub}</span>
      <span className="fd-gate-band" aria-hidden="true" />
    </GameFrame>
  );
}

/** A sheet heading, stencilled like a crate side. */
function SheetHead({ children, tag }: { children: ReactNode; tag?: ReactNode }): ReactNode {
  return <div className="fd-sheet-head"><span className="fd-sheet-title">{children}</span>{tag === undefined ? null : <span className="fd-sheet-tag">{tag}</span>}</div>;
}

function metres(z: number): string {
  return `${Math.max(0, Math.floor(z))} m`;
}

/** The pit's New run pane: the run sheet clipped to the board before the engine turns over. */
function NewRunPane({ shift, best, event }: { shift: SessionSnapshot["shift"]; best: number | null; event: SessionSnapshot["event"] }): ReactNode {
  return (
    <div data-new-run-pane="" className="fd-sheet">
      <SheetHead tag={<span className="fd-sheet-medals">{event.label}<MedalRow held={event.medal} size={20} /></span>}>New run</SheetHead>
      <p className="fd-sheet-stamp" data-track={event.track}>{event.trackLabel.toUpperCase()} - {event.trackBlurb}</p>
      <p className="fd-sheet-line">{event.blurb}{event.garage ? " Bolt on what you drive over; hold E to swap an engine or frame." : " The garage is shut: only route salvage bolts on."}</p>
      <p className="fd-sheet-note">{event.next === null ? "Every medal on this event is yours. Chase the clock." : `Next medal - ${event.next.medal}: ${event.next.text}.`}</p>
      <p data-new-run-shift="" className="fd-sheet-stamp">
        {shift === null ? "CLEAN SHIFT - nobody has changed the yard. Escape pays what the line earns." : `THIS RUN - ${shift.label}. ${shift.hint}`}
      </p>
      <p className="fd-sheet-note">
        {best === null ? `No escape on record yet. The gate at ${event.trackLength} m is the only income worth planning around.` : `Best escape ${best.toFixed(1)} s.`}
      </p>
    </div>
  );
}

/** The garage: one ladder rung per slot, priced in the credits the last escapes banked. */
function GaragePane({ rows, credits, onBuy }: { rows: readonly GarageRow[]; credits: number; onBuy: (slot: GarageRow["slot"]) => void }): ReactNode {
  return (
    <div data-garage-pane="" className="fd-sheet fd-sheet-scroll">
      <SheetHead tag={`${credits} cr banked`}>Pit garage</SheetHead>
      <p className="fd-sheet-note">Buy the next rung of a slot's ladder; it bolts on for every run after this one.</p>
      {rows.map((row) => {
        const blocked = row.owned || row.locked || row.price === null || row.price > credits;
        return (
          <div key={row.slot} className="fd-sheet-row">
            <div className="fd-sheet-row-text">
              <strong>{row.part?.label ?? row.slot}</strong>
              <small>{row.owned ? "fully built" : row.locked ? `locked / needs ${row.needs} standing` : `${row.price} cr`}</small>
            </div>
            <button type="button" className="fd-stamp-btn" data-garage-buy={row.slot} disabled={blocked} onClick={() => onBuy(row.slot)}>
              {row.owned ? "BUILT" : row.locked ? `LOCKED ${row.needs}` : row.price !== null && row.price > credits ? `NEED ${row.price - credits}` : `BUY ${row.price}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The yard calendar: every event is the corridor under other rules, graded bronze to gold. Medals
 * add up to points, and points open the next tier of events.
 */
function CalendarPane({ calendar, onPick }: { calendar: SessionSnapshot["calendar"]; onPick: (id: string) => void }): ReactNode {
  return (
    <div data-calendar-pane="" className="fd-sheet fd-sheet-scroll">
      <SheetHead tag={`${calendar.points}/${calendar.maxPoints} medal points`}>Yard calendar</SheetHead>
      {calendar.tiers.map((tier) => (
        <section key={tier.id} className="fd-cal-tier" data-open={tier.open ? "" : undefined}>
          <h3 className="fd-cal-tier-head"><span>{tier.label}</span><small>{tier.open ? "open" : `locked / ${tier.missing} more medal points`}</small></h3>
          {tier.events.map((entry) => (
            <div key={entry.event.id} className="fd-sheet-row fd-cal-row" data-selected={entry.selected ? "" : undefined}>
              <div className="fd-sheet-row-text">
                <strong>{entry.event.label} <small className="fd-cal-track">{entry.trackLabel}</small></strong>
                <small>{!entry.open ? entry.event.blurb : entry.next === null ? `best ${entry.best} - all medals held` : `${entry.best === null ? "no result yet" : `best ${entry.best}`} - ${entry.next.medal}: ${entry.next.text}`}</small>
              </div>
              <MedalRow held={entry.medal} size={24} />
              <button type="button" className="fd-stamp-btn" data-event-pick={entry.event.id} disabled={!entry.open || entry.selected} onClick={() => onPick(entry.event.id)}>
                {entry.selected ? "ON THE SHEET" : entry.open ? "RACE IT" : "LOCKED"}
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** The corridor's records, in the pit's words. */
function RecordsPane({ snapshot }: { snapshot: SessionSnapshot }): ReactNode {
  const records = snapshot.records;
  return (
    <div data-records-pane="" className="fd-sheet">
      <SheetHead tag={`${snapshot.runsPlayed} runs settled`}>Corridor records</SheetHead>
      <dl className="fd-sheet-stats">
        {[
          ["Best escape", records.bestTime === null ? "none" : `${records.bestTime.toFixed(1)} s`],
          ["Escapes", `${records.escapes}`],
          ["Runs finished", `${records.attempts}`],
          ["Farthest", metres(records.farthest)],
        ].map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <p className="fd-sheet-note">Every settled run draws the next shift; the pit shows what the next engine start opens with.</p>
    </div>
  );
}

/** The pit board while the run is held: where the buggy stands and what it carries. */
function PitBoard({ snapshot, hint }: { snapshot: SessionSnapshot; hint: string }): ReactNode {
  return (
    <div data-pit-board="" className="fd-sheet">
      <SheetHead tag={snapshot.zone.label}>Run held</SheetHead>
      <dl className="fd-sheet-stats">
        <div><dt>Place</dt><dd>P{snapshot.race.place}<small>/{snapshot.race.total}</small></dd></div>
        <div><dt>Distance</dt><dd>{Math.max(0, Math.floor(snapshot.run))}<small>/{snapshot.track.exitAt} m</small></dd></div>
        <div><dt>Clock</dt><dd>{snapshot.runTime.toFixed(1)}<small>s</small></dd></div>
        <div data-warn={snapshot.compactorGap < 22 ? "" : undefined}><dt>Compactor</dt><dd>{Math.max(0, Math.round(snapshot.compactorGap))}<small>m back</small></dd></div>
      </dl>
      <div className="fd-sheet-build">
        {PART_SLOTS.map((slot) => (
          <span key={slot} data-empty={snapshot.installed[slot] === null ? "" : undefined}><PartIcon partId={snapshot.installed[slot]?.id ?? null} /><span><small>{slot}</small>{snapshot.installed[slot]?.label ?? "empty"}</span></span>
        ))}
      </div>
      <p className="fd-sheet-stamp">{snapshot.salvageAtRisk} cr riding on this run · {snapshot.career.credits} cr banked</p>
      <p className="fd-sheet-note">{hint}</p>
    </div>
  );
}

/** Preferences and the shell's own settings, in the same pane. */
function PitSettings(): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-pit-settings="" className="fd-sheet fd-sheet-fill">
      <SheetHead tag="Picture · sound · controls">Pit settings</SheetHead>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {active === null ? null : <SettingsSection category={active} heading={false} />}
      </div>
    </div>
  );
}

/**
 * Drift Foundry's front end: the shared game menu over the yard, in its own words - the pit, the
 * corridor, the build. Continue resumes the parked run with its parts and the credits it carries.
 */
export function FoundryMenu({ snapshot, session, publish }: { snapshot: SessionSnapshot; session: RunSession; publish: () => void }): ReactNode {
  const ctx = useGameContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = foundrySlots.mostRecent();
  const parked = snapshot.parkedRun;
  const title = snapshot.phase === "start";
  const paused = snapshot.phase === "running" && snapshot.paused;

  useEffect(() => { refreshFoundrySlots(); }, [title, paused]);

  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]);
    } finally {
      setBusy(null);
    }
  };

  const startRun = () => {
    session.start();
    publish();
  };

  const newRun = () => {
    session.restart();
    publish();
  };

  const resume = () => {
    session.togglePause();
    publish();
  };

  const parkHere = () =>
    whileLoading("Parking the run", async () => {
      const parkedNow = await saveParkedRunHere(ctx);
      publish();
      setNotice(parkedNow ? `Parked at ${metres(parked === null ? 0 : parkedRunMetres(parked))}` : "Stop on the ground first: a moving buggy cannot be parked");
    });

  const backToPit = () =>
    whileLoading("Parking the run", async () => {
      await saveParkedRunHere(ctx);
      session.returnToTitle();
      publish();
    });

  const pickEvent = (id: string) => {
    const result = session.selectEvent(id);
    publish();
    const label = snapshot.calendar.tiers.flatMap((tier) => tier.events).find((entry) => entry.event.id === id)?.event.label ?? id;
    setNotice(result.ok ? `${label} is on the run sheet` : result.reason ?? "The yard refused that event");
  };

  const buy = (slot: GarageRow["slot"]) => {
    const result = session.buyPart(slot);
    publish();
    if (!result.ok) setNotice(result.reason ?? "The yard refused that part");
  };

  const continueLine = parked === null
    ? "No run is parked at the pit. The next engine start is a fresh corridor."
    : `${metres(parkedRunMetres(parked))} in with ${parked.partIds.length} of 4 parts bolted on and ${parked.runTime.toFixed(1)} s on the clock. The bank holds ${snapshot.career.credits} cr.`;

  const titleMenu = (
    <GameMenu
      open={title}
      label="Drift Foundry"
      initialId={menuFocus.id ?? (recent === null ? "new" : "continue")}
      className="fd-pitwall"
      logo={{ text: <GateLogo lines={["DRIFT", "FOUNDRY"]} sub="Row Six · salvage special" />, title: "Drift Foundry" }}
      tagline="One welded buggy. Three yard karts ahead of you. A compactor that never stops."
      items={[
        { id: "continue", label: "Continue run", hint: parked === null ? "No parked run at the pit" : `${metres(parkedRunMetres(parked))} / ${parked.runTime.toFixed(1)} s / ${parked.partIds.length} parts`, disabled: parked === null },
        { id: "new", label: "New run", hint: `${snapshot.event.label.toUpperCase()} @ ${snapshot.event.trackLabel.toUpperCase()} - ${snapshot.shift === null ? "clean shift" : snapshot.shift.label}` },
        { id: "calendar", label: "Yard calendar", hint: `${snapshot.calendar.points}/${snapshot.calendar.maxPoints} medal points` },
        { id: "garage", label: "Pit garage", hint: `${snapshot.career.credits} cr / standing ${snapshot.career.standing}` },
        { id: "records", label: "Corridor records", hint: snapshot.records.bestTime === null ? "No escape on record" : `Best ${snapshot.records.bestTime.toFixed(1)} s` },
        { id: "settings", label: "Settings", hint: "Picture, sound, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return (
            <div className="fd-sheet">
              <ContinuePane
                slot={recent}
                emptyMessage="No run parked yet. Stop the buggy on the ground, pause and park it before you leave the corridor."
                onContinue={() => startRun()}
              />
              <p data-continue-run="" className="fd-sheet-note">{continueLine}</p>
            </div>
          );
        }
        if (id === "new") return <NewRunPane shift={snapshot.shift} best={snapshot.records.bestTime} event={snapshot.event} />;
        if (id === "calendar") return <CalendarPane calendar={snapshot.calendar} onPick={pickEvent} />;
        if (id === "garage") return <GaragePane rows={snapshot.career.garage} credits={snapshot.career.credits} onBuy={buy} />;
        if (id === "records") return <RecordsPane snapshot={snapshot} />;
        if (id === "settings") return <PitSettings />;
        if (id === "credits") return <CreditsPane sections={FOUNDRY_CREDITS.sections} notice={FOUNDRY_CREDITS.notice} heading="Credits" />;
        return null;
      }}
      onSelect={(id) => {
        if (id === "continue") startRun();
        else if (id === "new") newRun();
      }}
      footer={<span className="fd-pitwall-foot">{notice ?? `${snapshot.records.escapes} escapes / ${snapshot.records.attempts} runs - ${snapshot.career.credits} cr banked`}</span>}
      style={MENU_TOKENS}
    />
  );

  const pauseMenu = (
    <GamePauseMenu
      open={paused}
      label="The run is held"
      onBack={resume}
      onResume={resume}
      className="fd-pitwall"
      logo={{ text: <GateLogo small lines={["PIT STOP"]} sub={`${snapshot.zone.label} / ${metres(snapshot.pose.position[2])} / ${snapshot.runTime.toFixed(1)} s`} />, title: "The run is held" }}
      tagline="The buggy and the crusher stop with the clock while the board is out."
      items={[
        { id: "resume", label: "Back to the run", hint: snapshot.parkedRun === null ? "The buggy is still moving: stop on the ground to park it" : `Parked at ${metres(parkedRunMetres(snapshot.parkedRun))}` },
        { id: "save", label: "Park the run", hint: "Writes the build, the clock and the salvage it carries" },
        { id: "garage", label: "Pit garage", hint: `${snapshot.career.credits} cr banked` },
        { id: "settings", label: "Settings" },
        { id: "credits", label: "Credits" },
      ]}
      secondary={[{ id: "title", label: "Park & back to the pit" }]}
      detail={(id) =>
        id === "resume" ? <PitBoard snapshot={snapshot} hint="Esc or Back to the run puts the buggy back on the road where it stopped." />
          : id === "save" ? <PitBoard snapshot={snapshot} hint={snapshot.pose.speedKmh > 1 || snapshot.pose.airborne ? "Stop on the ground first: a moving buggy cannot be parked." : "Parking writes the build, the clock and the salvage it carries. Continue picks it up from the pit."} />
          : id === "garage" ? <GaragePane rows={snapshot.career.garage} credits={snapshot.career.credits} onBuy={buy} />
          : id === "settings" ? <PitSettings />
            : id === "credits" ? <CreditsPane sections={FOUNDRY_CREDITS.sections} notice={FOUNDRY_CREDITS.notice} heading="Credits" />
              : null
      }
      onSelect={(id) => {
        if (id === "resume") resume();
        else if (id === "save") void parkHere();
        else if (id === "title") void backToPit();
      }}
      footer={<span className="fd-pitwall-foot">{notice ?? `${snapshot.salvageAtRisk} cr at risk - ${snapshot.career.credits} cr banked`}</span>}
      style={MENU_TOKENS}
    />
  );

  return (
    <div className="fd-menu">
      {titleMenu}
      {pauseMenu}
      {busy !== null && <div className="fd-menu-busy" role="status" aria-live="polite"><span>{busy}</span></div>}
    </div>
  );
}
