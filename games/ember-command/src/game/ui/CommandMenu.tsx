import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CreditsPane } from "@jgengine/react/gameMenuSaves";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useGame } from "@jgengine/react/hooks";
import { useMenuNav } from "@jgengine/react/menuNav";
import { useGameContext } from "@jgengine/react/provider";
import { relativeSavedAt, useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";

import { campaignOrdinal, markStoresRestored, type CampaignReadout } from "../campaign";
import { hudStore } from "../hudStore";
import { preferences, type CommanderPreferences } from "../preferences";
import { CAMPAIGN_SLOTS, campaignLabel, campaignSlots, commandProfile, loadCampaignRecord, newCampaignRecord, refreshCampaignSlots, saveCampaignRecord } from "../menuSave";
import { MapArt } from "./kit/MapArt";
import { WaxSeal } from "./kit/WaxSeal";
import { WAX } from "./theme";

/** Capture-only focus request: a shot declares which order it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

const credits = mergeCredits({ title: "The makers of the vale", sections: [
  { heading: "Ember Command", entries: [
    { label: "Original miniatures & art direction", detail: "Bastions, warriors, pennants and resource props authored for this game." },
    { label: "JGengine", detail: "Published engine packages", href: "https://jgengine.com" },
  ] },
  { heading: "Icons", entries: [{ label: "game-icons.net contributors", detail: "CC BY 3.0; individual credits in iconData.ts", href: "https://game-icons.net" }] },
  { heading: "Type", entries: [{ label: "IM Fell English SC and Alegreya", detail: "SIL Open Font License 1.1" }] },
] }, creditsForSourceIds(["kaykit-adventurers", "kaykit-city-builder", "quaternius-stylized-nature", "kaykit-dungeon"]));

export function battleTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface Verb {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  quiet?: boolean;
}

/**
 * Orders written in ink down the sheet. `useMenuNav` owns the focus order for keys, pad and pointer;
 * the wax chevron follows the current order. Each button holds only its order's words, and the hint
 * sits beside it, so an order reads (and is found) by exactly what it says.
 */
function OrderList({
  verbs,
  initialId,
  enabled,
  onPick,
  onBack,
  onActive,
}: {
  verbs: readonly Verb[];
  initialId: string;
  enabled: boolean;
  onPick: (id: string) => void;
  onBack?: () => void;
  onActive: (id: string | null) => void;
}) {
  const nav = useMenuNav({
    ids: verbs.map((verb) => verb.id),
    disabled: verbs.filter((verb) => verb.disabled === true).map((verb) => verb.id),
    initialId,
    enabled,
    onConfirm: onPick,
    ...(onBack === undefined ? {} : { onBack }),
  });
  // Report only when the order in hand changes: the parent's callback is a fresh closure each render.
  const report = useRef(onActive);
  report.current = onActive;
  useEffect(() => report.current(nav.activeId), [nav.activeId]);
  return (
    <nav className="ec-orders-list" {...nav.containerProps} data-jg-cursor-scope="">
      {verbs.map((verb) => (
        <div key={verb.id} className="ec-order-row" data-quiet={verb.quiet === true ? "" : undefined} data-active={nav.activeId === verb.id ? "" : undefined}>
          <button
            type="button"
            className="ec-order-verb"
            disabled={verb.disabled}
            {...({ ...nav.itemProps(verb.id) } as Record<string, unknown>)}
            onClick={() => {
              nav.setActive(verb.id);
              onPick(verb.id);
            }}
          >
            {verb.label}
          </button>
          {verb.hint === undefined ? null : <span className="ec-order-hint">{verb.hint}</span>}
        </div>
      ))}
      <GameCursor variant="chevron" color={WAX} arm={14} gap={10} thickness={3} />
    </nav>
  );
}

/** Hands focus to a detail sheet once it is drawn: a tap picks an order and shows its sheet in the same
 * moment, so the sheet may be a frame away. On a phone the sheet lies below the order list, so it is
 * also brought up to the top of the screen. */
function enterSheet(selector: string, tries = 6): void {
  const target = document.querySelector<HTMLElement>(selector);
  if (target === null) {
    if (tries > 0 && typeof requestAnimationFrame === "function") requestAnimationFrame(() => enterSheet(selector, tries - 1));
    return;
  }
  target.focus({ preventScroll: true });
  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches) {
    target.closest(".ec-detail")?.scrollIntoView({ block: "start" });
  }
}

/** A loose sheet pinned to the war table: every detail pane is written on one. */
function Sheet({ children, className, pane }: { children: ReactNode; className?: string; pane: string }) {
  return (
    <GameFrame material="paper" cut="box" depth={4} padding="26px 28px 26px" className={`ec-sheet ec-ink-sheet ${className ?? ""}`} data-pane={pane}>
      <i className="ec-pin" aria-hidden />
      {children}
    </GameFrame>
  );
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

/** One kept record's line: mission, stores, playtime and when it was written. */
function RecordFacts({ slot }: { slot: SaveSlotMeta }) {
  const mission = typeof slot.meta.mission === "string" ? slot.meta.mission : null;
  const stores = typeof slot.meta.stores === "string" ? slot.meta.stores : null;
  const playtime = typeof slot.meta.playtime === "string" ? slot.meta.playtime : null;
  return (
    <span className="ec-record-facts">
      {mission === null ? null : <span><GameIcon name="flag" size={13} /> {mission}</span>}
      {stores === null ? null : <span><GameIcon name="coin" size={13} /> {stores}</span>}
      {playtime === null ? null : <span><GameIcon name="hourglass" size={13} /> {playtime}</span>}
    </span>
  );
}

function thumbOf(slot: SaveSlotMeta): string | null {
  return typeof slot.meta.thumbnail === "string" && slot.meta.thumbnail.length > 0 ? slot.meta.thumbnail : null;
}

/** Take command: the last record's dispatch, or the order the track offers when nothing is kept. */
function TakeCommandSheet({ recent, campaign, onTake }: { recent: SaveSlotMeta | null; campaign: CampaignReadout | null; onTake: () => void }) {
  const order = orderLine(campaign);
  return (
    <Sheet pane="take">
      <span className="ec-eyebrow">{recent === null ? order.eyebrow : `${campaignLabel(recent.id)} · kept ${recent.savedAt === undefined ? "" : relativeSavedAt(recent.savedAt)}`}</span>
      <h2 className="ec-sheet-title">{recent === null ? order.title : (recent.name ?? "Commander")}</h2>
      {recent !== null && thumbOf(recent) !== null ? <img className="ec-sheet-thumb" src={thumbOf(recent)!} alt="" /> : null}
      {recent === null ? <p className="ec-sheet-text">{order.brief}</p> : <RecordFacts slot={recent} />}
      <GameFrame as="button" material="enamel" tint={WAX} edge="#3a0b06" cut="hex" depth={14} padding="11px 26px" className="ec-seal-button" onClick={onTake}>
        {recent === null ? "March out" : "Return to the field"}
      </GameFrame>
    </Sheet>
  );
}

/** New campaign: a commission to sign. The record it opens is named, and replacing one is said aloud. */
function CommissionSheet({ slot, name, onName, onBegin }: { slot: string | null; name: string; onName: (next: string) => void; onBegin: () => void }) {
  return (
    <Sheet pane="new-campaign">
      <span className="ec-eyebrow">Commission</span>
      <h2 className="ec-sheet-title">A new campaign</h2>
      <p className="ec-sheet-text">Five orders stand between the Vanguard and the Marauder Warcamp. The first opens with the muster.</p>
      <label className="ec-ink-field">
        <span>Commander</span>
        <input
          data-new-campaign-name=""
          value={name}
          maxLength={24}
          placeholder="Sign here"
          onChange={(event) => onName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onBegin(); } }}
        />
      </label>
      <p className="ec-sheet-small">{slot === null ? "No campaign record is free." : `This opens ${campaignLabel(slot)}; a record already there is replaced.`}</p>
      <GameFrame as="button" material="enamel" tint={WAX} edge="#3a0b06" cut="hex" depth={14} padding="11px 26px" className="ec-seal-button" data-new-campaign-start="" disabled={slot === null} onClick={onBegin}>
        Seal the commission
      </GameFrame>
    </Sheet>
  );
}

/** The kept records as three folios, each with its last look at the field. */
function RecordsSheet({ slots, recentId, enabled, onOpen, onNew, onBack }: {
  slots: readonly SaveSlotMeta[];
  recentId: string | null;
  enabled: boolean;
  onOpen: (slot: string) => void;
  onNew: (slot: string) => void;
  onBack: () => void;
}) {
  const take = (id: string) => {
    const slot = slots.find((entry) => entry.id === id);
    if (slot === undefined) return;
    if (slot.empty) onNew(id);
    else onOpen(id);
  };
  const nav = useMenuNav({ ids: slots.map((slot) => slot.id), enabled, onConfirm: take, onBack });
  return (
    <Sheet pane="records">
      <span className="ec-eyebrow">The field desk</span>
      <h2 className="ec-sheet-title">Campaign records</h2>
      <div className="ec-folios" {...nav.containerProps} data-jg-cursor-scope="">
        {slots.map((slot) => {
          const thumb = thumbOf(slot);
          return (
            <div key={slot.id} className="ec-folio" data-empty={slot.empty ? "" : undefined} data-recent={slot.id === recentId ? "" : undefined}>
              <div className="ec-folio-plate" aria-hidden>
                {thumb === null ? <WaxSeal size={34} wax={slot.empty ? "#8a7a64" : WAX} emblem={slot.empty ? "star" : "ember"} /> : <img src={thumb} alt="" />}
              </div>
              <div className="ec-folio-text">
                <strong>{campaignLabel(slot.id)}</strong>
                <span className="ec-folio-name">{slot.empty ? "Unwritten" : (slot.name ?? "Commander")}</span>
                {slot.empty ? <span className="ec-sheet-small">No campaign kept here</span> : <RecordFacts slot={slot} />}
                {slot.empty || slot.savedAt === undefined ? null : <span className="ec-sheet-small">Written {relativeSavedAt(slot.savedAt)}</span>}
              </div>
              <button type="button" className="ec-ink-button" data-record-take={slot.id} {...({ ...nav.itemProps(slot.id) } as Record<string, unknown>)} onClick={() => take(slot.id)}>
                {slot.empty ? "Begin" : "Open"}
              </button>
            </div>
          );
        })}
        <GameCursor variant="brackets" color={WAX} gap={3} arm={9} thickness={2} />
      </div>
    </Sheet>
  );
}

/** Free skirmish: the vale without the campaign track. */
function SkirmishSheet({ onMarch }: { onMarch: () => void }) {
  return (
    <Sheet pane="skirmish">
      <span className="ec-eyebrow">No orders</span>
      <h2 className="ec-sheet-title">Free skirmish</h2>
      <p className="ec-sheet-text">The vale as it stands: a keep, a purse and the Warcamp across the river. No campaign track, no carried stores. Raze the Warcamp to win.</p>
      <GameFrame as="button" material="wood" cut="notch" depth={10} padding="10px 22px" className="ec-plank-button" onClick={onMarch}>
        Into the vale
      </GameFrame>
    </Sheet>
  );
}

/** The field report after a battle ends: the outcome, the time it took and what still stands. */
function ReportSheet() {
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
  const won = hud.phase === "won";
  return (
    <Sheet pane="report">
      <span className="ec-eyebrow">Field report</span>
      <h2 className="ec-sheet-title">{won ? "The vale is yours" : "The keep has fallen"}</h2>
      <p className="ec-sheet-text">
        {won
          ? "Your Vanguard broke the Warcamp. The reinforcements have been silenced."
          : "The Marauders breached your walls. Gather gold early, build a Barracks and cover the road with a Guard Tower."}
      </p>
      <dl className="ec-ledger-lines">
        {([["Battle time", battleTime(hud.elapsed)], ["Waves faced", String(hud.wavesSent)], ["Troops standing", String(hud.playerUnits)]] as const).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}

/** An ink tick-box drawn on the sheet: a switch for the keyboard, a mark for the eye. */
function InkSwitch({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="ec-ink-switch-row">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="ec-ink-switch" onClick={onToggle}>
        <svg viewBox="0 0 28 28" aria-hidden>
          <path d="M3 4 L25 3 L24.5 25 L3.5 24.5 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          {on ? <path d="M7 14 L12 20 L23 6" fill="none" stroke="#8e1f17" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </svg>
      </button>
    </div>
  );
}

/** Field preferences and the shell's own settings, on one sheet. */
function FieldSettings() {
  const ctx = useGameContext();
  const settings = useSettings();
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  const toggles: [keyof Pick<CommanderPreferences, "largeText" | "highContrast" | "reducedMotion">, string, string][] = [
    ["largeText", "Larger HUD text", "Enlarge command labels and field reports."],
    ["highContrast", "High contrast", "Heavier ink and solid backings."],
    ["reducedMotion", "Reduce UI motion", "Sheets lie still and seals stop pulsing."],
  ];
  return (
    <Sheet className="ec-settings-sheet" pane="settings">
      <span className="ec-eyebrow">Settings</span>
      <h2 className="ec-sheet-title">Field preferences</h2>
      <div className="ec-sheet-body">
        <div className="ec-ink-switches">
          {toggles.map(([key, label, hint]) => (
            <InkSwitch key={key} label={label} hint={hint} on={prefs[key]} onToggle={() => store.set({ [key]: !prefs[key] })} />
          ))}
        </div>
        <SettingsTabs className="ec-tabs" categories={categories} activeId={activeId} onSelect={setChosen} />
        {active === null ? null : <SettingsSection category={active} heading={false} />}
      </div>
    </Sheet>
  );
}

function CreditsSheet() {
  return (
    <Sheet className="ec-credits-sheet" pane="credits">
      <CreditsPane sections={credits.sections} notice={credits.notice} heading="Credits" />
    </Sheet>
  );
}

/**
 * Ember Command's front end is the war table. The title is a weathered survey of the vale under the
 * campaign's wax seal, with the orders written down it; the pause is a leather dispatch case holding
 * the orders on hold. Every detail pane is a loose sheet pinned beside them.
 */
export function CommandMenu(): ReactNode {
  const ctx = useGameContext();
  const { commands } = useGame();
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const settings = useSettings();
  const slots = useSaveSlots(campaignSlots);
  const [name, setName] = useState(commandProfile.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const recent = campaignSlots.mostRecent();
  const openSlot = ctx.game.save?.slot() ?? CAMPAIGN_SLOTS[0];
  // A battle opened without a campaign record writes to the shell's own slot: say "the campaign", not its id.
  const campaignSlotOpen = (CAMPAIGN_SLOTS as readonly string[]).includes(openSlot);
  const openName = campaignSlotOpen ? campaignLabel(openSlot) : "the campaign record";
  const newSlot = slots.find((slot) => slot.empty)?.id ?? CAMPAIGN_SLOTS[0];

  useEffect(() => {
    setNotice(null);
    refreshCampaignSlots();
  }, [hud.phase]);

  // Escape is the field desk's own key: pause a running battle, resume a held one.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented || settings.isOpen) return;
      if (hud.phase === "playing") { event.preventDefault(); commands.run("match.pause", {}); }
      else if (hud.phase === "paused") { event.preventDefault(); commands.run("match.resume", {}); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commands, hud.phase, settings.isOpen]);

  const run = useCallback((command: string) => { commands.run(command, {}); }, [commands]);

  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try { await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]); }
    finally { setBusy(null); }
  };

  const openRecord = (slot: string) =>
    whileLoading("Opening the campaign record", async () => {
      const opened = await loadCampaignRecord(ctx, slot);
      if (!opened) { setNotice(`${campaignLabel(slot)} is empty.`); return; }
      markStoresRestored(ctx);
      setName(commandProfile.name);
      refreshCampaignSlots();
      run("match.start");
    });

  const startNew = (slot: string | null) => {
    if (slot === null) return;
    void whileLoading("Sealing the commission", async () => {
      await newCampaignRecord(ctx, slot, name);
      run("match.start");
    });
  };

  const saveHere = () =>
    whileLoading("Writing the campaign record", async () => {
      await saveCampaignRecord(ctx);
      setNotice(`Orders written to ${openName}`);
    });

  if (hud.phase === "playing") return null;

  const campaign = hud.campaign;
  const ended = hud.phase === "won" || hud.phase === "lost";
  const busyCurtain = busy === null ? null : (
    <div className="ec-menu-busy" role="status" aria-live="polite">
      <WaxSeal size={58} />
      <span>{busy}</span>
    </div>
  );

  if (hud.phase === "paused") {
    const order = orderLine(campaign);
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
      else if (id === "settings") enterSheet(".ec-settings-sheet [role='switch']");
      else if (id === "credits") enterSheet("[data-credits-scroller]");
      else if (id === "title") void whileLoading("Writing the campaign record", async () => { await saveCampaignRecord(ctx); run("match.title"); });
    };
    return (
      <div className="ec-front ec-dispatch" aria-label="Orders on hold">
        <div className="ec-table-dark" aria-hidden />
        <GameFrame material="leather" tint="#5a3520" cut="chamfer" depth={16} padding="34px 18px 20px" className="ec-case">
          <span className="ec-case-flap" aria-hidden>
            <i className="ec-buckle" />
          </span>
          <GameFrame material="paper" cut="torn" depth={12} padding="22px 24px 34px" className="ec-letter ec-ink-sheet">
            <span className="ec-eyebrow">{campaign === null ? order.eyebrow : `${order.eyebrow} · ${campaign.title}`}</span>
            <h1 className="ec-letter-title">Orders on hold</h1>
            <p className="ec-sheet-text">The field is frozen. Review the plan before the next wave.</p>
            <OrderList verbs={verbs} initialId={menuFocus.id ?? "resume"} enabled={busy === null} onPick={pick} onBack={() => run("match.resume")} onActive={setActive} />
            <p className="ec-sheet-small ec-letter-note">{notice ?? `${hud.gold} gold · ${hud.lumber} lumber in the stores`}</p>
            <WaxSeal size={62} className="ec-letter-seal" />
          </GameFrame>
        </GameFrame>
        <section className="ec-detail" aria-live="polite">
          {active === "settings" ? <FieldSettings /> : active === "credits" ? <CreditsSheet /> : null}
        </section>
        {busyCurtain}
      </div>
    );
  }

  const order = orderLine(campaign);
  const held = slots.filter((slot) => !slot.empty).length;
  const verbs: Verb[] = [
    ...(ended ? [{ id: "report", label: "Field report", hint: hud.phase === "won" ? "The vale is yours" : "The keep has fallen" }] : []),
    { id: "continue", label: "Take command", hint: recent === null ? (campaign === null ? "March into a free skirmish" : `March on ${order.title}`) : `Resume ${recent.name ?? campaignLabel(recent.id)}` },
    { id: "new", label: "New campaign", hint: `Opens ${campaignLabel(newSlot)}` },
    { id: "skirmish", label: "Free skirmish", hint: "The vale without orders" },
    { id: "missions", label: "Campaign records", hint: `${held} of ${slots.length} kept` },
    { id: "settings", label: "Settings", hint: "Field preferences, sound, controls" },
    { id: "credits", label: "Credits" },
  ];
  const take = () => {
    if (recent !== null) void openRecord(recent.id);
    else run("match.start");
  };
  const pick = (id: string) => {
    if (id === "continue") take();
    else if (id === "new") enterSheet("[data-new-campaign-name]");
    else if (id === "skirmish") run("match.skirmish");
    else if (id === "missions") {
      refreshCampaignSlots();
      enterSheet("[data-record-take]");
    } else if (id === "settings") enterSheet(".ec-settings-sheet [role='switch']");
    else if (id === "credits") enterSheet("[data-credits-scroller]");
  };
  const detail = (id: string | null): ReactNode => {
    if (id === "report") return <ReportSheet />;
    if (id === "continue") return <TakeCommandSheet recent={recent} campaign={campaign} onTake={take} />;
    if (id === "new") return <CommissionSheet slot={newSlot} name={name} onName={setName} onBegin={() => startNew(newSlot)} />;
    if (id === "skirmish") return <SkirmishSheet onMarch={() => run("match.skirmish")} />;
    if (id === "missions") {
      return (
        <RecordsSheet
          slots={slots}
          recentId={recent?.id ?? null}
          enabled={busy === null}
          onOpen={(slot) => void openRecord(slot)}
          onNew={(slot) => startNew(slot)}
          onBack={() => document.querySelector<HTMLElement>('.ec-orders-list [aria-current="true"]')?.focus()}
        />
      );
    }
    if (id === "settings") return <FieldSettings />;
    if (id === "credits") return <CreditsSheet />;
    return null;
  };

  return (
    <div className="ec-front ec-title" data-title-menu="" aria-label="Ember Command">
      <div className="ec-table-dark" aria-hidden />
      <GameFrame material="paper" tint="#e6d3a8" cut="torn" depth={16} padding="30px 34px 44px" className="ec-survey ec-ink-sheet">
        <MapArt />
        <WaxSeal size={92} className="ec-survey-seal" />
        <span className="ec-eyebrow">The Highland Vale</span>
        <h1 className="ec-wordmark">
          <span>Ember</span>
          <span>Command</span>
        </h1>
        <p className="ec-survey-order">
          <span className="ec-eyebrow">{order.eyebrow}</span>
          <strong>{order.title}</strong>
        </p>
        <OrderList
          verbs={verbs}
          initialId={menuFocus.id ?? (ended ? "report" : "continue")}
          enabled={busy === null}
          onPick={pick}
          onActive={(id) => {
            setActive(id);
            if (id === "missions") refreshCampaignSlots();
          }}
        />
      </GameFrame>
      <section className="ec-detail" aria-live="polite">
        {detail(active)}
      </section>
      <footer className="ec-desk-foot">
        <span>{notice ?? `Service record · ${prefs.wins} victories · ${prefs.losses} defeats`}</span>
        <span className="ec-keys">
          <b>↑↓</b> choose <b>Enter</b> take
        </span>
      </footer>
      {busyCurtain}
    </div>
  );
}
