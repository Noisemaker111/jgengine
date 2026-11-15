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
import { CAMPAIGN, campaignOrdinal, campaignStore, markStoresRestored, type CampaignReadout } from "../campaign";
import { COLONY_TRAITS, colonyStore, JELLY_PER_WIN, jellyLeft, traitBlocked, type ColonyTrait } from "../colony";
import { hudStore } from "../hudStore";
import { preferences, type CommanderPreferences } from "../preferences";
import { CAMPAIGN_SLOTS, campaignLabel, campaignSlots, commandProfile, loadCampaignRecord, newCampaignRecord, refreshCampaignSlots, saveCampaignRecord } from "../menuSave";
import { Eyebrow, Glyph, InkButton, PlankButton, Row, SealButton, Sheet, Small, Text, Title, WaxSeal, useHudSlice } from "./kit";
import { GILT, INK, OCHRE, WAX } from "./theme";
import { PERSONALITIES, SKIRMISH_PERSONALITIES, type RivalChoice } from "../ai/personality";
import { activeMap, chooseMap, MAPS, sceneSet, type MapId } from "../../maps";

/** Capture-only focus request: a shot declares which order it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

export const credits = mergeCredits({ title: "The makers of the yard", sections: [
  { heading: "Lawn Order", entries: [
    { label: "Art direction", detail: "A blazing summer lawn seen from ant height." },
    { label: "JGengine", detail: "Published engine packages", href: "https://jgengine.com" },
  ] },
  { heading: "Icons", entries: [{ label: "game-icons.net contributors", detail: "CC BY 3.0, the generic verb glyphs; the colony glyphs are drawn for this game", href: "https://game-icons.net" }] },
] }, creditsForSourceIds(ASSET_SOURCE_IDS), {
  title: "Sky, grade and type",
  sections: creditsForLooks({ hdri: ["clear-noon"], lut: ["tropical-lush"], fonts: ["lilita-one", "nunito"] }),
});

export function battleTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface Verb { id: string; label: string; hint?: string; disabled?: boolean; quiet?: boolean }

/** Orders written in ink down the sheet. Native focus and hover choose the order in hand; the wax chevron marks it. */
function OrderList({ verbs, active, onActive, onPick }: { verbs: readonly Verb[]; active: string | null; onActive: (id: string) => void; onPick: (id: string) => void }) {
  return <RuneView gap={2} label="Orders">
    {verbs.map((verb) => <RuneAction key={verb.id} variant="verb" layout="row" label={verb.label} disabled={verb.disabled === true}
      fill={active === verb.id ? "#d9361f14" : "#00000000"} onFocus={() => onActive(verb.id)} onHover={(inside) => { if (inside) onActive(verb.id); }}
      run={() => { onActive(verb.id); onPick(verb.id); }}>
      <Text textStyle="verb" color={active === verb.id ? WAX : INK} text={active === verb.id ? "›" : " "} minWidth={10} />
      <RuneView gap={0} grow={1} shrink>
        <Text textStyle="verb" text={verb.label} {...(verb.quiet === true ? { color: "#4c5a2c" } : {})} />
        {verb.hint === undefined ? null : <Small text={verb.hint} />}
      </RuneView>
    </RuneAction>)}
  </RuneView>;
}

/** The order the track offers next, in the field desk's words. */
function orderLine(campaign: CampaignReadout | null): { eyebrow: string; title: string; brief: string } {
  if (campaign === null) return { eyebrow: "Free skirmish", title: "Dig out the Black Ant Nest", brief: "No orders, no carried stores: the lawn as it stands, sprinkler, mower and all." };
  const ordinal = campaignOrdinal(campaign.index - 1);
  if (campaign.phase === "finished") return { eyebrow: "The campaign is done", title: campaign.title, brief: "Every order is answered. The black nest is an empty hole in the lawn." };
  if (campaign.phase === "cleared") return { eyebrow: `Next order · ${ordinal} of ${campaignOrdinal(campaign.total - 1)}`, title: campaign.title, brief: campaign.brief };
  if (campaign.phase === "failed") return { eyebrow: `Order ${ordinal} failed`, title: campaign.title, brief: campaign.reason ?? campaign.brief };
  return { eyebrow: `Order ${ordinal} of ${campaignOrdinal(campaign.total - 1)}`, title: campaign.title, brief: campaign.brief };
}

/** One kept record's line: mission, stores and playtime. */
function RecordFacts({ slot }: { slot: SaveSlotMeta }) {
  const facts = ([["flag", slotText(slot, "mission")], ["sugar", slotText(slot, "stores")], ["stopwatch", slotText(slot, "playtime")]] as const).filter(([, v]) => v !== null);
  return <Row gap={12} items="center">{facts.map(([icon, value]) => <Row key={icon} gap={4}>{icon === "flag" ? null : <Glyph name={icon} size={13} color={OCHRE} />}<Small text={String(value)} /></Row>)}</Row>;
}

function TakeCommandSheet({ recent, campaign, onTake, width }: { recent: SaveSlotMeta | null; campaign: CampaignReadout | null; onTake: () => void; width: number }) {
  const order = orderLine(campaign);
  const thumb = recent === null ? null : slotText(recent, "thumbnail");
  return <Sheet width={width} label="Take command">
    <Eyebrow text={recent === null ? order.eyebrow : `${campaignLabel(recent.id)} · kept ${recent.savedAt === undefined ? "" : relativeSavedAt(recent.savedAt)}`} />
    <Title text={recent === null ? order.title : (recent.name ?? "Commander")} />
    {thumb === null ? null : <RuneView width={width - 36} height={Math.round((width - 36) * 0.5)} image={thumb} fit="cover" border={{ width: 1, color: "#4c5a2c88" }} />}
    {recent === null ? <Text text={order.brief} /> : <RecordFacts slot={recent} />}
    <SealButton run={onTake}>{recent === null ? "March out" : "Return to the field"}</SealButton>
  </Sheet>;
}

const PRESET_NAMES = ["Myra Vell", "Formica Rufa", "Atta Thorne", "Pogo Barbatus", "Lasius Niger", "Tobin Weaver"];
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
    <Text text="Five orders stand between the red colony and the black ant nest. The first starts with a dropped popsicle." />
    <Small text="Commander" />
    <RuneAction label="Commander" run={() => setSigning(!signing)} minHeight={40} padding={[8, 10, 8, 10]} justify="center"
      border={{ width: signing ? 2 : 1, color: signing ? WAX : INK }} fill="#ffffff30" hover="#1f2a1210">
      <Text textStyle="verb" color={name === "" ? "#4c5a2c99" : INK} text={`${name === "" ? "Sign here" : name}${signing ? "|" : ""}`} />
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
    <Eyebrow text="The field journal" />
    <Title text="Campaign records" />
    {slots.map((slot) => {
      const thumb = slotText(slot, "thumbnail");
      return <Row key={slot.id} gap={10} padding={[8, 0, 8, 0]} border={{ width: 0, color: "#0000" }} items="center">
        <RuneView width={72} height={48} fill="#00000014" items="center" justify="center" {...(thumb === null ? {} : { image: thumb, fit: "cover" as const })}
          border={{ width: slot.id === recentId ? 2 : 1, color: slot.id === recentId ? WAX : "#4c5a2c88" }}>
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

const RIVAL_ROWS: readonly { id: RivalChoice; label: string; blurb: string }[] = [
  ...SKIRMISH_PERSONALITIES.map((id) => ({ id, label: PERSONALITIES[id].label, blurb: PERSONALITIES[id].blurb })),
  { id: "roll", label: "Surprise me", blurb: "Learn who runs the black nest when their first raid comes over the grass." },
];

function SkirmishSheet({ onMarch, width }: { onMarch: (rival: RivalChoice) => void; width: number }) {
  const [rival, setRival] = useState<RivalChoice>("roll");
  return <Sheet width={width} label="Free skirmish">
    <Eyebrow text="No orders" />
    <Title text="Free skirmish" />
    <Text text="The lawn as it stands, every clock running. Dig out the black nest to win. Choose who runs it:" />
    {RIVAL_ROWS.map((row) =>
      <RuneAction key={row.id} label={row.label} role="radio" run={() => setRival(row.id)} layout="row" gap={10} padding={[4, 4, 4, 4]} hover="#1f2a1210" radius={2} items="center">
        <RuneView width={22} height={22} border={{ width: 2, color: INK }} radius={11} items="center" justify="center">
          {rival === row.id ? <RuneView width={10} height={10} radius={5} fill={WAX} /> : null}
        </RuneView>
        <RuneView gap={0} grow={1} shrink><Text textStyle="verb" text={row.label} /><Small text={row.blurb} /></RuneView>
      </RuneAction>)}
    <PlankButton run={() => onMarch(rival)}>Into the yard</PlankButton>
  </Sheet>;
}

/** The campaign map between battles: the route across both lawns, and the colony the jelly breeds. */
function ColonySheet({ ctx, width }: { ctx: GameContext; width: number }) {
  // The stores are read fresh each render; a breed bumps `tick` so the sheet redraws at once.
  const [, setTick] = useState(0);
  const progress = campaignStore.read(ctx);
  const traits = colonyStore.read(ctx).traits;
  const wins = progress.won.length;
  const jelly = jellyLeft(wins, traits);
  const nextIndex = CAMPAIGN.findIndex((step) => !progress.won.includes(step.mission.id));
  const lawns = (Object.keys(MAPS) as MapId[]).map((map) => ({ map, steps: CAMPAIGN.map((step, index) => ({ step, index })).filter((entry) => entry.step.map === map) }));
  const breed = (trait: ColonyTrait) => { ctx.game.commands.run("colony.buy", { trait: trait.id }); setTick((n) => n + 1); };
  const traitRow = (trait: ColonyTrait) => {
    const owned = traits.includes(trait.id);
    const blocked = traitBlocked(trait.id, wins, traits);
    return <Row key={trait.id} justify="between" padding={[2, 0, 2, 0]}>
      <RuneView gap={0} grow={1} shrink><Text textStyle="verb" text={trait.label} /><Small text={trait.blurb} /></RuneView>
      {owned ? <Small color={WAX} text="Bred" /> : <InkButton label={`Breed ${trait.label}`} disabled={blocked !== null} run={() => breed(trait)}>{`Breed · ${trait.cost}`}</InkButton>}
    </Row>;
  };
  return <Sheet width={width} label="The colony">
    <Eyebrow text={nextIndex < 0 ? "Every lawn is held" : `Next order · ${campaignOrdinal(nextIndex)} · ${CAMPAIGN[nextIndex]!.mission.title}`} />
    <Title text="The campaign map" />
    {lawns.map(({ map, steps }) => <RuneView key={map} gap={4}>
      <Small text={MAPS[map].label} />
      <Row gap={0} label={`${MAPS[map].label} route`}>
        {steps.map(({ step, index }, i) => {
          const won = progress.won.includes(step.mission.id);
          const next = index === nextIndex;
          return <Row key={step.mission.id} gap={0}>
            {i > 0 ? <RuneView width={18} height={3} fill={won || next ? WAX : "#1f2a1240"} /> : null}
            <RuneView width={30} height={30} radius={15} items="center" justify="center" label={`${campaignOrdinal(index)} ${step.mission.title}${won ? ", won" : next ? ", next" : ""}`}
              border={{ width: next ? 3 : 2, color: next ? OCHRE : INK }} {...(won ? { fill: WAX } : next ? { fill: "#e08a1e33" } : {})}>
              <Text textStyle="verb" color={won ? GILT : INK} text={campaignOrdinal(index)} />
            </RuneView>
          </Row>;
        })}
      </Row>
    </RuneView>)}
    <Row justify="between" padding={[6, 0, 2, 0]}>
      <Text textStyle="verb" text="Royal jelly" />
      <Text textStyle="number" text={`${jelly}`} />
    </Row>
    <Small text={`Each order won pays ${JELLY_PER_WIN} jelly. Traits last the whole campaign; a free skirmish starts from nothing.`} />
    <Eyebrow text="Queen traits" />
    {COLONY_TRAITS.filter((t) => t.kind === "queen").map(traitRow)}
    <Eyebrow text="Caste research" />
    {COLONY_TRAITS.filter((t) => t.kind === "caste").map(traitRow)}
  </Sheet>;
}

/** The field report after a battle: the outcome, the time it took and what still stands. */
function ReportSheet({ width }: { width: number }) {
  const r = useHudSlice((h) => ({ won: h.phase === "won", elapsed: h.elapsed, waves: h.wavesSent, troops: h.playerUnits }));
  return <Sheet width={width} label="Field report">
    <Eyebrow text="Field report" />
    <Title text={r.won ? "The lawn is ours" : "The red nest has fallen"} />
    <Text text={r.won ? "Your Red broke the black nest. The reinforcements have been silenced." : "The Black Ants breached your walls. Gather sugar early, build a Barracks and cover the road with a Acid Mound."} />
    {([["Battle time", battleTime(r.elapsed)], ["Waves faced", String(r.waves)], ["Troops standing", String(r.troops)]] as const).map(([label, value]) =>
      <Row key={label} justify="between" padding={[3, 0, 3, 0]}><Small text={label} /><Text textStyle="number" text={value} /></Row>)}
  </Sheet>;
}

/** An ink tick-box: a switch for the keys and pad, a mark for the eye. */
function InkSwitch({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return <RuneAction label={label} role="switch" run={onToggle} layout="row" gap={10} padding={[4, 4, 4, 4]} hover="#1f2a1210" radius={2} items="center">
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
      : <RuneAction label={row.label} height={30} fill="#1f2a1218" border={{ width: 1, color: "#1f2a1266" }} padding={[11, 0, 11, 0]} onAdjust={adjust} onDrag={(d) => {
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
    ["reducedMotion", "Reduce UI motion", "Cards lie still and buttons stop pulsing."],
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
        fill={c === active ? WAX : "#00000010"} border={{ width: 1, color: c === active ? "#6a120a" : "#4c5a2c66" }} hover="#1f2a1214">
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
 * Lawn Order's front end is the war table: the title is a weathered survey of the yard under the
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
    refreshCampaignSlots();
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
    refreshCampaignSlots();
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
      { id: "title", label: "Return to title", hint: "Writes the record, then back to the title", quiet: true },
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
          <Small grow={1} shrink text={notice ?? bind(() => `${hudStore.get().sugar} sugar · ${hudStore.get().leaf} leaf in the stores`)} />
          <WaxSeal size={52} />
        </Row>
      </RuneView>
    </RuneView>;
    const detail = active === "settings" ? <FieldSettings ctx={ctx} width={sheetWidth} /> : active === "credits" ? <CreditsSheet width={sheetWidth} /> : null;
    return page(lead, detail, null, () => run("match.resume"));
  }

  const held = slots.filter((slot) => !slot.empty).length;
  const verbs: Verb[] = [
    ...(ended ? [{ id: "report", label: "Field report", hint: phase === "won" ? "The lawn is ours" : "The red nest has fallen" }] : []),
    { id: "continue", label: "Take command", hint: campaign !== null && campaign.phase !== "finished" && campaign.map !== activeMap() ? `March to ${campaign.mapLabel} for ${order.title}` : recent === null ? (campaign === null ? "March into a free skirmish" : `March on ${order.title}`) : `Resume ${recent.name ?? campaignLabel(recent.id)}` },
    { id: "new", label: "New campaign", hint: `Opens ${campaignLabel(newSlot)}` },
    ...(campaign !== null ? [{ id: "colony", label: "Colony", hint: `Campaign map · ${jellyLeft(campaignStore.read(ctx).won.length, colonyStore.read(ctx).traits)} royal jelly` }] : []),
    { id: "skirmish", label: "Free skirmish", hint: `${MAPS[activeMap()].label}, no orders` },
    { id: "map", label: `Lawn: ${MAPS[activeMap()].label}`, hint: `Switch to ${MAPS[sceneSet.next()].label}` },
    { id: "missions", label: "Campaign records", hint: `${held} of ${slots.length} kept` },
    { id: "settings", label: "Settings", hint: "Field preferences, sound, controls" },
    { id: "credits", label: "Credits" },
  ];
  // The offered mission is fought on its own lawn: travel there first (the record carries the track).
  const travel = (map: MapId) => whileLoading(`Marching to ${MAPS[map].label}`, async () => { await saveCampaignRecord(ctx); chooseMap(map); });
  const take = () => {
    if (campaign !== null && campaign.phase !== "finished" && campaign.map !== activeMap()) { void travel(campaign.map); return; }
    if (recent !== null) void openRecord(recent.id); else run("match.start");
  };
  const pick = (id: string) => {
    if (id === "continue") take();
    else if (id === "skirmish") run("match.skirmish");
    else if (id === "map") chooseMap(sceneSet.next());
    else if (id === "missions") refreshCampaignSlots();
  };
  const detail = active === "report" ? <ReportSheet width={sheetWidth} />
    : active === "continue" ? <TakeCommandSheet recent={recent} campaign={campaign} onTake={take} width={sheetWidth} />
    : active === "new" ? <CommissionSheet slot={newSlot} name={name} onName={setName} onBegin={() => startNew(newSlot)} width={sheetWidth} />
    : active === "skirmish" ? <SkirmishSheet onMarch={(rival) => commands.run("match.skirmish", { rival })} width={sheetWidth} />
    : active === "colony" ? <ColonySheet ctx={ctx} width={sheetWidth} />
    : active === "missions" ? <RecordsSheet slots={slots} recentId={recent?.id ?? null} onOpen={(slot) => void openRecord(slot)} onNew={(slot) => startNew(slot)} width={sheetWidth} />
    : active === "settings" ? <FieldSettings ctx={ctx} width={sheetWidth} />
    : active === "credits" ? <CreditsSheet width={sheetWidth} /> : null;
  const surveyWidth = phone ? width - 32 : 420;
  const lead = <RuneView variant="sheet" width={surveyWidth} padding={[24, 26, 26, 26]} gap={10} fill="#fff0b8" label="Lawn Order">
    <Row justify="between" items="start">
      <RuneView gap={2}>
        <Eyebrow text="An ant-colony war in the backyard" />
        <Text textStyle="wordmark" text="LAWN" />
        <Text textStyle="wordmark" text="ORDER" />
      </RuneView>
      <WaxSeal size={phone ? 64 : 88} emblem="ant" />
    </Row>
    <RuneView gap={1}><Eyebrow text={order.eyebrow} /><Text textStyle="verb" text={order.title} /></RuneView>
    <OrderList verbs={verbs} active={active} onActive={setActive} onPick={pick} />
  </RuneView>;
  const foot = <Row gap={20} padding={[6, 12, 6, 12]} fill="#00000055" radius={2}>
    <Text textStyle="gilt" text={notice ?? `Service record · ${prefs.wins} victories · ${prefs.losses} defeats`} />
    {phone ? null : <Text textStyle="gilt" color="#e8f0c8" text="↑↓ choose   Enter take" />}
  </Row>;
  return page(lead, detail, foot);
}
