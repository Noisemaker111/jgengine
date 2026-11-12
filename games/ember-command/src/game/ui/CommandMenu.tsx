/** @jsxImportSource @jgengine/core/ui/jsx */
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { relativeSavedAt, useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";
import { slotText, type SaveSlotMeta } from "@jgengine/core/save/saveSlots";
import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/menu/credits";

import { ASSET_SOURCE_IDS } from "../assets";
import { campaignOrdinal, markStoresRestored, type CampaignReadout } from "../campaign";
import { hudStore } from "../hudStore";
import { preferences, type CommanderPreferences } from "../preferences";
import { CAMPAIGN_SLOTS, campaignLabel, campaignSlots, commandProfile, loadCampaignRecord, newCampaignRecord, refreshCampaignSlots, saveCampaignRecord } from "../menuSave";
import { Eyebrow, Glyph, InkButton, PlankButton, Row, SealButton, Sheet, Small, Text, Title, WaxSeal, useHudSlice } from "./kit";
import { GILT, INK, OCHRE, WAX } from "./theme";

/** Capture-only focus request: a shot declares which order it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

export const credits = mergeCredits({ title: "The makers of the vale", sections: [
  { heading: "Ember Command", entries: [
    { label: "Art direction", detail: "An autumn vale painted for the war table." },
    { label: "JGengine", detail: "Published engine packages", href: "https://jgengine.com" },
  ] },
  { heading: "Icons", entries: [{ label: "game-icons.net contributors", detail: "CC BY 3.0; individual credits in iconData.ts", href: "https://game-icons.net" }] },
] }, creditsForSourceIds(ASSET_SOURCE_IDS), {
  title: "Sky, grade and type",
  sections: creditsForLooks({ hdri: ["dusk"], lut: ["autumn-painterly"], fonts: ["im-fell-english-sc", "alegreya"] }),
});

export function battleTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface Verb { id: string; label: string; hint?: string; disabled?: boolean; quiet?: boolean }

/** Orders written in ink down the sheet. Native focus and hover choose the order in hand; the wax chevron marks it. */
function OrderList({ verbs, active, onActive, onPick }: { verbs: readonly Verb[]; active: string | null; onActive: (id: string) => void; onPick: (id: string) => void }) {
  return <RuneView gap={2} label="Orders">
    {verbs.map((verb) => <RuneAction key={verb.id} variant="verb" layout="row" label={verb.label} disabled={verb.disabled === true}
      fill={active === verb.id ? "#8e1f1714" : "#00000000"} onFocus={() => onActive(verb.id)} onHover={(inside) => { if (inside) onActive(verb.id); }}
      run={() => { onActive(verb.id); onPick(verb.id); }}>
      <Text textStyle="verb" color={active === verb.id ? WAX : INK} text={active === verb.id ? "›" : " "} minWidth={10} />
      <RuneView gap={0} grow={1} shrink>
        <Text textStyle="verb" text={verb.label} {...(verb.quiet === true ? { color: "#5e4630" } : {})} />
        {verb.hint === undefined ? null : <Small text={verb.hint} />}
      </RuneView>
    </RuneAction>)}
  </RuneView>;
}

/** The order the track offers next, in the field desk's words. */
function orderLine(campaign: CampaignReadout | null): { eyebrow: string; title: string; brief: string } {
  if (campaign === null) return { eyebrow: "Free skirmish", title: "Raze the Marauder Warcamp", brief: "No orders, no carried stores: the vale as it stands." };
  const ordinal = campaignOrdinal(campaign.index - 1);
  if (campaign.phase === "finished") return { eyebrow: "The campaign is done", title: campaign.title, brief: "Every order is answered. The Warcamp is ash." };
  if (campaign.phase === "cleared") return { eyebrow: `Next order · ${ordinal} of ${campaignOrdinal(campaign.total - 1)}`, title: campaign.title, brief: campaign.brief };
  if (campaign.phase === "failed") return { eyebrow: `Order ${ordinal} failed`, title: campaign.title, brief: campaign.reason ?? campaign.brief };
  return { eyebrow: `Order ${ordinal} of ${campaignOrdinal(campaign.total - 1)}`, title: campaign.title, brief: campaign.brief };
}

/** One kept record's line: mission, stores and playtime. */
function RecordFacts({ slot }: { slot: SaveSlotMeta }) {
  const facts = ([["flag", slotText(slot, "mission")], ["gold", slotText(slot, "stores")], ["stopwatch", slotText(slot, "playtime")]] as const).filter(([, v]) => v !== null);
  return <Row gap={12} items="center">{facts.map(([icon, value]) => <Row key={icon} gap={4}>{icon === "flag" ? null : <Glyph name={icon} size={13} color={OCHRE} />}<Small text={String(value)} /></Row>)}</Row>;
}

function TakeCommandSheet({ recent, campaign, onTake, width }: { recent: SaveSlotMeta | null; campaign: CampaignReadout | null; onTake: () => void; width: number }) {
  const order = orderLine(campaign);
  const thumb = recent === null ? null : slotText(recent, "thumbnail");
  return <Sheet width={width} label="Take command">
    <Eyebrow text={recent === null ? order.eyebrow : `${campaignLabel(recent.id)} · kept ${recent.savedAt === undefined ? "" : relativeSavedAt(recent.savedAt)}`} />
    <Title text={recent === null ? order.title : (recent.name ?? "Commander")} />
    {thumb === null ? null : <RuneView width={width - 36} height={Math.round((width - 36) * 0.5)} image={thumb} fit="cover" border={{ width: 1, color: "#5e463088" }} />}
    {recent === null ? <Text text={order.brief} /> : <RecordFacts slot={recent} />}
    <SealButton run={onTake}>{recent === null ? "March out" : "Return to the field"}</SealButton>
  </Sheet>;
}

const PRESET_NAMES = ["Mara Vell", "Bram Hollin", "Edda Thorne", "Osric Vane", "Ilse Marrow", "Tobin Reed"];
const KEY_TEXT: Record<string, string> = { Space: " ", Minus: "-", Quote: "'", Period: "." };
/** One key code as the letter it signs: words start with a capital, the native field takes codes, not characters. */
export function signKey(name: string, code: string): string {
  if (code === "Backspace") return name.slice(0, -1);
  const letter = /^Key([A-Z])$/.exec(code)?.[1] ?? /^Digit(\d)$/.exec(code)?.[1] ?? KEY_TEXT[code];
  if (letter === undefined || name.length >= 24) return name;
  const startsWord = name.length === 0 || name.endsWith(" ") || name.endsWith("-");
  return name + (startsWord ? letter.toUpperCase() : letter.toLowerCase());
}

/** New campaign: a commission to sign. The record it opens is named, and replacing one is said aloud. */
function CommissionSheet({ slot, name, onName, onBegin, width }: { slot: string | null; name: string; onName: (next: string) => void; onBegin: () => void; width: number }) {
  const [signing, setSigning] = useState(false);
  const nameRef = useRef(name);
  nameRef.current = name;
  return <Sheet width={width} label="A new campaign" {...(signing ? { onKey: (code: string) => {
    if (code === "Enter") { setSigning(false); onBegin(); return; }
    if (code === "Escape" || code === "Tab") { setSigning(false); return; }
    onName(signKey(nameRef.current, code));
  } } : {})}>
    <Eyebrow text="Commission" />
    <Title text="A new campaign" />
    <Text text="Five orders stand between the Vanguard and the Marauder Warcamp. The first opens with the muster." />
    <Small text="Commander" />
    <RuneAction label="Commander" run={() => setSigning(!signing)} minHeight={40} padding={[8, 10, 8, 10]} justify="center"
      border={{ width: signing ? 2 : 1, color: signing ? WAX : INK }} fill="#ffffff30" hover="#2b1d1010">
      <Text textStyle="verb" color={name === "" ? "#5e463099" : INK} text={`${name === "" ? "Sign here" : name}${signing ? "|" : ""}`} />
    </RuneAction>
    <Row gap={8}>
      <Small grow={1} shrink text={signing ? "Type the name. Enter seals, Esc stops." : "Tap the line to sign with the keys, or draw a name."} />
      <InkButton label="Draw a name" run={() => onName(PRESET_NAMES[(PRESET_NAMES.indexOf(name) + 1) % PRESET_NAMES.length]!)}>Draw a name</InkButton>
    </Row>
    <Small text={slot === null ? "No campaign record is free." : `This opens ${campaignLabel(slot)}; a record already there is replaced.`} />
    <SealButton disabled={slot === null} run={onBegin}>Seal the commission</SealButton>
  </Sheet>;
}

/** The kept records as three folios, each with its last look at the field. */
function RecordsSheet({ slots, recentId, onOpen, onNew, width }: { slots: readonly SaveSlotMeta[]; recentId: string | null; onOpen: (slot: string) => void; onNew: (slot: string) => void; width: number }) {
  return <Sheet width={width} label="Campaign records">
    <Eyebrow text="The field desk" />
    <Title text="Campaign records" />
    {slots.map((slot) => {
      const thumb = slotText(slot, "thumbnail");
      return <Row key={slot.id} gap={10} padding={[8, 0, 8, 0]} border={{ width: 0, color: "#0000" }} items="center">
        <RuneView width={72} height={48} fill="#00000014" items="center" justify="center" {...(thumb === null ? {} : { image: thumb, fit: "cover" as const })}
          border={{ width: slot.id === recentId ? 2 : 1, color: slot.id === recentId ? WAX : "#5e463088" }}>
          {thumb === null ? <WaxSeal size={34} wax={slot.empty ? "#8a7a64" : WAX} emblem={slot.empty ? "star" : "ember"} /> : null}
        </RuneView>
        <RuneView gap={1} grow={1} shrink>
          <Text textStyle="verb" text={campaignLabel(slot.id)} />
          <Text text={slot.empty ? "Unwritten" : (slot.name ?? "Commander")} />
          {slot.empty ? <Small text="No campaign kept here" /> : <RecordFacts slot={slot} />}
          {slot.empty || slot.savedAt === undefined ? null : <Small text={`Written ${relativeSavedAt(slot.savedAt)}`} />}
        </RuneView>
        <InkButton label={`${slot.empty ? "Begin" : "Open"} ${campaignLabel(slot.id)}`} run={() => (slot.empty ? onNew(slot.id) : onOpen(slot.id))}>{slot.empty ? "Begin" : "Open"}</InkButton>
      </Row>;
    })}
  </Sheet>;
}

function SkirmishSheet({ onMarch, width }: { onMarch: () => void; width: number }) {
  return <Sheet width={width} label="Free skirmish">
    <Eyebrow text="No orders" />
    <Title text="Free skirmish" />
    <Text text="The vale as it stands: a keep, a purse and the Warcamp across the river. No campaign track, no carried stores. Raze the Warcamp to win." />
    <PlankButton run={onMarch}>Into the vale</PlankButton>
  </Sheet>;
}

/** The field report after a battle: the outcome, the time it took and what still stands. */
function ReportSheet({ width }: { width: number }) {
  const r = useHudSlice((h) => ({ won: h.phase === "won", elapsed: h.elapsed, waves: h.wavesSent, troops: h.playerUnits }));
  return <Sheet width={width} label="Field report">
    <Eyebrow text="Field report" />
    <Title text={r.won ? "The vale is yours" : "The keep has fallen"} />
    <Text text={r.won ? "Your Vanguard broke the Warcamp. The reinforcements have been silenced." : "The Marauders breached your walls. Gather gold early, build a Barracks and cover the road with a Guard Tower."} />
    {([["Battle time", battleTime(r.elapsed)], ["Waves faced", String(r.waves)], ["Troops standing", String(r.troops)]] as const).map(([label, value]) =>
      <Row key={label} justify="between" padding={[3, 0, 3, 0]}><Small text={label} /><Text textStyle="number" text={value} /></Row>)}
  </Sheet>;
}

/** An ink tick-box: a switch for the keys and pad, a mark for the eye. */
function InkSwitch({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return <RuneAction label={label} role="switch" run={onToggle} layout="row" gap={10} padding={[4, 4, 4, 4]} hover="#2b1d1010" radius={2} items="center">
    <RuneView gap={0} grow={1} shrink><Text textStyle="verb" text={label} /><Small text={hint} /></RuneView>
    <RuneView width={26} height={26} border={{ width: 2, color: INK }} items="center" justify="center">
      {on ? <Text textStyle="verb" color={WAX} text="✓" /> : null}
    </RuneView>
  </RuneAction>;
}

function SettingRowView({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 1;
  const fraction = useRef(0);
  fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min);
  const shown = row.kind === "toggle" ? (row.value ? "On" : "Off") : row.options?.find((o) => o.value === row.value)?.label ?? String(row.value);
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  const value = () => min + fraction.current * (max - min);
  return <RuneView gap={4}>
    <Row justify="between"><Text grow={1} text={row.label} /><Text textStyle="number" color={WAX} text={row.kind === "slider" ? bind(() => row.format?.(value()) ?? value().toFixed(2)) : shown} /></Row>
    {row.kind !== "slider" ? <InkButton label={row.label} run={() => adjust(1)}>{`${shown} ›`}</InkButton>
      : <RuneAction label={row.label} height={30} fill="#2b1d1018" border={{ width: 1, color: "#2b1d1066" }} padding={[11, 0, 11, 0]} onAdjust={adjust} onDrag={(d) => {
        if (d.cancelled) { fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min); return; }
        fraction.current = Math.max(0, Math.min(1, d.x / Math.max(1, d.width)));
        if (d.phase === "up") row.set(Math.min(max, Math.max(min, min + Math.round((value() - min) / (row.step ?? 1)) * (row.step ?? 1))));
      }}><RuneView height={8} fill={WAX} width={bind(() => ({ fraction: fraction.current }))} /></RuneAction>}
  </RuneView>;
}

/** Field preferences and the shell's own settings, on one sheet. */
export function FieldSettings({ ctx, width }: { ctx: GameContext; width: number }) {
  const settings = useSettings();
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [chosen, setChosen] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const active = settings.categories.find((c) => c.id === chosen) ?? settings.categories[0];
  const toggles: [keyof Pick<CommanderPreferences, "largeText" | "highContrast" | "reducedMotion">, string, string][] = [
    ["largeText", "Larger HUD text", "Enlarge command labels and field reports."],
    ["highContrast", "High contrast", "Heavier ink and solid backings."],
    ["reducedMotion", "Reduce UI motion", "Sheets lie still and seals stop pulsing."],
  ];
  return <Sheet width={width} label="Field preferences" {...(armed === null ? {} : { onKey: (code: string) => {
    if (code !== "Escape") active?.keybinds.find((k) => k.action === armed)?.rebind(code);
    setArmed(null);
  } })}>
    <Eyebrow text="Settings" />
    <Title text="Field preferences" />
    {toggles.map(([key, label, hint]) => <InkSwitch key={key} label={label} hint={hint} on={prefs[key]} onToggle={() => store.set({ [key]: !prefs[key] })} />)}
    <RuneView layout="grid" columns={width < 400 ? 2 : 4} gap={4}>{settings.categories.map((c) =>
      <RuneAction key={c.id} label={c.label} run={() => setChosen(c.id)} padding={[6, 8, 6, 8]} radius={2} items="center"
        fill={c === active ? WAX : "#00000010"} border={{ width: 1, color: c === active ? "#3a0b06" : "#5e463066" }} hover="#2b1d1014">
        <Text textStyle="small" color={c === active ? "#fbe9d6" : INK} text={c.label} />
      </RuneAction>)}</RuneView>
    {active?.rows.map((row) => <SettingRowView key={row.id} row={row} />)}
    {active?.keybinds.map((k) => <Row key={k.action} justify="between">
      <Text grow={1} shrink text={k.label} />
      <InkButton label={`Rebind ${k.label}`} disabled={k.locked === true} run={() => setArmed(k.action)}>{armed === k.action ? "Press a key" : k.bindingLabel}</InkButton>
      <InkButton label={`Reset ${k.label}`} disabled={k.locked === true || k.isDefault} run={k.reset}>Reset</InkButton>
    </Row>)}
    {settings.actions.map((a) => <InkButton key={a.id} run={a.run}>{a.label}</InkButton>)}
  </Sheet>;
}

function CreditsSheet({ width }: { width: number }) {
  return <Sheet width={width} label="Credits">
    <Eyebrow text="Credits" />
    <Title text={credits.title ?? "Credits"} />
    {credits.sections.map((s) => <RuneView key={s.heading} gap={3} padding={[6, 0, 6, 0]}>
      <Text textStyle="verb" text={s.heading} />
      {s.entries.map((e) => <Small key={e.label + (e.detail ?? "")} text={[e.label, e.detail, e.href].filter(Boolean).join(" · ")} />)}
    </RuneView>)}
    {credits.notice === undefined ? null : <Small text={String(credits.notice)} />}
  </Sheet>;
}

/**
 * Ember Command's front end is the war table: the title is a weathered survey of the vale under the
 * campaign's wax seal with the orders written down it; the pause is a leather dispatch case holding the
 * orders on hold. Every detail pane is a loose sheet pinned beside them.
 */
export function CommandMenu({ ctx, width, height }: { ctx: GameContext; width: number; height: number }): ReactNode {
  const commands = ctx.game.commands;
  const phase = useHudSlice((h) => h.phase);
  const campaign = useHudSlice((h) => h.campaign);
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const slots = useSaveSlots(campaignSlots);
  const [name, setName] = useState(commandProfile.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ended = phase === "won" || phase === "lost";
  const [active, setActive] = useState<string | null>(menuFocus.id ?? (phase === "paused" ? null : ended ? "report" : "continue"));
  const phone = width < 760;
  const recent = campaignSlots.mostRecent();
  const openSlot = ctx.game.save?.slot() ?? CAMPAIGN_SLOTS[0];
  const campaignSlotOpen = (CAMPAIGN_SLOTS as readonly string[]).includes(openSlot);
  const openName = campaignSlotOpen ? campaignLabel(openSlot) : "the campaign record";
  const newSlot = slots.find((slot) => slot.empty)?.id ?? CAMPAIGN_SLOTS[0];

  useEffect(() => {
    setNotice(null);
    void refreshCampaignSlots(ctx);
    setActive(menuFocus.id ?? (phase === "paused" ? null : phase === "won" || phase === "lost" ? "report" : "continue"));
  }, [phase]);

  const run = (command: string) => { commands.run(command, {}); };
  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try { await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]); }
    catch (error) { setNotice(String(error)); }
    finally { setBusy(null); }
  };
  const openRecord = (slot: string) => whileLoading("Opening the campaign record", async () => {
    const opened = await loadCampaignRecord(ctx, slot);
    if (!opened) { setNotice(`${campaignLabel(slot)} is empty.`); return; }
    markStoresRestored(ctx);
    setName(commandProfile.name);
    void refreshCampaignSlots(ctx);
    run("match.start");
  });
  const startNew = (slot: string | null) => {
    if (slot === null) return;
    void whileLoading("Sealing the commission", async () => { await newCampaignRecord(ctx, slot, name); run("match.start"); });
  };
  const saveHere = () => whileLoading("Writing the campaign record", async () => { await saveCampaignRecord(ctx); setNotice(`Orders written to ${openName}`); });

  if (phase === "playing") return null;
  const sheetWidth = phone ? width - 32 : Math.min(470, width - 520);
  const busyCurtain = busy === null ? null : <RuneView anchor="fill" fill="#1a120acc" modal justify="center" items="center" gap={10} role="status">
    <WaxSeal size={58} /><Text textStyle="gilt" text={busy} />
  </RuneView>;
  const order = orderLine(campaign);

  const page = (lead: ReactNode, detail: ReactNode, foot: ReactNode, onBack?: () => void) => <RuneView anchor="fill" fill="#1a120ae6" {...(onBack === undefined ? {} : { onBack })}>
    {phone ? <RuneView anchor="fill" safe scroll padding={16} gap={16} items="center">{lead}{detail}{foot}</RuneView>
      : <>
        <RuneView anchor="center" layout="row" gap={28} items="center">{lead}<RuneView width={sheetWidth} maxHeight={height - 90} scroll>{detail}</RuneView></RuneView>
        <RuneView anchor="bottom" safe inset={14}>{foot}</RuneView>
      </>}
    {busyCurtain}
  </RuneView>;

  if (phase === "paused") {
    const verbs: Verb[] = [
      { id: "resume", label: "Resume the mission" },
      { id: "save", label: campaignSlotOpen ? `Save to ${openName}` : "Save the campaign", hint: "Writes the campaign, its mission and its stores" },
      { id: "settings", label: "Settings" },
      { id: "credits", label: "Credits" },
      { id: "title", label: "Return to title", hint: "Writes the record, then back to the war table", quiet: true },
    ];
    const pick = (id: string) => {
      if (id === "resume") run("match.resume");
      else if (id === "save") void saveHere();
      else if (id === "title") void whileLoading("Writing the campaign record", async () => { await saveCampaignRecord(ctx); run("match.title"); });
    };
    const caseWidth = phone ? width - 32 : 400;
    const lead = <RuneView variant="leather" width={caseWidth} padding={[30, 14, 16, 14]} label="Orders on hold">
      <RuneView anchor="top" inset={8}><RuneView width={40} height={14} radius={3} fill={GILT} border={{ width: 1, color: "#5a3a12" }} /></RuneView>
      <RuneView variant="sheet" gap={6}>
        <Eyebrow text={campaign === null ? order.eyebrow : `${order.eyebrow} · ${campaign.title}`} />
        <Title text="Orders on hold" />
        <Text text="The field is frozen. Review the plan before the next wave." />
        <OrderList verbs={verbs} active={active} onActive={setActive} onPick={pick} />
        <Row justify="between" items="end">
          <Small grow={1} shrink text={notice ?? bind(() => `${hudStore.get().gold} gold · ${hudStore.get().lumber} lumber in the stores`)} />
          <WaxSeal size={52} />
        </Row>
      </RuneView>
    </RuneView>;
    const detail = active === "settings" ? <FieldSettings ctx={ctx} width={sheetWidth} /> : active === "credits" ? <CreditsSheet width={sheetWidth} /> : null;
    return page(lead, detail, null, () => run("match.resume"));
  }

  const held = slots.filter((slot) => !slot.empty).length;
  const verbs: Verb[] = [
    ...(ended ? [{ id: "report", label: "Field report", hint: phase === "won" ? "The vale is yours" : "The keep has fallen" }] : []),
    { id: "continue", label: "Take command", hint: recent === null ? (campaign === null ? "March into a free skirmish" : `March on ${order.title}`) : `Resume ${recent.name ?? campaignLabel(recent.id)}` },
    { id: "new", label: "New campaign", hint: `Opens ${campaignLabel(newSlot)}` },
    { id: "skirmish", label: "Free skirmish", hint: "The vale without orders" },
    { id: "missions", label: "Campaign records", hint: `${held} of ${slots.length} kept` },
    { id: "settings", label: "Settings", hint: "Field preferences, sound, controls" },
    { id: "credits", label: "Credits" },
  ];
  const take = () => { if (recent !== null) void openRecord(recent.id); else run("match.start"); };
  const pick = (id: string) => {
    if (id === "continue") take();
    else if (id === "skirmish") run("match.skirmish");
    else if (id === "missions") void refreshCampaignSlots(ctx);
  };
  const detail = active === "report" ? <ReportSheet width={sheetWidth} />
    : active === "continue" ? <TakeCommandSheet recent={recent} campaign={campaign} onTake={take} width={sheetWidth} />
    : active === "new" ? <CommissionSheet slot={newSlot} name={name} onName={setName} onBegin={() => startNew(newSlot)} width={sheetWidth} />
    : active === "skirmish" ? <SkirmishSheet onMarch={() => run("match.skirmish")} width={sheetWidth} />
    : active === "missions" ? <RecordsSheet slots={slots} recentId={recent?.id ?? null} onOpen={(slot) => void openRecord(slot)} onNew={(slot) => startNew(slot)} width={sheetWidth} />
    : active === "settings" ? <FieldSettings ctx={ctx} width={sheetWidth} />
    : active === "credits" ? <CreditsSheet width={sheetWidth} /> : null;
  const surveyWidth = phone ? width - 32 : 420;
  const lead = <RuneView variant="sheet" width={surveyWidth} padding={[24, 26, 26, 26]} gap={10} fill="#e6d3a8" label="Ember Command">
    <Row justify="between" items="start">
      <RuneView gap={2}>
        <Eyebrow text="The Highland Vale" />
        <Text textStyle="wordmark" text="Ember" />
        <Text textStyle="wordmark" text="Command" />
      </RuneView>
      <WaxSeal size={phone ? 64 : 88} />
    </Row>
    <RuneView gap={1}><Eyebrow text={order.eyebrow} /><Text textStyle="verb" text={order.title} /></RuneView>
    <OrderList verbs={verbs} active={active} onActive={setActive} onPick={pick} />
  </RuneView>;
  const foot = <Row gap={20} padding={[6, 12, 6, 12]} fill="#00000055" radius={2}>
    <Text textStyle="gilt" text={notice ?? `Service record · ${prefs.wins} victories · ${prefs.losses} defeats`} />
    {phone ? null : <Text textStyle="gilt" color="#d8c9a8" text="↑↓ choose   Enter take" />}
  </Row>;
  return page(lead, detail, foot);
}
