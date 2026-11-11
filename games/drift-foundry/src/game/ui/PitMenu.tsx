/** @jsxImportSource @jgengine/core/ui/jsx */
import { type ReactNode, useEffect, useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { RuneElement } from "@jgengine/core/ui/rune/element";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useGameContext } from "@jgengine/ui/provider";
import { useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";
import { parkedRunMetres } from "../run/progress";
import { PART_SLOTS } from "../parts/catalog";
import { FOUNDRY_CREDITS } from "../credits";
import { foundrySlots, refreshFoundrySlots, saveParkedRunHere } from "../menuSave";
import type { RunSession, SessionSnapshot } from "../run/session";
import type { GarageRow } from "../career";
import { partArtwork } from "./artwork";
import { Button, DIM, FULL, GateSign, INK, Label, MedalRow, ORANGE, PEN, Row, SheetHead, Stamp, Stat, STENCIL, Stencil, Text, YELLOW } from "./pit";

/** Capture-only focus request: a shot declares which verb it wants open. */
export const menuFocus: { id: string | null } = { id: null };

const metres = (z: number) => `${Math.max(0, Math.floor(z))} m`;
interface Item { id: string; label: string; hint?: string; disabled?: boolean; secondary?: boolean }

/**
 * Drift Foundry's front end and pause board: the pit wall's stencilled plates beside the pit sheet.
 * A plate in focus shows its sheet; Continue, New run, Back to the run and Park act at once. On a phone
 * the sheet opens over the plates with a Back stamp.
 */
export function PitMenu({ snapshot, session, publish }: { snapshot: SessionSnapshot; session: RunSession; publish: () => void }) {
  const ctx = useGameContext();
  const { width, height } = useRuneViewport(), phone = width < 700;
  const slots = useSaveSlots(foundrySlots), recent = slots.find(slot => !slot.empty) ?? null;
  const parked = snapshot.parkedRun, title = snapshot.phase === "start", paused = !title;
  const [active, setActive] = useState(menuFocus.id ?? (title ? parked === null ? "new" : "continue" : "resume"));
  const [open, setOpen] = useState<string | null>(phone ? menuFocus.id : null);
  const [busy, setBusy] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const first = useRef<RuneElement>(null);
  useEffect(() => { refreshFoundrySlots(); }, [title, paused]);
  useEffect(() => { if (open === null) first.current?.focus(); }, [open, title]);

  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try { await Promise.all([work(), new Promise(resolve => setTimeout(resolve, 260))]); }
    finally { setBusy(null); }
  };
  const startRun = () => { session.start(); publish(); };
  const newRun = () => { session.restart(); publish(); };
  const resume = () => { session.togglePause(); publish(); };
  const parkHere = () => void whileLoading("Parking the run", async () => {
    const parkedNow = await saveParkedRunHere(ctx);
    publish();
    const at = session.snapshot().parkedRun;
    setNotice(parkedNow ? `Parked at ${metres(at === null ? 0 : parkedRunMetres(at))}` : "Stop on the ground first: a moving buggy cannot be parked");
  });
  const backToPit = () => void whileLoading("Parking the run", async () => { await saveParkedRunHere(ctx); session.returnToTitle(); publish(); });
  const pickEvent = (id: string) => {
    const result = session.selectEvent(id);
    publish();
    const label = snapshot.calendar.tiers.flatMap(tier => tier.events).find(entry => entry.event.id === id)?.event.label ?? id;
    setNotice(result.ok ? `${label} is on the run sheet` : result.reason ?? "The yard refused that event");
  };
  const buy = (slot: GarageRow["slot"]) => { const result = session.buyPart(slot); publish(); if (!result.ok) setNotice(result.reason ?? "The yard refused that part"); };

  const items: readonly Item[] = title ? [
    { id: "continue", label: "Continue run", hint: parked === null ? "No parked run at the pit" : `${metres(parkedRunMetres(parked))} / ${parked.runTime.toFixed(1)} s / ${parked.partIds.length} parts`, disabled: parked === null },
    { id: "new", label: "New run", hint: `${snapshot.event.label.toUpperCase()} @ ${snapshot.event.trackLabel.toUpperCase()} - ${snapshot.shift === null ? "clean shift" : snapshot.shift.label}` },
    { id: "calendar", label: "Yard calendar", hint: `${snapshot.calendar.points}/${snapshot.calendar.maxPoints} medal points` },
    { id: "garage", label: "Pit garage", hint: `${snapshot.career.credits} cr / standing ${snapshot.career.standing}` },
    { id: "records", label: "Corridor records", hint: snapshot.records.bestTime === null ? "No escape on record" : `Best ${snapshot.records.bestTime.toFixed(1)} s` },
    { id: "settings", label: "Settings", hint: "Picture, sound, controls" },
    { id: "credits", label: "Credits" },
  ] : [
    { id: "resume", label: "Back to the run", hint: snapshot.parkedRun === null ? "The buggy is still moving: stop on the ground to park it" : `Parked at ${metres(parkedRunMetres(snapshot.parkedRun))}` },
    { id: "save", label: "Park the run", hint: "Writes the build, the clock and the salvage it carries" },
    { id: "garage", label: "Pit garage", hint: `${snapshot.career.credits} cr banked` },
    { id: "settings", label: "Settings" },
    { id: "credits", label: "Credits" },
    { id: "title", label: "Park & back to the pit", secondary: true },
  ];
  const acts: Readonly<Record<string, () => void>> = { continue: startRun, new: newRun, resume, save: parkHere, title: backToPit };
  const select = (id: string) => { setActive(id); const act = acts[id]; if (act !== undefined) act(); else if (phone) setOpen(id); };
  const back = () => { if (open !== null) setOpen(null); else if (paused) resume(); };

  const detail = (id: string): ReactNode => {
    if (id === "continue") return <ContinuePane snapshot={snapshot} thumbnail={recent?.meta["thumbnail"]} meta={recent?.meta} onContinue={startRun} />;
    if (id === "new") return <NewRunPane snapshot={snapshot} />;
    if (id === "calendar") return <CalendarPane calendar={snapshot.calendar} onPick={pickEvent} />;
    if (id === "garage") return <GaragePane rows={snapshot.career.garage} credits={snapshot.career.credits} onBuy={buy} />;
    if (id === "records") return <RecordsPane snapshot={snapshot} />;
    if (id === "settings") return <PitSettings />;
    if (id === "credits") return <CreditsPane />;
    if (id === "resume") return <PitBoard snapshot={snapshot} hint="Esc or Back to the run puts the buggy back on the road where it stopped." />;
    if (id === "save") return <PitBoard snapshot={snapshot} hint={snapshot.pose.speedKmh > 1 || snapshot.pose.airborne ? "Stop on the ground first: a moving buggy cannot be parked." : "Parking writes the build, the clock and the salvage it carries. Continue picks it up from the pit."} />;
    return null;
  };
  const footer = notice ?? (title ? `${snapshot.records.escapes} escapes / ${snapshot.records.attempts} runs - ${snapshot.career.credits} cr banked` : `${snapshot.salvageAtRisk} cr at risk - ${snapshot.career.credits} cr banked`);
  const logo = title
    ? <GateSign lines={["DRIFT", "FOUNDRY"]} sub="ROW SIX · SALVAGE SPECIAL" size={phone ? 38 : height < 820 ? 40 : 56} />
    : <GateSign lines={["PIT STOP"]} sub={`${snapshot.zone.label.toUpperCase()} / ${metres(snapshot.pose.position[2])} / ${snapshot.runTime.toFixed(1)} s`} size={phone ? 30 : 40} />;
  const tagline = title ? "One welded buggy. Three yard karts ahead of you. A compactor that never stops." : "The buggy and the crusher stop with the clock while the board is out.";
  const focusId = menuFocus.id ?? (title ? parked === null ? "new" : "continue" : "resume");
  const primary = items.filter(item => item.secondary !== true), secondary = items.filter(item => item.secondary === true);
  const plates = <RuneView gap={phone ? 5 : 7} width={FULL}>
    {primary.map((item, index) => <Plate key={item.id} item={item} index={index} active={item.id === active} phone={phone} onFocus={() => { if (!phone) setActive(item.id); }} run={() => select(item.id)} {...(item.id === focusId ? { focusRef: first } : {})} />)}
    {secondary.length === 0 ? null : <RuneView height={6} width={FULL} fill="#f2c23088" />}
    {secondary.map(item => <Plate key={item.id} item={item} index={-1} active={item.id === active} phone={phone} onFocus={() => { if (!phone) setActive(item.id); }} run={() => select(item.id)} />)}
  </RuneView>;
  const sheet = (id: string) => <RuneView variant="sheet" color={PEN} width={FULL} maxHeight={phone ? height - 40 : height - 64} label={items.find(item => item.id === id)?.label ?? id}>
    <RuneView scroll gap={8} maxHeight={phone ? height - 130 : height - 100}>{detail(id)}</RuneView>
    {phone ? <Stamp label="Back" onPress={() => setOpen(null)}>BACK</Stamp> : null}
  </RuneView>;
  return <RuneView anchor="fill" fill={title ? "#0a0908a8" : "#0a0908c8"} modal onBack={back} label={title ? "Drift Foundry" : "The run is held"}>
    {phone && open !== null ? <RuneView anchor="fill" safe padding={12}>{sheet(open)}</RuneView> : phone ?
      <RuneView anchor="fill" safe padding={[18, 16, 16, 16]} gap={12}>
        {logo}
        <Text size={16} color={DIM}>{tagline}</Text>
        <RuneView scroll gap={6} maxHeight={height - 330}>{plates}</RuneView>
        <Label color={YELLOW}>{footer}</Label>
      </RuneView> :
      <RuneView anchor="fill" safe padding={[28, 32, 24, 40]} layout="row" gap={32} items="start">
        <RuneView width={Math.min(440, width * 0.38)} gap={12}>
          {logo}
          <Text size={18} color={DIM}>{tagline}</Text>
          <RuneView scroll maxHeight={height - (height < 820 ? 290 : 360)} width={FULL}>{plates}</RuneView>
          <Label color={YELLOW}>{footer}</Label>
        </RuneView>
        <RuneView grow={1} maxWidth={620}>{sheet(active)}</RuneView>
      </RuneView>}
    {busy === null ? null : <RuneView anchor="fill" fill="#0a0908b0" items="center" justify="center" role="status"><Stencil size={26} color={YELLOW}>{busy}</Stencil></RuneView>}
  </RuneView>;
}

/** A stencilled steel menu plate; the one you are on is painted hazard yellow with a striped edge. */
function Plate({ item, index, active, phone, onFocus, run, focusRef }: { item: Item; index: number; active: boolean; phone: boolean; onFocus: () => void; run: () => void; focusRef?: { current: RuneElement | null } | undefined }) {
  const ink = item.disabled === true ? "#ece3cc6b" : active ? "#141414" : INK;
  return <RuneAction variant="plate" label={item.label} width={FULL} run={run} onFocus={onFocus} disabled={item.disabled === true} {...(focusRef === undefined ? {} : { ref: focusRef })}
    {...(active ? { gradient: { angle: 90, stops: [[0, "#f8d75c"], [1, "#d8a81c"]] as const }, fill: YELLOW } : item.disabled === true ? { gradient: { angle: 90, stops: [[0, "#2a2e31"], [1, "#2a2e31"]] as const } } : {})}
    minHeight={item.secondary === true ? 38 : phone ? 42 : 46}>
    <Row gap={phone ? 10 : 14} width={FULL}>
      {active ? <RuneView width={8} height={phone ? 30 : 36} gradient={{ angle: 45, stops: [[0, "#141414"], [0.5, "#141414"], [0.5, YELLOW], [1, YELLOW]] }} /> : null}
      {index < 0 ? null : <Text family={STENCIL} size={15} color={active ? "#14141499" : YELLOW}>{String(index + 1).padStart(2, "0")}</Text>}
      <RuneView gap={1} grow={1}>
        <Text family={STENCIL} size={item.secondary === true ? 16 : phone ? 18 : 22} color={ink}>{item.label}</Text>
        {item.hint === undefined ? null : <Text size={phone ? 13 : 14} color={active ? "#141414c7" : "#ece3cca8"}>{item.hint}</Text>}
      </RuneView>
    </Row>
  </RuneAction>;
}

function ContinuePane({ snapshot, thumbnail, meta, onContinue }: { snapshot: SessionSnapshot; thumbnail: unknown; meta: Readonly<Record<string, unknown>> | undefined; onContinue: () => void }) {
  const parked = snapshot.parkedRun;
  const line = parked === null
    ? "No run is parked at the pit. The next engine start is a fresh corridor."
    : `${metres(parkedRunMetres(parked))} in with ${parked.partIds.length} of 4 parts bolted on and ${parked.runTime.toFixed(1)} s on the clock. The bank holds ${snapshot.career.credits} cr.`;
  return <>
    <SheetHead title="Continue run" tag={parked === null ? "empty" : "parked"} />
    {parked === null ? <Text color={PEN}>No run parked yet. Stop the buggy on the ground, pause and park it before you leave the corridor.</Text> : <>
      {typeof thumbnail === "string" ? <RuneView image={thumbnail} fit="cover" width={FULL} height={180} border={{ width: 2, color: PEN }} /> : null}
      {meta === undefined ? null : Object.entries(meta).filter(([key]) => key !== "thumbnail").map(([key, value]) => <Stat key={key} label={key} value={String(value)} />)}
      <Button label="Continue run" onPress={onContinue}>CONTINUE RUN</Button>
    </>}
    <Text size={15} color={PEN}>{line}</Text>
  </>;
}

/** The pit's New run pane: the run sheet clipped to the board before the engine turns over. */
function NewRunPane({ snapshot }: { snapshot: SessionSnapshot }) {
  const { shift, event } = snapshot, best = snapshot.records.bestTime;
  return <>
    <SheetHead title="New run" tag={<Row gap={6}><Label color={PEN}>{event.label}</Label><MedalRow held={event.medal} size={20} /></Row>} />
    <Label color={ORANGE}>{`${event.trackLabel.toUpperCase()} - ${event.trackBlurb}`}</Label>
    <Text color={PEN}>{`${event.blurb}${event.garage ? " Bolt on what you drive over; hold E to swap an engine or frame." : " The garage is shut: only route salvage bolts on."}`}</Text>
    <Text size={15} color={PEN}>{event.next === null ? "Every medal on this event is yours. Chase the clock." : `Next medal - ${event.next.medal}: ${event.next.text}.`}</Text>
    <Label color={ORANGE}>{shift === null ? "CLEAN SHIFT - nobody has changed the yard. Escape pays what the line earns." : `THIS RUN - ${shift.label}. ${shift.hint}`}</Label>
    <Text size={15} color={PEN}>{best === null ? `No escape on record yet. The gate at ${event.trackLength} m is the only income worth planning around.` : `Best escape ${best.toFixed(1)} s.`}</Text>
  </>;
}

/** The garage: one ladder rung per slot, priced in the credits the last escapes banked. */
function GaragePane({ rows, credits, onBuy }: { rows: readonly GarageRow[]; credits: number; onBuy: (slot: GarageRow["slot"]) => void }) {
  return <>
    <SheetHead title="Pit garage" tag={`${credits} cr banked`} />
    <Text size={15} color={PEN}>Buy the next rung of a slot's ladder; it bolts on for every run after this one.</Text>
    {rows.map(row => {
      const blocked = row.owned || row.locked || row.price === null || row.price > credits;
      return <Row key={row.slot} gap={10} width={FULL} padding={[6, 0, 6, 0]}>
        <RuneGlyph artwork={partArtwork(row.part?.id ?? null)} width={28} height={28} />
        <RuneView grow={1} gap={0}><Text family={STENCIL} size={17} color={PEN}>{row.part?.label ?? row.slot}</Text><Text size={14} color={PEN}>{row.owned ? "fully built" : row.locked ? `locked / needs ${row.needs} standing` : `${row.price} cr`}</Text></RuneView>
        <Stamp label={`Buy ${row.slot}`} disabled={blocked} onPress={() => onBuy(row.slot)}>{row.owned ? "BUILT" : row.locked ? `LOCKED ${row.needs}` : row.price !== null && row.price > credits ? `NEED ${row.price - credits}` : `BUY ${row.price}`}</Stamp>
      </Row>;
    })}
  </>;
}

/** The yard calendar: every event is the corridor under other rules, graded bronze to gold. */
function CalendarPane({ calendar, onPick }: { calendar: SessionSnapshot["calendar"]; onPick: (id: string) => void }) {
  return <>
    <SheetHead title="Yard calendar" tag={`${calendar.points}/${calendar.maxPoints} medal points`} />
    {calendar.tiers.map(tier => <RuneView key={tier.id} gap={4} opacity={tier.open ? 1 : 0.7}>
      <Row justify="between" width={FULL}><Text family={STENCIL} size={17} color={ORANGE}>{tier.label}</Text><Label color={PEN}>{tier.open ? "open" : `locked / ${tier.missing} more medal points`}</Label></Row>
      {tier.events.map(entry => <Row key={entry.event.id} gap={8} width={FULL} padding={[5, 6, 5, 6]} fill={entry.selected ? "#c8461a22" : "#00000000"}>
        <RuneView grow={1} gap={0}>
          <Row gap={6}><Text family={STENCIL} size={16} color={PEN}>{entry.event.label}</Text><Label color={PEN}>{entry.trackLabel}</Label></Row>
          <Text size={14} color={PEN}>{!entry.open ? entry.event.blurb : entry.next === null ? `best ${entry.best} - all medals held` : `${entry.best === null ? "no result yet" : `best ${entry.best}`} - ${entry.next.medal}: ${entry.next.text}`}</Text>
        </RuneView>
        <MedalRow held={entry.medal} size={20} />
        <Stamp label={`Race ${entry.event.label}`} disabled={!entry.open || entry.selected} onPress={() => onPick(entry.event.id)}>{entry.selected ? "ON THE SHEET" : entry.open ? "RACE IT" : "LOCKED"}</Stamp>
      </Row>)}
    </RuneView>)}
  </>;
}

/** The corridor's records, in the pit's words. */
function RecordsPane({ snapshot }: { snapshot: SessionSnapshot }) {
  const records = snapshot.records;
  return <>
    <SheetHead title="Corridor records" tag={`${snapshot.runsPlayed} runs settled`} />
    <Stat label="Best escape" value={records.bestTime === null ? "none" : `${records.bestTime.toFixed(1)} s`} />
    <Stat label="Escapes" value={String(records.escapes)} />
    <Stat label="Runs finished" value={String(records.attempts)} />
    <Stat label="Farthest" value={metres(records.farthest)} />
    <Text size={15} color={PEN}>Every settled run draws the next shift; the pit shows what the next engine start opens with.</Text>
  </>;
}

/** The pit board while the run is held: where the buggy stands and what it carries. */
function PitBoard({ snapshot, hint }: { snapshot: SessionSnapshot; hint: string }) {
  return <>
    <SheetHead title="Run held" tag={snapshot.zone.label} />
    <Stat label="Place" value={`P${snapshot.race.place}/${snapshot.race.total}`} />
    <Stat label="Distance" value={`${Math.max(0, Math.floor(snapshot.run))}/${snapshot.track.exitAt} m`} />
    <Stat label="Clock" value={`${snapshot.runTime.toFixed(1)} s`} />
    <Stat label="Compactor" value={`${Math.max(0, Math.round(snapshot.compactorGap))} m back`} warn={snapshot.compactorGap < 22} />
    <RuneView layout="grid" columns={2} gap={6} width={FULL}>{PART_SLOTS.map(slot => <Row key={slot} gap={6}>
      <RuneGlyph artwork={partArtwork(snapshot.installed[slot]?.id ?? null)} width={24} height={24} />
      <RuneView gap={0}><Label size={11} color={PEN}>{slot.toUpperCase()}</Label><Text size={15} color={PEN}>{snapshot.installed[slot]?.label ?? "empty"}</Text></RuneView>
    </Row>)}</RuneView>
    <Label color={ORANGE}>{`${snapshot.salvageAtRisk} cr riding on this run · ${snapshot.career.credits} cr banked`}</Label>
    <Text size={15} color={PEN}>{hint}</Text>
  </>;
}

function CreditsPane() {
  return <>
    <SheetHead title="Credits" />
    {FOUNDRY_CREDITS.sections.map(section => <RuneView key={section.heading} gap={3} padding={[4, 0, 4, 0]}>
      <Text family={STENCIL} size={16} color={ORANGE}>{section.heading}</Text>
      {section.entries.map(entry => <Text key={entry.label} size={14} color={PEN}>{[entry.label, entry.detail, entry.href].filter(Boolean).join(" · ")}</Text>)}
    </RuneView>)}
    <Text size={14} color={PEN}>{FOUNDRY_CREDITS.notice}</Text>
  </>;
}

/** Picture, sound and controls written on the pit sheet: divider tabs, ruled rows, ink stamps. */
export function PitSettings() {
  const settings = useSettings(), [chosen, setChosen] = useState<string | null>(null), [armed, setArmed] = useState<string | null>(null);
  const active = settings.categories.find(c => c.id === chosen) ?? settings.categories[0];
  return <RuneView gap={10} {...(armed === null ? {} : { onKey: (code: string) => {
    if (code !== "Escape") active?.keybinds.find(k => k.action === armed)?.rebind(code);
    setArmed(null);
  } })}>
    <SheetHead title="Pit settings" tag="Picture · sound · controls" />
    <RuneView layout="grid" columns={4} responsive={{ phone: { columns: 3 } }} gap={4}>{settings.categories.map(c => <RuneAction key={c.id} label={c.label} variant="stamp" fill={c === active ? PEN : "#2a241918"} color={c === active ? "#f6eedb" : PEN} run={() => setChosen(c.id)}>{c.label}</RuneAction>)}</RuneView>
    {active?.rows.map(row => <Setting key={row.id} row={row} />)}
    {active?.keybinds.map(k => <Row key={k.action} gap={6} width={FULL}><Text grow={1} color={PEN}>{k.label}</Text>
      <Stamp label={`Rebind ${k.label}`} disabled={k.locked === true} onPress={() => setArmed(k.action)}>{armed === k.action ? "Press key / Esc" : k.bindingLabel}</Stamp>
      <Stamp label={`Reset ${k.label}`} disabled={k.locked === true || k.isDefault} onPress={k.reset}>Reset</Stamp></Row>)}
    {settings.actions.map(a => <Stamp key={a.id} label={a.label} fill={a.kind === "danger" ? ORANGE : PEN} onPress={a.run}>{a.label}</Stamp>)}
  </RuneView>;
}

function Setting({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 1, fraction = useRef((Number(row.value) - min) / Math.max(1e-6, max - min));
  fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min);
  const shown = row.kind === "toggle" ? row.value ? "On" : "Off" : row.options?.find(o => o.value === row.value)?.label ?? String(row.value);
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  const value = () => min + fraction.current * (max - min);
  return <RuneView gap={4} padding={[4, 0, 6, 0]}>
    <Row justify="between" width={FULL}><Text grow={1} color={PEN}>{row.label}</Text>
      {row.kind === "slider" ? <Text family={STENCIL} size={16} color={ORANGE} text={bind(() => row.format?.(value()) ?? value().toFixed(2))} /> : null}</Row>
    {row.kind !== "slider" ? <Stamp label={row.label} fill={row.kind === "toggle" && row.value === true ? ORANGE : PEN} onPress={() => adjust(1)} onAdjust={adjust}>{`${shown} ›`}</Stamp> :
      <RuneAction label={row.label} height={30} fill="#2a241926" border={{ width: 2, color: PEN }} padding={[9, 0, 9, 0]} onAdjust={adjust} onDrag={d => {
        if (d.cancelled) { fraction.current = (Number(row.value) - min) / (max - min); return; }
        fraction.current = Math.max(0, Math.min(1, d.x / Math.max(1, d.width)));
        if (d.phase === "up") row.set(Math.min(max, Math.max(min, min + Math.round((value() - min) / (row.step ?? 1)) * (row.step ?? 1))));
      }}><RuneView height={8} fill={ORANGE} width={bind(() => ({ fraction: fraction.current }))} /></RuneAction>}
  </RuneView>;
}
