import type { RuneUi, RuneUiNode as N } from "@jgengine/core/ui/runeUi.view";
import type { SettingsCategoryView, SettingsRow } from "@jgengine/core/settings/settings.view";
import type { SettingsStore } from "@jgengine/core/settings/settingsModel";
import type { View } from "../../controls";
import { weaponReadout } from "../../combat";
import { CACHE_WEIGHT, loadOf } from "../../haul";
import { sealMark } from "../../deep";
import { crushDamage, STRATA } from "../../strata";
import { DEEPWARD_CREDITS } from "../../credits";

/*
 * Deepward's visor and consoles as a Rune widget tree. Values that move every
 * tick are `slot` indices into the shared value buffer (bound once by the
 * layer); everything that changes shape is baked into the spec and rebuilt only
 * when `hudSignature`/`menuSignature` says it changed.
 */

const TEAL = "#9cddd1";
const AMBER = "#e2bd6e";
const RED = "#ff6a52";
const INK = "#e8fbf5";
const DIM = "rgba(190,224,214,0.72)";
const FAINT = "rgba(214,241,233,0.8)";
const PANEL = "#16232a";
const EDGE = "rgba(156,221,209,0.16)";

const tone = (warn: number, bad: number) => ({ colors: [TEAL, AMBER, RED], warn, bad });
const meterTone = tone(35, 15);
const suitTone = tone(60, 35);

const panel = (children: N[], style: Record<string, unknown> = {}): N => ({ k: "panel", children, fill: PANEL, radius: 6, border: 1, border_color: EDGE, ...style });
const row = (children: N[], style: Record<string, unknown> = {}): N => ({ k: "row", children, ...style });
const col = (children: N[], style: Record<string, unknown> = {}): N => ({ k: "panel", children, ...style });
const gap = (size = 8): N => ({ k: "gap", size });
const txt = (text: string, style: Record<string, unknown> = {}): N => ({ k: "text", text, ...style });
const live = (ui: RuneUi, name: string, style: Record<string, unknown> = {}): N => ({ k: "text", slot: ui.slot(name), ...style });
const tag = (text: string): N => txt(text, { size: 11, mono: true, color: DIM, case: "upper", tracking: 1.6 });
const line = (color = EDGE): N => ({ k: "line", color, h: 1 });

const FLAG_SVG = '<path d="M4 22V4m0 1h13l-2.5 4 2.5 4H4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';
const GUN_SVG = '<path d="M2 9h13l3-3h4v4h-3l-1 4v3h-3v-2H9v3H5v-4H2z" fill="currentColor"/>';

export interface HudExtra {
  room: string;
  target: string | null;
  channel: string | null;
  docket: { life: number; scrip: number; stash: number; returns: number; lost: number; standing: string; next: string; brief?: string | undefined; base?: { food: number; water: number; power: number; meals: number; flasks: number } | undefined; last?: { kind: string; reason: string } | null | undefined } | null;
}

const CHANNEL_LABEL: Record<string, string> = { search: "Searching", harvest: "Working", scan: "Scanning", supply: "Taking", creature: "Scanning", zero: "Copying" };

function computer(ui: RuneUi, v: View): N {
  const dive = v.dive!;
  const tank = dive.tankSeconds;
  const airTone = tone(tank * 0.5, 25);
  const low = dive.oxygen <= 25, airOut = dive.oxygen <= 0;
  const sideRows: N[] = [
    row([tag("Suit"), { k: "cells", slot: ui.slot("health"), max: 100, count: 10, tone: suitTone, cell_w: 6, cell_h: 12, gap: 2 }, live(ui, "health", { size: 18, mono: true, color: INK, tone: suitTone })], { gap: 8 }),
  ];
  sideRows.push(
    row([tag("Food"), { k: "cells", slot: ui.slot("food"), max: 100, count: 10, tone: meterTone, cell_w: 6, cell_h: 12, gap: 2 }, live(ui, "food", { size: 18, mono: true, color: INK, tone: meterTone })], { gap: 8 }),
    row([tag("Water"), { k: "cells", slot: ui.slot("water"), max: 100, count: 10, tone: meterTone, cell_w: 6, cell_h: 12, gap: 2 }, live(ui, "water", { size: 18, mono: true, color: INK, tone: meterTone })], { gap: 8 }),
  );
  const stratum = STRATA[dive.stratum];
  const mark = sealMark(v.deep);
  const crushing = crushDamage(dive.stratum, mark) > 0;
  sideRows.push(row([tag(`Seal Mk ${mark}`), txt(`P${stratum.pressure}${crushing ? "!" : ""}`, { size: 18, mono: true, color: crushing ? RED : TEAL })], { gap: 8 }));
  const belt = dive.belt;
  if (belt.ration + belt.water + belt.lure > 0) {
    sideRows.push(row([tag("Belt"), txt(`${belt.ration}F ${belt.water}W ${belt.lure}L`, { size: 18, mono: true, color: INK })], { gap: 8 }));
  }
  sideRows.push(row([{ k: "icon", svg: FLAG_SVG, size: 15, color: low ? RED : AMBER }, tag("Rail"), live(ui, "rail", { size: 18, mono: true, color: INK, suffix: "m" })], { gap: 8 }));
  const side = col([
    tag(dive.tankSeconds > 110 ? "Sealed tank" : "Issue tank"),
    txt(airOut ? "Suit bleeding" : low ? "Turn back" : " ", { size: 15, color: RED, case: "upper", tracking: 1.2 }),
    ...sideRows,
  ], { gap: 6, w: 168 });
  return panel([row([
    { k: "dial", slot: ui.slot("oxygen"), max: tank, size: 104, tone: airTone, children: [
      live(ui, "oxygen", { size: 30, mono: true, color: INK, weight: 700, align: "center", tone: airTone }),
      txt(airOut ? "NO AIR" : "SEC AIR", { size: 9, mono: true, color: DIM, align: "center", tracking: 1.4 }),
    ] },
    side,
  ], { gap: 12, items: "center" })], { pl: 10, pr: 14, pt: 10, pb: 10 });
}

function kit(ui: RuneUi, v: View): N {
  const ammo = v.ammo;
  const reloading = ammo?.reloading === true;
  const weapon = weaponReadout(v.dive).label;
  const short = weapon.includes("/") ? weapon.split("/").pop()!.trim() : weapon;
  const children: N[] = [tag(short), line("rgba(156,221,209,0.2)")];
  if (reloading) {
    children.push(row([txt("LOAD", { size: 30, mono: true, color: AMBER }), live(ui, "reloadLeft", { size: 18, mono: true, color: DIM, decimals: 1, suffix: "s" })], { gap: 2 }));
  } else {
    children.push(row([live(ui, "loaded", { size: 40, mono: true, color: INK }), txt(`/${ammo?.capacity ?? "–"}`, { size: 18, mono: true, color: DIM })], { gap: 2, items: "end" }));
  }
  children.push(row([{ k: "icon", svg: GUN_SVG, size: 14, color: TEAL }, live(ui, "reserve", { size: 16, mono: true, color: FAINT })], { gap: 4, justify: "end", w_full: true }));
  children.push({ k: "bar", slot: ui.slot("massPct"), max: 100, h: 8, color: "#9cddd1", track: "rgba(156,221,209,0.12)" });
  children.push(row([live(ui, "mass", { size: 16, mono: true, color: INK }), txt(`/${CACHE_WEIGHT}kg`, { size: 11, mono: true, color: DIM })], { gap: 4 }));
  const count = v.dive?.cache.length ?? 0;
  children.push({ k: "button", id: "cache", label: `Cache · ${count} carried${count === 0 ? "" : " · lost if you die"}`, hint: "Tab", w_full: true, pt: 8 } as N);
  return panel([col(children, { gap: 4 })], { pl: 22, pr: 14, pt: 12, pb: 10, w: 216 });
}

function docket(ui: RuneUi, v: View, d: NonNullable<HudExtra["docket"]>): N {
  const h = v.home;
  const stats: [string, string][] = [
    ["Scrip", String(d.scrip)], ["Stash", String(d.stash)], ["Returns", String(d.returns)], ["Lost", String(d.lost)],
    ["Food", String(Math.ceil(d.base?.food ?? 0))], ["Water", String(Math.ceil(d.base?.water ?? 0))],
    ["Galley", `${Math.floor(d.base?.meals ?? 0)}/${Math.floor(d.base?.flasks ?? 0)}`], ["Power", String(d.base?.power ?? 0)],
  ];
  return panel([col([
    row([txt("Marrow · line 06", { size: 11, mono: true, color: DIM }), txt(`Life ${String(d.life).padStart(2, "0")}`, { size: 11, mono: true, color: DIM })], { justify: "between", w_full: true }),
    txt("Rail departure / 06", { size: 20, color: INK, weight: 650 }),
    txt(d.brief ?? "Ride to Bellwether. Fill the cache. Ride back before the air runs out.", { size: 13, color: "#c4cfbc" }),
    ...stats.map(([k, val]) => row([txt(k, { size: 12, color: DIM }), txt(val, { size: 15, mono: true, color: INK })], { justify: "between", w_full: true })),
    txt(`Next ${d.next}`, { size: 12, color: DIM }),
    txt(`Standing ${d.standing}`, { size: 12, color: DIM }),
    ...(d.last == null ? [] : [txt(`${d.last.kind === "extracted" ? "Returned" : "Reprinted"} ${d.last.reason}`, { size: 12, color: DIM })]),
    txt("WASD walk · E use · F lamp · Q eat · G lure · C scan · Esc hold", { size: 10, mono: true, color: DIM }),
  ], { gap: 6 })], { pl: 18, pr: 18, pt: 14, pb: 22, w: 260 });
}

/** The whole HUD for one structural state. `extra` carries the discrete reads. */
export function hudSpec(ui: RuneUi, v: View, x: HudExtra): N[] {
  const children: N[] = [];
  const diving = v.dive !== null;
  if (diving) {
    children.push({ ...computer(ui, v), pin: [20, null, null, 20] } as N);
    const m = /^(\d+)\s*\/\s*(.*)$/.exec(x.room);
    const depth = m === null ? "00" : m[1]!.padStart(2, "0");
    const name = m === null ? x.room : m[2]!;
    children.push(row([
      { k: "panel", w: 70, h: 1, fill: "rgba(156,221,209,0.35)" },
      row([txt("DEPTH", { size: 10, mono: true, color: AMBER, tracking: 1.8 }), txt(depth, { size: 26, mono: true, color: INK })], { gap: 6, items: "end" }),
      txt(name, { size: 16, color: "rgba(214,241,233,0.88)", case: "upper", tracking: 1.6 }),
      { k: "panel", w: 70, h: 1, fill: "rgba(156,221,209,0.35)" },
    ], { gap: 12, justify: "center", w_full: true, pin: [null, 14, null, null] }));
    children.push({ ...kit(ui, v), pin: [null, null, 20, 20] } as N);
  }
  if (v.mode === "home" && v.panel === null && x.docket !== null) {
    children.push({ ...docket(ui, v, x.docket), pin: [20, 60, null, null] } as N);
  }
  // Radio line above the prompt/search, both centred on the bottom glass.
  const promptNode: N | null = x.channel !== null
    ? col([
        txt(`${CHANNEL_LABEL[x.channel] ?? "Working"} · hold still`, { size: 11, mono: true, color: DIM }),
        { k: "bar", slot: ui.slot("search"), max: 100, h: 6, w: 220, color: TEAL, track: "rgba(156,221,209,0.15)" },
        txt("E cancel", { size: 10, mono: true, color: DIM }),
      ], { gap: 4, items: "center" })
    : x.target !== null
      ? { k: "button", id: "interact", label: `E · ${x.target}`, color: AMBER, pt: 4, pb: 4, pl: 18, pr: 18 } as N
      : null;
  const commsNode: N | null = (v.hint !== "" || v.error !== "")
    ? col([
        txt("Marrow radio", { size: 10, mono: true, color: DIM }),
        txt(v.hint, { size: 14, color: "#d6f1e9", align: "center" }),
        ...(v.error === "" ? [] : [txt(v.error, { size: 13, color: RED, align: "center" })]),
      ], { gap: 2, items: "center" })
    : null;
  const bottomNodes = [commsNode, promptNode].filter((n): n is N => n !== null);
  if (bottomNodes.length > 0) {
    children.push(col(bottomNodes, { gap: 8, items: "center", pin: [null, null, null, 24] }));
  }
  if (v.mode === "home" || v.mode === "dive") {
    children.push(row([{ k: "button", id: "pause", label: "Esc", hint: "hold", pt: 6, pb: 6, pl: 22, pr: 22 } as N], { justify: "end", w_full: true, pin: [null, 16, null, null], pr: 16 }));
  }
  return children;
}

/** Signature: every discrete input the HUD spec bakes in. Live slots are excluded. */
export function hudSignature(v: View, x: HudExtra): string {
  const d = v.dive;
  const stratum = d?.stratum ?? "vault";
  const mark = sealMark(v.deep);
  const crushing = d !== null && crushDamage(stratum, mark) > 0;
  return [
    v.mode, v.panel ?? "-", v.paused ? 1 : 0, d !== null ? 1 : 0, stratum,
    d?.tankSeconds ?? 0, d !== null && d.oxygen <= 25 ? 1 : 0, d !== null && d.oxygen <= 0 ? 1 : 0,
    d !== null && d.hurt > 0 ? 1 : 0, d?.flash !== undefined && d.flash > 0 ? 1 : 0,
    v.ammo?.reloading === true ? 1 : 0, v.ammo?.capacity ?? -1, weaponReadout(d).label,
    d !== null && loadOf(d.cache).mass >= CACHE_WEIGHT ? 1 : 0, d?.cache.length ?? -1,
    d?.belt.ration ?? 0, d?.belt.water ?? 0, d?.belt.lure ?? 0, d?.lamp === true ? 1 : 0,
    mark, STRATA[stratum].pressure, crushing ? 1 : 0,
    x.room, x.channel ?? "-", x.target ?? "-", JSON.stringify(x.docket), v.hint, v.error,
  ].join("|");
}

/* ---------------- menus ---------------- */

export interface MenuState {
  phase: "menu" | "paused";
  pane: string;
  cat: number;
  busy: string | null;
  notice: string | null;
  settings: { categories: SettingsCategoryView[]; store: SettingsStore } | null;
  slots: { id: string; label: string; meta: string; empty: boolean }[];
  recent: { id: string; label: string } | null;
  emptySlot: string | null;
  open: string;
  callsign: string;
  air: number;
  diving: boolean;
  life: number;
  banked: number;
  footer: string;
}

const menuPanel = (children: N[], style: Record<string, unknown> = {}): N =>
  panel(children, { fill: "#101d24", radius: 4, border: 1, border_color: "rgba(226,189,110,0.25)", pl: 26, pr: 26, pt: 20, pb: 20, ...style });

function menuItem(id: string, label: string, hint: string | undefined, disabled: boolean): N {
  return { k: "button", id: `mi.${id}`, label, hint, disabled, color: AMBER, w_full: true } as N;
}

function settingsRows(ui: RuneUi, rows: SettingsRow[], store: SettingsStore): N[] {
  const out: N[] = [];
  for (const r of rows) {
    if (r.kind === "slider" && typeof r.value === "number" && r.min !== undefined && r.max !== undefined) {
      const min = r.min, max = r.max;
      const decimals = r.step === undefined ? 2 : r.step >= 1 ? 0 : r.step >= 0.1 ? 1 : 2;
      out.push(col([
        row([txt(r.label, { size: 13, color: INK }), { k: "text", slot: ui.bind(`setvd.${r.id}`, () => Number(store.get(r.id, r.value))), size: 12, mono: true, color: DIM, decimals }], { justify: "between", w_full: true }),
        { k: "slider", id: `set.${r.id}`, slot: ui.bind(`setv.${r.id}`, () => {
          const cur = Number(store.get(r.id, r.value));
          return Math.max(0, Math.min(1, (cur - min) / (max - min)));
        }), w: 200, color: AMBER },
      ], { gap: 2 }));
    } else if (r.kind === "toggle") {
      out.push({ k: "toggle", id: `set.${r.id}`, slot: ui.bind(`sett.${r.id}`, () => (store.get(r.id, r.value) ? 1 : 0)), label: r.label, w_full: true } as N);
    } else if (r.kind === "select" && r.options !== undefined) {
      const opts = r.options;
      out.push({ k: "select", id: `set.${r.id}`, options: opts.map((o) => String(o.label)), slot: ui.bind(`sets.${r.id}`, () => {
        const cur = store.get(r.id, r.value);
        const idx = opts.findIndex((o) => o.value === cur);
        return idx === -1 ? 0 : idx;
      }), label: r.label } as N);
    } else {
      out.push(txt(`${r.label}: ${String(r.value)}`, { size: 13, color: DIM }));
    }
  }
  return out;
}

function settingsPane(ui: RuneUi, m: MenuState): N {
  const cats = m.settings?.categories ?? [];
  const store = m.settings?.store;
  const active = cats.length === 0 ? undefined : cats[Math.min(m.cat, cats.length - 1)];
  const tabs = row(cats.map((c, i) => ({ k: "button", id: `cat.${c.id}`, label: c.label, active: ui.bind(`cat.${c.id}`, () => (i === m.cat ? 1 : 0)), pt: 5, pb: 5, pl: 12, pr: 12 } as N)), { gap: 6, w_full: true });
  const rows = active === undefined || store === undefined ? [] : [
    ...settingsRows(ui, active.rows, store),
    ...active.keybinds.map((k) => row([txt(k.label, { size: 12, color: DIM }), txt(k.bindingLabel, { size: 12, mono: true, color: INK })], { justify: "between", w_full: true })),
  ];
  return col([
    txt("Settings", { size: 11, mono: true, color: DIM, case: "upper", tracking: 1.6 }),
    tabs,
    line(),
    { k: "scroll", children: rows, w_full: true, h: 320, gap: 10 } as N,
  ], { gap: 8 });
}

function callsignPane(ui: RuneUi, m: MenuState): N {
  return col([
    txt("Diver callsign", { size: 11, mono: true, color: DIM, case: "upper", tracking: 1.6 }),
    { k: "field", id: "callsign", text: m.callsign, placeholder: "Name this Life", mono: true, w: 260, h: 34 } as N,
    txt("Written into the record on the next save.", { size: 11, color: DIM }),
  ], { gap: 8 });
}

function creditsPane(): N {
  const lines = DEEPWARD_CREDITS.sections.flatMap((s) => [
    txt(s.heading, { size: 14, color: AMBER, weight: 650 }),
    ...s.entries.map((e) => txt(`${e.label} — ${e.detail}`, { size: 12, color: "#c4cfbc" })),
  ]);
  if (DEEPWARD_CREDITS.notice !== undefined) lines.push(txt(DEEPWARD_CREDITS.notice, { size: 11, mono: true, color: DIM }));
  return col([txt("Credits", { size: 11, mono: true, color: DIM, case: "upper", tracking: 1.6 }), { k: "scroll", children: lines, w_full: true, h: 320, gap: 6 } as N], { gap: 8 });
}

function recordsPane(ui: RuneUi, m: MenuState): N {
  const rowsN: N[] = m.slots.map((s) => row([
    col([txt(s.label, { size: 14, color: INK, weight: 600 }), txt(s.meta, { size: 11, mono: true, color: DIM })], { gap: 2 }),
    { k: "button", id: `slot.open.${s.id}`, label: s.empty ? "Begin" : "Open", disabled: false, pt: 5, pb: 5, pl: 14, pr: 14 } as N,
    ...(s.empty ? [] : [{ k: "button", id: `slot.del.${s.id}`, label: "Burn", color: RED, pt: 5, pb: 5, pl: 14, pr: 14 } as N]),
  ], { justify: "between", w_full: true, items: "center" }));
  return col([
    txt("Dives & hauls", { size: 11, mono: true, color: DIM, case: "upper", tracking: 1.6 }),
    { k: "scroll", children: rowsN, w_full: true, h: 300, gap: 6 } as N,
    txt(`${m.open} · Life ${m.life} · ${m.banked} scrip`, { size: 11, mono: true, color: DIM }),
  ], { gap: 8 });
}

function heldBoard(m: MenuState): N {
  return col([
    txt(m.diving ? "Dive held · Bellwether" : "Home held · Marrow", { size: 11, mono: true, color: DIM, case: "upper", tracking: 1.6 }),
    txt(m.footer, { size: 13, color: "#c4cfbc" }),
    txt(`Life ${m.life} · ${m.banked} scrip banked`, { size: 12, color: DIM }),
  ], { gap: 8 });
}

/** The pause/title menu tree. `m.pane` picks the detail column. */
export function menuSpec(ui: RuneUi, m: MenuState): { children: N[]; modal: boolean } {
  const paused = m.phase === "paused";
  const items: N[] = paused
    ? [
        menuItem("resume", m.diving ? "Back to the dive" : "Back to Marrow", undefined, false),
        menuItem("save", `Save to ${m.open}`, "Life and haul, as they stand", m.busy !== null),
        menuItem("settings", "Settings", "Sound, picture, controls", false),
        menuItem("credits", "Credits", undefined, false),
        menuItem("title", "Save & leave to title", undefined, m.busy !== null),
      ]
    : [
        menuItem("continue", "Continue dive", m.recent === null ? "No record on this profile" : m.recent.label, m.recent === null || m.busy !== null),
        menuItem("new", "New dive", m.emptySlot === null ? "No record available" : `Writes ${m.open}`, m.emptySlot === null || m.busy !== null),
        menuItem("records", "Dives & hauls", undefined, false),
        menuItem("settings", "Settings", "Sound, picture, controls", false),
        menuItem("credits", "Credits", undefined, false),
      ];
  const detail = m.pane === "settings" ? settingsPane(ui, m)
    : m.pane === "credits" ? creditsPane()
    : m.pane === "records" ? recordsPane(ui, m)
    : m.pane === "new" ? col([txt("New dive", { size: 11, mono: true, color: DIM, case: "upper", tracking: 1.6 }), txt("Full tank. Issue sidearm. Rail to Bellwether and back before the air runs out.", { size: 13, color: "#c4cfbc" }), txt(`Air ${m.air}s · Cache 4×3 · Load 12kg · Life ${m.life}`, { size: 12, mono: true, color: DIM }), { k: "button", id: "new.go", label: "Take the rail", color: AMBER, disabled: m.emptySlot === null || m.busy !== null, pt: 10, pb: 10, pl: 26, pr: 26 } as N], { gap: 10, w: 320 })
    : m.pane === "save" ? col([heldBoard(m), callsignPane(ui, m), { k: "button", id: "save.go", label: `Write to ${m.open}`, color: AMBER, pt: 10, pb: 10, pl: 26, pr: 26 } as N], { gap: 12 })
    : m.pane === "title" ? col([heldBoard(m), txt("Writes the record, then shuts the console down to the title.", { size: 12, color: DIM }), { k: "button", id: "title.go", label: "Save & leave", color: RED, pt: 10, pb: 10, pl: 26, pr: 26 } as N], { gap: 12 })
    : heldBoard(m);
  const logo = col([
    txt(paused ? (m.diving ? "DIVE HELD" : "HOME HELD") : "DEEPWARD", { size: 34, mono: true, color: INK, weight: 700, tracking: 4 }),
    txt(paused ? "Halloway print service · line 06" : "Halloway print service · line 06", { size: 11, mono: true, color: DIM }),
  ], { gap: 4 });
  const left = col([logo, gap(18), ...items, gap(10), txt(m.busy ?? m.notice ?? `${m.banked} scrip banked · Life ${m.life}`, { size: 11, mono: true, color: m.busy !== null ? AMBER : DIM })], { gap: 4, w: 340 });
  const right = menuPanel([detail], { w: 480 });
  return {
    modal: true,
    children: [row([left, right], { gap: 40, w_full: true, h_full: true, justify: "center", items: "center", pin: [0, 0, 0, 0] })],
  };
}

export function menuSignature(m: MenuState): string {
  return [
    m.phase, m.pane, m.cat, m.busy ?? "", m.notice ?? "", m.diving ? 1 : 0, m.life, m.banked, m.open,
    m.recent?.id ?? "-", m.emptySlot ?? "-", m.callsign,
    m.settings === null ? "-" : m.settings.categories.map((c) => `${c.id}:${c.rows.map((r) => `${r.id}=${String(r.value)}`).join(",")}`).join(";"),
    m.slots.map((s) => `${s.id}${s.empty ? "e" : ""}`).join(","),
    m.footer,
  ].join("|");
}
