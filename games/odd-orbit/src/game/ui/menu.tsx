/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useEffect, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useGame, useGameCalendar } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";
import { useStore } from "@jgengine/react/store";
import { slotText, type SaveSlotMeta } from "@jgengine/core/save/saveSlots";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { mergeCredits } from "@jgengine/core/menu/credits";
import type { GameIconName } from "@jgengine/core/ui/icons/gameIcons.view";

import { ASSET_SOURCE_IDS } from "../assets";
import { moodOfNeeds } from "../agents";
import { orbitSession } from "../session/lifecycle";
import { householdStore } from "../session/store";
import { ORBIT_SLOTS, orbitProfile, orbitSlotKey, readOrbitSave } from "../session/save";
import { newOrbitSlot, openOrbitSlot, orbitSlotLabel, orbitSlots, refreshOrbitSlots, saveOrbitSlot, workingMember } from "../menuSave";
import { CREAM_TEXT, ENAMEL, type EnamelTone, Fine, FULL, Heading, Icon, INK, NIGHT_DIM, Paper, Plate, RIM, Row, Swatch, Tag, Text } from "./kit";

/** Capture-only focus request: a shot declares which page it wants open. */
export const menuFocus: { id: string | null } = { id: null };

/** The art direction's sky and grade, named once; the credits list them. */
export const LOOKS_USED = { hdri: ["lilac-dusk"], lut: ["pastel-dusk"] } as const;

const credits = mergeCredits({
  sections: [
    { heading: "Original game art", entries: [{ label: "Odd Orbit", detail: "Original plan-derived household portraits and habitat interface." }] },
    { heading: "Engine", entries: [{ label: "JG Engine", detail: "Apache-2.0", href: "https://github.com/Noisemaker111/jgengine" }, { label: "Rune / Three.js", detail: "MIT" }] },
    { heading: "Fonts", entries: [
      { label: "Comfortaa — Johan Aakerlund", detail: "OFL-1.1", href: "https://fonts.google.com/specimen/Comfortaa" },
      { label: "Quicksand — Andrew Paglinawan", detail: "OFL-1.1", href: "https://fonts.google.com/specimen/Quicksand" },
    ] },
  ],
}, creditsForSourceIds(ASSET_SOURCE_IDS), { sections: creditsForLooks(LOOKS_USED) });

export interface OrbitPreferences { calm: boolean; contrast: boolean }
type Prefs = { preferences: OrbitPreferences; onPreference: (key: keyof OrbitPreferences, value: boolean) => void };

const GUIDE: readonly { icon: GameIconName; title: string; line: string }[] = [
  { icon: "hourglass", title: "Share the day", line: "Yield works 08–14 for credits. Bloom tends 14–18 for rations. Three shifts open 08–18." },
  { icon: "buffArrow", title: "Grow a post", line: "Every shift earns standing. Rungs open at 3 and 9 standing; promote from a being's card." },
  { icon: "bread", title: "Keep a pantry", line: "Meals use rations: six cost 36 credits. The habitat bill lands at midnight." },
  { icon: "feather", title: "Make room to rest", line: "Work raises stress. Burnout stops pay until Nourish and Rest pass 50." },
  { icon: "heart", title: "Build bonds", line: "Friends keep each other company. A bonded pair never works apart." },
];

function GuidePage() {
  return <RuneView gap={10}>
    <Heading>Caring for a strange household</Heading>
    {GUIDE.map((step) => <Row key={step.title} gap={10} items="start">
      <RuneView width={34} height={34} radius={17} fill={ENAMEL.butter} border={{ width: 2, color: RIM }} justify="center" items="center"><Icon name={step.icon} size={18} /></RuneView>
      <RuneView grow={1} shrink gap={1}><Text weight={700}>{step.title}</Text><Fine>{step.line}</Fine></RuneView>
    </Row>)}
  </RuneView>;
}

function CreditsPage() {
  return <RuneView gap={8}>
    <Heading>Credits</Heading>
    {credits.sections.map((section) => <RuneView key={section.heading} gap={2}>
      <Tag>{section.heading.toUpperCase()}</Tag>
      {section.entries.map((entry) => <Text key={`${entry.label}-${entry.detail ?? ""}`} size={14}>{entry.detail ? `${entry.label} · ${entry.detail}` : entry.label}</Text>)}
    </RuneView>)}
    {credits.notice ? <Fine>{credits.notice}</Fine> : null}
  </RuneView>;
}

const PREF_LINES: readonly { id: keyof OrbitPreferences; label: string }[] = [{ id: "calm", label: "Calm interface" }, { id: "contrast", label: "Bolder panels" }];

/** The house controls: category tabs, each setting as one line with a slider, a lamp switch or chips, and key rebinding. */
export function HouseSettings({ preferences, onPreference }: Prefs) {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const category = settings.categories.find((c) => c.id === chosen) ?? settings.categories[0] ?? null;
  if (category === null) return <Fine>This house has no settings to change.</Fine>;
  const first = category.id === settings.categories[0]?.id;
  return <RuneView gap={10} {...(armed === null ? {} : { onKey: (code: string) => { if (code !== "Escape") category.keybinds.find((k) => k.action === armed)?.rebind(code); setArmed(null); } })}>
    <RuneView layout="grid" columns={4} responsive={{ phone: { columns: 2 } }} gap={5} label="Settings pages">
      {settings.categories.map((c) => <Plate key={c.id} tone={c.id === category.id ? "pink" : "cream"} on={c.id === category.id} minHeight={34} padding={[5, 10, 5, 10]} size={14} onPress={() => setChosen(c.id)}>{c.label}</Plate>)}
    </RuneView>
    {first ? PREF_LINES.map((pref) => <SettingLine key={pref.id} label={pref.label}><Lamp on={preferences[pref.id]} label={pref.label} toggle={() => onPreference(pref.id, !preferences[pref.id])} /></SettingLine>) : null}
    {category.rows.map((row) => <SettingLine key={row.id} label={row.label}><Control row={row} /></SettingLine>)}
    {category.keybinds.map((k) => <SettingLine key={k.action} label={k.label}>
      <Row gap={4}><Plate tone={armed === k.action ? "pink" : "cream"} disabled={k.locked === true} minHeight={32} padding={[4, 10, 4, 10]} size={13} label={`Rebind ${k.label}`} onPress={() => setArmed(k.action)}>{armed === k.action ? "Press a key" : k.bindingLabel}</Plate>
        {k.isDefault || k.locked ? null : <Plate minHeight={32} padding={[4, 8, 4, 8]} label={`Reset ${k.label}`} onPress={k.reset}><Icon name="rotateCcw" size={14} /></Plate>}</Row>
    </SettingLine>)}
    {settings.actions.map((a) => <Plate key={a.id} tone={a.kind === "danger" ? "coral" : "cream"} onPress={a.run}>{a.label}</Plate>)}
  </RuneView>;
}

function SettingLine({ label, children }: { label: string; children: ReactNode }) {
  return <RuneView layout="row" items="center" gap={8} padding={[4, 0, 4, 0]} responsive={{ phone: { layout: "stack", items: "start" } }}>
    <Text grow={1} shrink size={14}>{label}</Text>{children}
  </RuneView>;
}

function Lamp({ on, label, toggle }: { on: boolean; label: string; toggle: () => void }) {
  return <Plate tone={on ? "butter" : "cream"} on={on} minHeight={32} padding={[4, 12, 4, 10]} label={label} onPress={toggle} onAdjust={toggle}>
    <RuneView width={12} height={12} radius={6} fill={on ? "#ffcf3f" : "#8a7a8f"} border={{ width: 1.5, color: RIM }} /><Text size={13} weight={700}>{on ? "On" : "Off"}</Text>
  </Plate>;
}

function Control({ row }: { row: SettingsRow }) {
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  if (row.kind === "toggle") return <Lamp on={Boolean(row.value)} label={row.label} toggle={() => row.set(!row.value)} />;
  if (row.kind !== "slider") return <Row gap={4} label={row.label}>{(row.options ?? []).map((o) => <Plate key={String(o.value)} tone={String(row.value) === String(o.value) ? "pink" : "cream"} on={String(row.value) === String(o.value)} minHeight={30} padding={[3, 9, 3, 9]} size={13} onPress={() => row.set(o.value)} onAdjust={adjust}>{o.label}</Plate>)}</Row>;
  return <Slider row={row} />;
}

function Slider({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 1, span = Math.max(1e-6, max - min);
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? Number(row.value);
  const snap = (v: number) => Math.min(max, Math.max(min, min + Math.round((v - min) / (row.step ?? 1)) * (row.step ?? 1)));
  return <Row gap={8}>
    <RuneAction label={row.label} width={150} height={30} padding={[11, 0, 11, 0]} fill="#00000000" onAdjust={(d) => { const next = adjustSettingRow(row, d); if (next !== undefined) row.set(next); }}
      onDrag={(g) => { if (g.cancelled) { setDrag(null); return; } const v = min + Math.max(0, Math.min(1, g.x / Math.max(1, g.width))) * span; if (g.phase === "up") { setDrag(null); row.set(snap(v)); } else setDrag(v); }}>
      <RuneView height={8} radius={4} fill="#2a173333" width={{ fraction: 1 }}><RuneView height={8} radius={4} fill={ENAMEL.pink} border={{ width: 1, color: RIM }} width={{ fraction: Math.max(0.02, (value - min) / span) }} /></RuneView>
    </RuneAction>
    <Text size={13} weight={700} minWidth={44}>{row.format?.(value) ?? value.toFixed(2)}</Text>
  </Row>;
}

/** Letters, digits and space typed onto the moving-in card while it is armed; Enter moves in, Escape stops. */
const SUGGESTED = ["The Moonwells", "The Pebblesons", "The Quill-Ottos", "The Driftmoss", "The Halcyons"];
function keyChar(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code === "Space") return " ";
  if (code === "Minus") return "-";
  if (code === "Quote") return "'";
  if (code === "Period") return ".";
  return null;
}
function NameCard({ name, setName, submit }: { name: string; setName: (next: (name: string) => string) => void; submit: () => void }) {
  const [armed, setArmed] = useState(false);
  const type = (code: string) => {
    if (code === "Enter") { setArmed(false); submit(); return; }
    if (code === "Escape" || code === "Tab") { setArmed(false); return; }
    if (code === "Backspace") { setName((n) => n.slice(0, -1)); return; }
    const c = keyChar(code);
    if (c !== null) setName((n) => n.length >= 40 ? n : n + (n === "" || n.endsWith(" ") ? c.toUpperCase() : c));
  };
  return <RuneView gap={4} {...(armed ? { onKey: type } : {})}>
    <Tag>HOUSEHOLD NAME</Tag>
    <Row gap={6}>
      <RuneAction label="Household name" grow={1} minHeight={40} padding={[8, 12, 8, 12]} radius={10} fill="#ffffff" border={{ width: armed ? 3 : 2, color: armed ? "#c2477f" : RIM }} run={() => setArmed(!armed)}>
        <Text color={name === "" ? "#9a8aa0" : INK}>{name === "" ? (armed ? "Type a name…" : "The ...") : armed ? `${name}|` : name}</Text>
      </RuneAction>
      <Plate tone="sky" minHeight={40} label="Suggest a name" onPress={() => setName((n) => SUGGESTED[(SUGGESTED.indexOf(n) + 1) % SUGGESTED.length]!)}><Icon name="star" size={16} /></Plate>
    </Row>
    <Fine size={12}>{armed ? "Typing: Enter moves in, Esc stops." : "Tap the card to type, or the star for a name."}</Fine>
  </RuneView>;
}

function Stamp({ icon, text }: { icon: GameIconName; text: string }) {
  return <Row gap={4} fill="#f4e3c8" radius={8} padding={[3, 8, 3, 6]} border={{ width: 1, color: "#6b4c3a" }}><Icon name={icon} size={14} /><Text size={13} weight={700}>{text}</Text></Row>;
}

function Thumb({ thumb, width, height }: { thumb: string | null; width: number; height: number }) {
  return <RuneView width={width} height={height} radius={6} fill="#4a3428" border={{ width: 3, color: "#2b160a" }} justify="center" items="center" clip
    {...(thumb === null ? {} : { image: thumb, fit: "cover" as const })}>{thumb === null ? <Icon name="eye" size={24} color={ENAMEL.cream} /> : null}</RuneView>;
}

function Polaroid({ slot, onOpen, onNew, onClear }: { slot: SaveSlotMeta; onOpen: () => void; onNew: () => void; onClear: () => void }) {
  const thumb = slotText(slot, "thumbnail");
  return <Paper tint="#ffffff" padding={8} gap={4} width={150} border={{ width: 1, color: "#6b4c3a" }}>
    <Thumb thumb={thumb} width={132} height={74} />
    <Text weight={700} size={14}>{slot.empty ? orbitSlotLabel(slot.id) : (slot.name ?? orbitSlotLabel(slot.id))}</Text>
    <Fine size={12}>{slot.empty ? "Empty rooms" : `${String(slot.meta["day"] ?? "")} · ${String(slot.meta["credits"] ?? "")}`}</Fine>
    {slot.empty ? <Plate tone="pink" minHeight={30} padding={[3, 10, 3, 10]} size={13} label={`Move in to ${orbitSlotLabel(slot.id)}`} onPress={onNew}>Move in</Plate>
      : <Row gap={4}><Plate tone="mint" minHeight={30} padding={[3, 10, 3, 10]} size={13} label={`Open ${orbitSlotLabel(slot.id)}`} onPress={onOpen}>Open</Plate>
        <Plate tone="coral" minHeight={30} padding={[3, 8, 3, 8]} label={`Clear ${orbitSlotLabel(slot.id)}`} holdMs={500} onPress={onClear}><Icon name="cross" size={13} /></Plate></Row>}
  </Paper>;
}

type Loader = (label: string, work: () => Promise<unknown>) => Promise<void>;

/**
 * Odd Orbit's front end. The title is the habitat's porch: the house sign, the verbs as enamel door
 * plates and a paper note for whichever plate is open. Pause is the household handbook.
 */
export function OrbitMenu(props: Prefs) {
  const session = useStore(orbitSession);
  const [busy, setBusy] = useState<string | null>(null);
  const whileLoading = useCallback(async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try { await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]); }
    finally { setBusy(null); }
  }, []);
  return <RuneView anchor="fill" fill="#1a1029a8" modal>
    {session.screen === "menu" ? <Porch {...props} whileLoading={whileLoading} /> : session.screen === "paused" ? <Handbook {...props} whileLoading={whileLoading} /> : null}
    {busy === null ? null : <RuneView anchor="center" fill={ENAMEL.butter} radius={14} border={{ width: 2, color: RIM }} padding={[10, 18, 10, 18]} role="status"><Text weight={700}>{busy}</Text></RuneView>}
  </RuneView>;
}

interface PlateDef { id: string; label: string; icon: GameIconName; tone: EnamelTone; disabled?: boolean; hint?: string }

function Porch({ preferences, onPreference, whileLoading }: Prefs & { whileLoading: Loader }) {
  const ctx = useGameContext();
  const household = useStore(householdStore, (s) => ({ credits: s.credits, pantry: s.pantry, beings: s.order.length }));
  const session = useStore(orbitSession);
  const { width, height } = useRuneViewport(), phone = width < 600;
  const slots = useSaveSlots(orbitSlots);
  const [name, setName] = useState(orbitProfile.name);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = orbitSlots.mostRecent();
  const [active, setActive] = useState<string>(menuFocus.id ?? (recent === null ? "new" : "continue"));
  const [sheet, setSheet] = useState(menuFocus.id !== null && phone);
  useEffect(() => { setName(orbitProfile.name); refreshOrbitSlots(); }, []);
  const emptySlot = slots.find((slot) => slot.empty)?.id ?? ORBIT_SLOTS[0];
  const kept = slots.filter((slot) => !slot.empty).length;
  const plates: PlateDef[] = [
    { id: "continue", label: "Continue", icon: "arrowRight", tone: "mint", disabled: recent === null, hint: recent === null ? "Nobody lives here yet" : (recent.name ?? orbitSlotLabel(recent.id)) },
    { id: "new", label: "Move in", icon: "key", tone: "pink", hint: `Into ${orbitSlotLabel(emptySlot)}` },
    { id: "careers", label: "Households", icon: "pin", tone: "butter", hint: `${kept} of ${slots.length} kept` },
    { id: "guide", label: "Field guide", icon: "eye", tone: "sky", hint: "Shifts, posts, bonds" },
    { id: "settings", label: "Settings", icon: "gear", tone: "lilac", hint: "Sound, picture, keys" },
    { id: "credits", label: "Credits", icon: "star", tone: "cream" },
  ];
  const openCareer = (slot: string) => whileLoading("Opening the front door", async () => { if (!openOrbitSlot(ctx, slot)) setNotice(`${orbitSlotLabel(slot)} is empty.`); else setName(orbitProfile.name); });
  const startCareer = () => void whileLoading("Moving the household in", async () => { newOrbitSlot(ctx, emptySlot, name); });
  const choose = (id: string) => { setActive(id); if (id === "careers") refreshOrbitSlots(); if (phone) setSheet(true); };

  const note = (() => {
    if (active === "continue") {
      const saved = recent === null ? null : readOrbitSave(undefined, recent.id).save;
      const member = saved === null ? null : workingMember(saved.household);
      if (recent === null || saved === null) return <RuneView gap={8}><Heading>Nobody lives here yet</Heading><Text>{session.saveStatus === "damaged" ? "The saved household is unreadable. Moving in replaces it." : session.saveStatus === "unavailable" ? "This browser cannot keep a household." : "Move a household in, work a shift, then save from the handbook."}</Text></RuneView>;
      return <RuneView gap={8}>
        <Thumb thumb={slotText(recent, "thumbnail")} width={phone ? 300 : 320} height={phone ? 168 : 180} />
        <Heading>{recent.name ?? orbitSlotLabel(recent.id)}</Heading>
        <Row gap={6}><Stamp icon="hourglass" text={String(recent.meta["day"] ?? "")} /><Stamp icon="coin" text={`${saved.household.credits}`} /><Stamp icon="bread" text={`${saved.household.pantry}`} /></Row>
        <Text>{member === null ? "Saved between shifts." : `${member.name} is on the ${member.lifestyle === "yield" ? "Yield" : "Bloom"} shift.`}</Text>
        <Plate tone="mint" onPress={() => void openCareer(recent.id)}><Icon name="arrowRight" size={18} /><Text weight={700}>Open the door</Text></Plate>
      </RuneView>;
    }
    if (active === "new") return <RuneView gap={10}>
      <Heading>Moving-in card</Heading>
      <NameCard name={name} setName={setName} submit={startCareer} />
      <Row gap={6}><Stamp icon="coin" text="640" /><Stamp icon="bread" text="12" /><Stamp icon="heart" text="4 beings" /></Row>
      <Fine>{`Into ${orbitSlotLabel(emptySlot)}.`}</Fine>
      <Plate tone="pink" label="Move in now" onPress={startCareer}><Icon name="key" size={18} /><Text weight={700}>Move in</Text></Plate>
    </RuneView>;
    if (active === "careers") return <RuneView gap={10}>
      <Heading>Households</Heading>
      <RuneView layout="row" gap={8} responsive={{ phone: { layout: "grid", columns: 2 } }}>
        {slots.map((slot) => <Polaroid key={slot.id} slot={slot} onOpen={() => void openCareer(slot.id)} onNew={() => newOrbitSlot(ctx, slot.id, name)}
          onClear={() => void whileLoading("Clearing the household", async () => { window.localStorage.removeItem(orbitSlotKey(slot.id)); refreshOrbitSlots(); setNotice(`${orbitSlotLabel(slot.id)} is clear.`); })} />)}
      </RuneView>
      <Fine>Hold the cross to clear a household.</Fine>
    </RuneView>;
    if (active === "guide") return <GuidePage />;
    if (active === "settings") return <RuneView gap={8}><Heading>Settings</Heading><HouseSettings preferences={preferences} onPreference={onPreference} /></RuneView>;
    return <CreditsPage />;
  })();

  const showNote = !phone || sheet;
  const noteWidth = phone ? width - 24 : Math.min(520, width - 420);
  return <RuneView anchor="fill" padding={phone ? [16, 12, 16, 12] : [40, 48, 40, 48]} gap={16} layout={phone ? "stack" : "row"} items={phone ? "stretch" : "center"} justify={phone ? "start" : "center"} {...(phone && sheet ? { onBack: () => setSheet(false) } : {})} label="Odd Orbit">
    {phone && sheet ? null : <RuneView gap={14} width={phone ? width - 24 : 340} minWidth={phone ? width - 24 : 340} items={phone ? "center" : "start"}>
      <Paper width={FULL} tint={ENAMEL.cream} radius={28} border={{ width: 3, color: RIM }} padding={phone ? [14, 22, 12, 22] : [20, 30, 16, 30]} gap={2} items="center">
        <Text family="Comfortaa" weight={700} size={phone ? 42 : 54} color={INK} width={FULL} align="center">Odd Orbit</Text>
        <Fine color="#8a4a6f" size={13}>a home for four strange beings</Fine>
      </Paper>
      <RuneView gap={8} width={phone ? width - 48 : 300} label="Front door">
        {plates.map((plate) => <Plate key={plate.id} tone={plate.tone} on={active === plate.id} disabled={plate.disabled === true} justify="start" minHeight={phone ? 46 : 44} label={plate.label}
          onPress={() => { if (plate.id === "continue" && recent !== null && active === "continue") void openCareer(recent.id); else choose(plate.id); }}>
          <RuneView width={28} height={28} radius={14} fill="#ffffff80" justify="center" items="center"><Icon name={plate.icon} size={18} /></RuneView>
          <Text weight={700} grow={1}>{plate.label}</Text>
          {plate.hint !== undefined && active === plate.id ? <Fine size={12} color={INK}>{plate.hint}</Fine> : null}
        </Plate>)}
      </RuneView>
    </RuneView>}
    {showNote ? <RuneView gap={8} width={noteWidth} minWidth={noteWidth} grow={phone ? 1 : 0}>
      {phone ? <Plate tone="plum" label="Porch" onPress={() => setSheet(false)}><Icon name="arrowLeft" size={16} color={CREAM_TEXT} /><Text weight={700} color={CREAM_TEXT}>Porch</Text></Plate> : null}
      <Paper width={FULL} padding={22} maxHeight={phone ? height - 110 : height - 120}><RuneView scroll maxHeight={phone ? height - 154 : height - 164} gap={10}>{note}</RuneView></Paper>
    </RuneView> : null}
    <RuneView anchor="bottom" safe inset={10}><Fine color={NIGHT_DIM}>{notice ?? `${orbitSlotLabel(session.slot)} · ${household.credits} credits · ${household.pantry} rations · ${household.beings} beings`}</Fine></RuneView>
  </RuneView>;
}

interface Chapter { id: string; label: string; icon: GameIconName; page: string }

/** The pause menu: the household handbook, open to today's page. */
function Handbook({ preferences, onPreference, whileLoading }: Prefs & { whileLoading: Loader }) {
  const ctx = useGameContext();
  const { commands } = useGame();
  const household = useStore(householdStore, (state) => {
    const working = workingMember(state);
    return {
      day: state.day, credits: state.credits, pantry: state.pantry, debt: state.debt,
      working: working === null ? null : working.name,
      roll: state.order.flatMap((id) => { const m = state.members[id]; return m === undefined ? [] : [{ id, plan: m.bodyPlan, name: m.name, mood: moodOfNeeds(m.needs).label }]; }),
    };
  });
  const session = useStore(orbitSession);
  const { width, height } = useRuneViewport(), phone = width < 600;
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(menuFocus.id ?? "resume");
  const [leaf, setLeaf] = useState(menuFocus.id !== null && phone);
  const slotLabel = orbitSlotLabel(session.slot);
  const chapters: Chapter[] = [
    { id: "resume", label: "Back to the household", icon: "arrowLeft", page: "1" },
    { id: "save", label: `Save to ${slotLabel}`, icon: "pin", page: "2" },
    { id: "guide", label: "Field guide", icon: "eye", page: "3" },
    { id: "settings", label: "Settings", icon: "gear", page: "8" },
    { id: "credits", label: "Credits", icon: "star", page: "12" },
    { id: "title", label: "Save & step outside", icon: "key", page: "—" },
  ];
  const close = () => commands.run("orbit.resume", {});
  const confirm = (id: string) => {
    setActive(id);
    if (id === "resume") close();
    else if (id === "save") void whileLoading("Writing the household down", async () => { const written = await saveOrbitSlot(ctx); setNotice(written ? `Written into ${slotLabel}` : "This browser could not keep the household"); });
    else if (id === "title") void whileLoading("Writing the household down", async () => { await saveOrbitSlot(ctx); commands.run("orbit.title", {}); });
    if (phone && id !== "resume" && id !== "title") setLeaf(true);
  };
  const time = useGameCalendar((c) => `${String(Math.floor(c.hour)).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`);

  const right = (() => {
    if (active === "guide") return <GuidePage />;
    if (active === "settings") return <RuneView gap={8}><Heading>Settings</Heading><HouseSettings preferences={preferences} onPreference={onPreference} /></RuneView>;
    if (active === "credits") return <CreditsPage />;
    if (active === "save") return <RuneView gap={8}><Heading>Write today down</Heading><Text>{`The household, its beings and their shift go into ${slotLabel}.`}</Text>{notice ? <Text weight={700} color="#c2477f">{notice}</Text> : null}</RuneView>;
    if (active === "title") return <RuneView gap={8}><Heading>Step outside</Heading><Text>The handbook saves the household, then you are back on the porch.</Text></RuneView>;
    return <RuneView gap={8}>
      <Heading>Everyone is waiting</Heading>
      {household.roll.map((m) => <Row key={m.id} gap={10}><Swatch plan={m.plan} size={34} /><Text weight={700} grow={1}>{m.name}</Text><Fine>{m.mood}</Fine></Row>)}
      {notice ? <Text weight={700} color="#c2477f">{notice}</Text> : null}
    </RuneView>;
  })();

  const pageW = phone ? width - 24 : Math.min(440, (width - 120) / 2);
  const pageH = phone ? height - 100 : Math.min(600, height - 110);
  const showLeft = !phone || !leaf, showRight = !phone || leaf;
  return <RuneView anchor="fill" justify="center" items="center" gap={10} onBack={phone && leaf ? () => setLeaf(false) : close} label="The household is paused">
    <RuneView layout="row" gap={4} fill="#5a2e22" radius={12} padding={phone ? 8 : 12} border={{ width: 2, color: "#24110a" }} shadow={{ y: 10, blur: 30, color: "#0008" }}>
      {showLeft ? <Paper width={pageW} height={pageH} radius={6} border={{ width: 0, color: RIM }} padding={phone ? 16 : 24} gap={8} shadow={{ y: 0, blur: 0, color: "#0000" }}>
        <Tag>{`HOUSEHOLD HANDBOOK · ${slotLabel.toUpperCase()}`}</Tag>
        <Row gap={10} items="end"><Heading size={30}>{`Day ${household.day + 1}`}</Heading><Text weight={700} color="#8a4a6f">{time}</Text></Row>
        <Fine>{household.working !== null ? `${household.working} is on shift` : "Between shifts"}</Fine>
        <RuneView gap={2} padding={[6, 0, 0, 0]} label="Handbook">
          {chapters.map((c) => <RuneAction key={c.id} label={c.label} layout="row" items="center" gap={10} padding={[9, 8, 9, 8]} radius={8} fill={active === c.id ? "#f6a6cf66" : "#00000000"} hover="#f6a6cf33" press="#00000018" run={() => confirm(c.id)}>
            <Icon name={c.icon} size={18} color={active === c.id ? "#c2477f" : INK} /><Text grow={1} weight={700}>{c.label}</Text><Fine>{c.page}</Fine>
          </RuneAction>)}
        </RuneView>
      </Paper> : null}
      {showRight ? <Paper width={pageW} height={pageH} radius={6} border={{ width: 0, color: RIM }} padding={phone ? 16 : 24} gap={8} shadow={{ y: 0, blur: 0, color: "#0000" }}>
        {phone ? <Plate tone="plum" label="Contents" onPress={() => setLeaf(false)}><Icon name="arrowLeft" size={16} color={CREAM_TEXT} /><Text weight={700} color={CREAM_TEXT}>Contents</Text></Plate> : null}
        <RuneView scroll maxHeight={pageH - (phone ? 90 : 48)} gap={8}>{right}</RuneView>
      </Paper> : null}
    </RuneView>
    <Fine color={NIGHT_DIM}>{`${household.credits} credits · ${household.pantry} rations · ${household.debt} debt`}</Fine>
  </RuneView>;
}
