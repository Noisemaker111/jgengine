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
import { useStore } from "@jgengine/ui/store";
import { menuPaneStore } from "../gameCommands";
import type { RunSession, SessionSnapshot } from "../run/session";
import type { CorralRow, GarageRow } from "../career";
import type { ChassisId } from "../cart/chassis";
import { partArtwork } from "./artwork";
import { Button, DIM, FULL, GateSign, INK, Label, MedalRow, ORANGE, PEN, Row, SheetHead, Stamp, Stat, STENCIL, Stencil, Text, YELLOW } from "./pit";

/** Capture-only focus request: a shot declares which verb it wants open. */
export const menuFocus: { id: string | null } = { id: null };

const metres = (z: number) => `${Math.max(0, Math.floor(z))} m`;
const SLOT_LABEL: Readonly<Record<string, string>> = { engine: "PUSH", front: "BUMPER", wheels: "CASTERS", frame: "BASKET" };
interface Item { id: string; label: string; hint?: string; disabled?: boolean; secondary?: boolean }

/**
 * Cleanup on Aisle 9's front end and pause board: the customer-service desk's aisle-sign plates beside
 * the receipt. A plate in focus shows its receipt; Continue, New run, Back to the run and Park act at
 * once. On a phone the receipt opens over the plates with a Back stamp.
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
  // A `menu.pane` command (a proof, a flow, a capture) puts its pane up the way choosing it does.
  const commanded = useStore(menuPaneStore);
  useEffect(() => { if (commanded !== null && commanded !== undefined) { setActive(commanded); if (phone) setOpen(commanded); } }, [commanded, phone]);

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
    setNotice(parkedNow ? `Parked at ${metres(at === null ? 0 : parkedRunMetres(at))}` : "Stop on the floor first: a rolling cart cannot be parked");
  });
  const backToPit = () => void whileLoading("Parking the run", async () => { await saveParkedRunHere(ctx); session.returnToTitle(); publish(); });
  const pickEvent = (id: string) => {
    const result = session.selectEvent(id);
    publish();
    const label = snapshot.calendar.tiers.flatMap(tier => tier.events).find(entry => entry.event.id === id)?.event.label ?? id;
    setNotice(result.ok ? `${label} is on the shopping list` : result.reason ?? "The store refused that event");
  };
  const buy = (slot: GarageRow["slot"]) => { const result = session.buyPart(slot); publish(); if (!result.ok) setNotice(result.reason ?? "Customer service refused that mod"); };
  const chooseCart = (id: ChassisId) => { const result = session.chooseChassis(id); publish(); setNotice(result.ok ? `${snapshot.corral.find(row => row.chassis.id === id)?.chassis.label ?? id} is waiting by the doors` : result.reason ?? "The corral refused that cart"); };

  const items: readonly Item[] = title ? [
    { id: "continue", label: "Continue run", hint: parked === null ? "No cart parked at customer service" : `${metres(parkedRunMetres(parked))} / ${parked.runTime.toFixed(1)} s / ${(parked.basketIds?.length ?? 0)} items`, disabled: parked === null },
    { id: "new", label: "New run", hint: `${snapshot.event.label.toUpperCase()} @ ${snapshot.event.trackLabel.toUpperCase()} - ${snapshot.shift === null ? "a quiet closing" : snapshot.shift.label}` },
    { id: "calendar", label: "Weekly circular", hint: `${snapshot.calendar.points}/${snapshot.calendar.maxPoints} medal points` },
    { id: "corral", label: "Cart corral", hint: `${snapshot.chassis.label} / ${snapshot.corral.filter(row => row.owned).length} of ${snapshot.corral.length} carts` },
    { id: "garage", label: "Customer service", hint: `$${snapshot.career.credits} store credit / loyalty ${snapshot.career.standing}` },
    { id: "records", label: "Store records", hint: snapshot.records.bestTime === null ? "No checkout on record" : `Best ${snapshot.records.bestTime.toFixed(1)} s` },
    { id: "settings", label: "Settings", hint: "Picture, sound, controls" },
    { id: "credits", label: "Credits" },
  ] : [
    { id: "resume", label: "Back to the run", hint: snapshot.parkedRun === null ? "The cart is still rolling: stop on the floor to park it" : `Parked at ${metres(parkedRunMetres(snapshot.parkedRun))}` },
    { id: "save", label: "Park the cart", hint: "Writes the mods, the clock and the shopping in the basket" },
    { id: "garage", label: "Customer service", hint: `$${snapshot.career.credits} store credit` },
    { id: "settings", label: "Settings" },
    { id: "credits", label: "Credits" },
    { id: "title", label: "Park & back to customer service", secondary: true },
  ];
  const acts: Readonly<Record<string, () => void>> = { continue: startRun, new: newRun, resume, save: parkHere, title: backToPit };
  const select = (id: string) => { setActive(id); const act = acts[id]; if (act !== undefined) act(); else if (phone) setOpen(id); };
  const back = () => { if (open !== null) setOpen(null); else if (paused) resume(); };

  const detail = (id: string): ReactNode => {
    if (id === "continue") return <ContinuePane snapshot={snapshot} thumbnail={recent?.meta["thumbnail"]} meta={recent?.meta} onContinue={startRun} />;
    if (id === "new") return <NewRunPane snapshot={snapshot} />;
    if (id === "calendar") return <CalendarPane calendar={snapshot.calendar} onPick={pickEvent} />;
    if (id === "garage") return <GaragePane rows={snapshot.career.garage} credits={snapshot.career.credits} onBuy={buy} />;
    if (id === "corral") return <CorralPane rows={snapshot.corral} credits={snapshot.career.credits} onChoose={chooseCart} />;
    if (id === "records") return <RecordsPane snapshot={snapshot} />;
    if (id === "settings") return <PitSettings />;
    if (id === "credits") return <CreditsPane />;
    if (id === "resume") return <PitBoard snapshot={snapshot} hint="Esc or Back to the run puts the cart back in the aisle where it stopped." />;
    if (id === "save") return <PitBoard snapshot={snapshot} hint={snapshot.pose.speedKmh > 1 || snapshot.pose.airborne ? "Stop on the floor first: a rolling cart cannot be parked." : "Parking writes the mods, the clock and the shopping in the basket. Continue picks it up from customer service."} />;
    return null;
  };
  const footer = notice ?? (title ? `${snapshot.records.escapes} checkouts / ${snapshot.records.attempts} runs - $${snapshot.career.credits} store credit` : `$${snapshot.salvageAtRisk} at risk - $${snapshot.career.credits} store credit`);
  const logo = title
    ? <GateSign lines={["CLEANUP ON", "AISLE 9"]} sub="THE STORE IS NOW CLOSING" size={phone ? 34 : height < 820 ? 38 : 50} />
    : <GateSign lines={["PRICE CHECK"]} sub={`${snapshot.zone.label.toUpperCase()} / ${metres(snapshot.run)} / ${snapshot.runTime.toFixed(1)} s`} size={phone ? 30 : 40} />;
  const tagline = title ? "One shopping cart. Three late shoppers. Shutters coming down behind you. Grab what you can and make the self-checkout." : "The cart and the shutters stop with the clock while the board is out.";
  const focusId = menuFocus.id ?? (title ? parked === null ? "new" : "continue" : "resume");
  const primary = items.filter(item => item.secondary !== true), secondary = items.filter(item => item.secondary === true);
  const plates = <RuneView gap={phone ? 5 : 7} width={FULL}>
    {primary.map((item, index) => <Plate key={item.id} item={item} index={index} active={item.id === active} phone={phone} onFocus={() => { if (!phone) setActive(item.id); }} run={() => select(item.id)} {...(item.id === focusId ? { focusRef: first } : {})} />)}
    {secondary.length === 0 ? null : <RuneView height={6} width={FULL} fill="#ffd21e88" />}
    {secondary.map(item => <Plate key={item.id} item={item} index={-1} active={item.id === active} phone={phone} onFocus={() => { if (!phone) setActive(item.id); }} run={() => select(item.id)} />)}
  </RuneView>;
  const sheet = (id: string) => <RuneView variant="sheet" color={PEN} width={FULL} maxHeight={phone ? height - 40 : height - 64} label={items.find(item => item.id === id)?.label ?? id}>
    <RuneView scroll gap={8} maxHeight={phone ? height - 130 : height - 100}>{detail(id)}</RuneView>
    {phone ? <Stamp label="Back" onPress={() => setOpen(null)}>BACK</Stamp> : null}
  </RuneView>;
  return <RuneView anchor="fill" fill={title ? "#0a1430a0" : "#0a1430c0"} modal onBack={back} label={title ? "Cleanup on Aisle 9" : "The run is held"}>
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
    {busy === null ? null : <RuneView anchor="fill" fill="#0a1430b0" items="center" justify="center" role="status"><Stencil size={26} color={YELLOW}>{busy}</Stencil></RuneView>}
  </RuneView>;
}

/** An aisle-sign menu plate; the one you are on is painted sale yellow with a striped edge. */
function Plate({ item, index, active, phone, onFocus, run, focusRef }: { item: Item; index: number; active: boolean; phone: boolean; onFocus: () => void; run: () => void; focusRef?: { current: RuneElement | null } | undefined }) {
  const ink = item.disabled === true ? "#fbf7ee6b" : active ? "#141414" : INK;
  return <RuneAction variant="plate" label={item.label} width={FULL} run={run} onFocus={onFocus} disabled={item.disabled === true} {...(focusRef === undefined ? {} : { ref: focusRef })}
    {...(active ? { gradient: { angle: 90, stops: [[0, "#ffe066"], [1, "#f2b81c"]] as const }, fill: YELLOW } : item.disabled === true ? { gradient: { angle: 90, stops: [[0, "#2a3a66"], [1, "#2a3a66"]] as const } } : {})}
    minHeight={item.secondary === true ? 38 : phone ? 42 : 46}>
    <Row gap={phone ? 10 : 14} width={FULL}>
      {active ? <RuneView width={8} height={phone ? 30 : 36} gradient={{ angle: 45, stops: [[0, "#141414"], [0.5, "#141414"], [0.5, YELLOW], [1, YELLOW]] }} /> : null}
      {index < 0 ? null : <Text family={STENCIL} size={15} color={active ? "#14141499" : YELLOW}>{String(index + 1).padStart(2, "0")}</Text>}
      <RuneView gap={1} grow={1}>
        <Text family={STENCIL} size={item.secondary === true ? 16 : phone ? 18 : 22} color={ink}>{item.label}</Text>
        {item.hint === undefined ? null : <Text size={phone ? 13 : 14} color={active ? "#141414c7" : "#fbf7eeb8"}>{item.hint}</Text>}
      </RuneView>
    </Row>
  </RuneAction>;
}

function ContinuePane({ snapshot, thumbnail, meta, onContinue }: { snapshot: SessionSnapshot; thumbnail: unknown; meta: Readonly<Record<string, unknown>> | undefined; onContinue: () => void }) {
  const parked = snapshot.parkedRun;
  const line = parked === null
    ? "No cart is parked at customer service. The next run starts from the doors."
    : `${metres(parkedRunMetres(parked))} in with ${parked.partIds.length} of 4 mods fitted, ${parked.basketIds?.length ?? 0} items in the basket and ${parked.runTime.toFixed(1)} s on the clock. You hold $${snapshot.career.credits} store credit.`;
  return <>
    <SheetHead title="Continue run" tag={parked === null ? "empty" : "parked"} />
    {parked === null ? <Text color={PEN}>No cart parked yet. Stop on the floor, pause and park it before you leave the aisle.</Text> : <>
      {typeof thumbnail === "string" ? <RuneView image={thumbnail} fit="cover" width={FULL} height={180} border={{ width: 2, color: PEN }} /> : null}
      {meta === undefined ? null : Object.entries(meta).filter(([key]) => key !== "thumbnail").map(([key, value]) => <Stat key={key} label={key} value={String(value)} />)}
      <Button label="Continue run" onPress={onContinue}>CONTINUE RUN</Button>
    </>}
    <Text size={15} color={PEN}>{line}</Text>
  </>;
}

/** The New run pane: tonight's shopping list, read before the PA chimes. */
function NewRunPane({ snapshot }: { snapshot: SessionSnapshot }) {
  const { shift, event } = snapshot, best = snapshot.records.bestTime;
  return <>
    <SheetHead title="New run" tag={<Row gap={6}><Label color={PEN}>{event.label}</Label><MedalRow held={event.medal} size={20} /></Row>} />
    <Label color={ORANGE}>{`${event.trackLabel.toUpperCase()} - ${event.trackBlurb}`}</Label>
    <Text color={PEN}>{`${event.blurb}${event.garage ? " Mods snap on as you roll through their displays; hold E to swap a push or basket mod." : " Customer service is shut: only the aisle's displays fit mods."}`}</Text>
    <Text size={15} color={PEN}>{`Pushing the ${snapshot.chassis.label}: ${snapshot.basket.capacity} items. Steer into the shelves to grab stock - heavy goods carry momentum, light goods make the cart twitchy. F uses a power-up, C rides the back bar, Space hops.`}</Text>
    <Text size={15} color={PEN}>{event.next === null ? "Every medal on this event is yours. Chase the clock." : `Next medal - ${event.next.medal}: ${event.next.text}.`}</Text>
    <Label color={ORANGE}>{shift === null ? "A QUIET CLOSING - nothing on the PA. The checkout pays what the line earns." : `TONIGHT ON THE PA - ${shift.label}. ${shift.hint}`}</Label>
    <Text size={15} color={PEN}>{best === null ? `No checkout on record yet. The tills at ${event.trackLength} m are the only income worth planning around.` : `Best checkout ${best.toFixed(1)} s${snapshot.bestReceipt === null ? "" : ` · best receipt ${snapshot.bestReceipt} pts`}.`}</Text>
  </>;
}

/** Customer service: the next mod per slot, priced in the store credit the last checkouts banked. */
function GaragePane({ rows, credits, onBuy }: { rows: readonly GarageRow[]; credits: number; onBuy: (slot: GarageRow["slot"]) => void }) {
  return <>
    <SheetHead title="Customer service" tag={`$${credits} store credit`} />
    <Text size={15} color={PEN}>Buy the next mod for a slot; it is fitted to your cart for every run after this one.</Text>
    {rows.map(row => {
      const blocked = row.owned || row.locked || row.price === null || row.price > credits;
      return <Row key={row.slot} gap={10} width={FULL} padding={[6, 0, 6, 0]}>
        <RuneGlyph artwork={partArtwork(row.part?.id ?? null)} width={28} height={28} />
        <RuneView grow={1} gap={0}><Text family={STENCIL} size={17} color={PEN}>{row.part === null ? row.slot : `${row.part.slotLabel} · ${row.part.label}`}</Text><Text size={14} color={PEN}>{row.owned ? "every mod owned" : row.locked ? `locked / needs ${row.needs} loyalty` : row.part?.blurb ?? ""}</Text></RuneView>
        <Stamp label={`Buy ${row.slot}`} disabled={blocked} onPress={() => onBuy(row.slot)}>{row.owned ? "OWNED" : row.locked ? `LOCKED ${row.needs}` : row.price !== null && row.price > credits ? `NEED $${row.price - credits}` : `BUY $${row.price}`}</Stamp>
      </Row>;
    })}
  </>;
}

/** The cart corral: every chassis, bought once with store credit, pushed whenever you like. */
function CorralPane({ rows, credits, onChoose }: { rows: readonly CorralRow[]; credits: number; onChoose: (id: ChassisId) => void }) {
  return <>
    <SheetHead title="Cart corral" tag={`$${credits} store credit`} />
    <Text size={15} color={PEN}>Every cart handles differently before a single item goes in it. The squeaky wheel only stops wobbling when you fix it at customer service.</Text>
    {rows.map(row => <Row key={row.chassis.id} gap={10} width={FULL} padding={[6, 6, 6, 6]} fill={row.selected ? "#e8303a18" : "#00000000"}>
      <RuneView grow={1} gap={0}>
        <Text family={STENCIL} size={17} color={PEN}>{row.chassis.label}</Text>
        <Text size={14} color={PEN}>{`${row.chassis.blurb} ${row.chassis.capacity} items${row.chassis.wobble === 0 ? " · no wobble" : row.chassis.wobble < 1 ? " · light wobble" : " · squeaky"}`}</Text>
      </RuneView>
      <Stamp label={`Cart ${row.chassis.label}`} disabled={row.selected || (!row.owned && row.chassis.price > credits)} onPress={() => onChoose(row.chassis.id)}>{row.selected ? "PUSHING" : row.owned ? "PUSH IT" : row.chassis.price > credits ? `NEED $${row.chassis.price - credits}` : `BUY $${row.chassis.price}`}</Stamp>
    </Row>)}
  </>;
}

/** The weekly circular: every event is a department under other rules, graded bronze to gold. */
function CalendarPane({ calendar, onPick }: { calendar: SessionSnapshot["calendar"]; onPick: (id: string) => void }) {
  return <>
    <SheetHead title="Weekly circular" tag={`${calendar.points}/${calendar.maxPoints} medal points`} />
    {calendar.tiers.map(tier => <RuneView key={tier.id} gap={4} opacity={tier.open ? 1 : 0.7}>
      <Row justify="between" width={FULL}><Text family={STENCIL} size={17} color={ORANGE}>{tier.label}</Text><Label color={PEN}>{tier.open ? "open" : `locked / ${tier.missing} more medal points`}</Label></Row>
      {tier.events.map(entry => <Row key={entry.event.id} gap={8} width={FULL} padding={[5, 6, 5, 6]} fill={entry.selected ? "#e8303a18" : "#00000000"}>
        <RuneView grow={1} gap={0}>
          <Row gap={6}><Text family={STENCIL} size={16} color={PEN}>{entry.event.label}</Text><Label color={PEN}>{entry.trackLabel}</Label></Row>
          <Text size={14} color={PEN}>{!entry.open ? entry.event.blurb : entry.next === null ? `best ${entry.best} - all medals held` : `${entry.best === null ? "no result yet" : `best ${entry.best}`} - ${entry.next.medal}: ${entry.next.text}`}</Text>
        </RuneView>
        <MedalRow held={entry.medal} size={20} />
        <Stamp label={`Race ${entry.event.label}`} disabled={!entry.open || entry.selected} onPress={() => onPick(entry.event.id)}>{entry.selected ? "ON THE LIST" : entry.open ? "SHOP IT" : "LOCKED"}</Stamp>
      </Row>)}
    </RuneView>)}
  </>;
}

/** The store's records, in customer service's words. */
function RecordsPane({ snapshot }: { snapshot: SessionSnapshot }) {
  const records = snapshot.records;
  return <>
    <SheetHead title="Store records" tag={`${snapshot.runsPlayed} runs settled`} />
    <Stat label="Best checkout" value={records.bestTime === null ? "none" : `${records.bestTime.toFixed(1)} s`} />
    <Stat label="Best receipt here" value={snapshot.bestReceipt === null ? "none" : `${snapshot.bestReceipt} pts`} />
    <Stat label="Checkouts" value={String(records.escapes)} />
    <Stat label="Runs finished" value={String(records.attempts)} />
    <Stat label="Farthest" value={metres(records.farthest)} />
    <Text size={15} color={PEN}>Every settled run draws the next PA announcement; customer service shows what the next closing opens with.</Text>
  </>;
}

/** The board while the run is held: where the cart stands and what it carries. */
function PitBoard({ snapshot, hint }: { snapshot: SessionSnapshot; hint: string }) {
  return <>
    <SheetHead title="Run held" tag={snapshot.zone.label} />
    <Stat label="Place" value={`P${snapshot.race.place}/${snapshot.race.total}`} />
    <Stat label="Distance" value={`${Math.max(0, Math.floor(snapshot.run))}/${snapshot.track.exitAt} m`} />
    <Stat label="Clock" value={`${snapshot.runTime.toFixed(1)} s`} />
    <Stat label="Shutters" value={`${Math.max(0, Math.round(snapshot.compactorGap))} m back`} warn={snapshot.compactorGap < 22} />
    <Stat label="Basket" value={`${snapshot.basket.goods.length}/${snapshot.basket.capacity} items · $${snapshot.basket.value.toFixed(0)} · ${snapshot.basket.weight.toFixed(1)} kg`} />
    <RuneView layout="grid" columns={2} gap={6} width={FULL}>{PART_SLOTS.map(slot => <Row key={slot} gap={6}>
      <RuneGlyph artwork={partArtwork(snapshot.installed[slot]?.id ?? null)} width={24} height={24} />
      <RuneView gap={0}><Label size={11} color={PEN}>{SLOT_LABEL[slot]}</Label><Text size={15} color={PEN}>{snapshot.installed[slot]?.label ?? "empty"}</Text></RuneView>
    </Row>)}</RuneView>
    <Label color={ORANGE}>{`$${snapshot.salvageAtRisk} riding on this run · $${snapshot.career.credits} store credit`}</Label>
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

/** Picture, sound and controls printed on the receipt: divider tabs, ruled rows, ink stamps. */
export function PitSettings() {
  const settings = useSettings(), [chosen, setChosen] = useState<string | null>(null), [armed, setArmed] = useState<string | null>(null);
  const active = settings.categories.find(c => c.id === chosen) ?? settings.categories[0];
  return <RuneView gap={10} {...(armed === null ? {} : { onKey: (code: string) => {
    if (code !== "Escape") active?.keybinds.find(k => k.action === armed)?.rebind(code);
    setArmed(null);
  } })}>
    <SheetHead title="Settings" tag="Picture · sound · controls" />
    <RuneView layout="grid" columns={4} responsive={{ phone: { columns: 3 } }} gap={4}>{settings.categories.map(c => <RuneAction key={c.id} label={c.label} variant="stamp" fill={c === active ? PEN : "#1f243018"} color={c === active ? "#fbf8f0" : PEN} run={() => setChosen(c.id)}>{c.label}</RuneAction>)}</RuneView>
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
      <RuneAction label={row.label} height={30} fill="#1f243026" border={{ width: 2, color: PEN }} padding={[9, 0, 9, 0]} onAdjust={adjust} onDrag={d => {
        if (d.cancelled) { fraction.current = (Number(row.value) - min) / (max - min); return; }
        fraction.current = Math.max(0, Math.min(1, d.x / Math.max(1, d.width)));
        if (d.phase === "up") row.set(Math.min(max, Math.max(min, min + Math.round((value() - min) / (row.step ?? 1)) * (row.step ?? 1))));
      }}><RuneView height={8} fill={ORANGE} width={bind(() => ({ fraction: fraction.current }))} /></RuneAction>}
  </RuneView>;
}
