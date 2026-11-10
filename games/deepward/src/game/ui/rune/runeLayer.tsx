import { useEffect, useRef } from "@jgengine/core/ui/jsx";
import { RuneUi } from "@jgengine/core/ui/runeUi.view";
import type { RuneUiEvent } from "@jgengine/core/ui/runeUi.view";
import { useSettingsStore, type SettingsController } from "@jgengine/core/settings/settings.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { GamePhase } from "@jgengine/core/game/gamePhase";
import { viewStore, nearby, recordOf, loadRecordSlot, beginRecordSlot, persistRecord, withdrawToTitle, openMarrowTitle, type View } from "../../controls";
import { CACHE_WEIGHT, loadOf } from "../../haul";
import { groundDistance, EXIT, roomAt } from "../../../world";
import { STRATA } from "../../strata";
import { marrowOf } from "../../marrow";
import { nextGoal } from "../../deep";
import { marrowStanding, OPERATOR } from "../../counter";
import { recordSlots, recordLabel, refreshRecordSlots } from "../../menuRecord";
import type { SaveSlotMeta } from "@jgengine/core/save/saveSlots";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { hudSpec, hudSignature, menuSpec, menuSignature, type HudExtra, type MenuState } from "./runeSpec";

const FONT_SHARE_TECH = "/fonts/rune/sharetechmono_ShareTechMono-Regular.ttf";
const FONT_RAJDHANI = "/fonts/rune/rajdhani_Rajdhani-SemiBold.ttf";
const FONT_RAJDHANI_BOLD = "/fonts/rune/rajdhani_Rajdhani-Bold.ttf";

/*
 * The Rune UI layer: mounts the jg-ui wasm on a transparent canvas over the
 * game, feeds it Deepward's HUD/menu trees, and routes its events back to the
 * same commands the React UI ran. Per-tick values cross through one bound
 * Float32Array; the spec rebuilds only when its signature changes.
 */

const HOME_SPOT: readonly [number, number, number] = [0, 0, 14];
const positionOf = (ctx: GameContext): readonly [number, number, number] =>
  ctx.scene.entity.get(ctx.player.userId)?.position ?? HOME_SPOT;

function grab(): void {
  const canvas = document.querySelector("canvas");
  canvas?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
  try { const request = canvas?.requestPointerLock(); if (request instanceof Promise) void request.catch(() => {}); } catch { /* click the scene */ }
}

function liveBindings(ui: RuneUi, ctx: GameContext): void {
  const view = () => viewStore.read(ctx);
  ui.bind("oxygen", () => view().dive?.oxygen ?? 0);
  ui.bind("health", () => view().dive?.health ?? 0);
  ui.bind("rail", () => groundDistance(positionOf(ctx), EXIT));
  ui.bind("food", () => view().deep.body.values["food"] ?? 0);
  ui.bind("water", () => view().deep.body.values["water"] ?? 0);
  ui.bind("loaded", () => view().ammo?.loaded ?? 0);
  ui.bind("reserve", () => view().ammo?.reserve ?? 0);
  ui.bind("reloadLeft", () => { const a = view().ammo; return a?.reloading === true ? Math.round((1 - a.reloadProgress) * 13) / 10 : 0; });
  ui.bind("mass", () => { const c = view().dive?.cache; return c === undefined ? 0 : loadOf(c).mass; });
  ui.bind("massPct", () => { const c = view().dive?.cache; return c === undefined ? 0 : Math.min(100, (loadOf(c).mass / CACHE_WEIGHT) * 100); });
  ui.bind("search", () => { const ch = view().dive?.channel; if (ch === null || ch === undefined) return 0; const total = ch.total ?? 1.4; return ((total - ch.remaining) / total) * 100; });
}

function hudExtra(ctx: GameContext, v: View): HudExtra {
  const stratum = v.dive?.stratum ?? "vault";
  const at = positionOf(ctx);
  const here = roomAt(at, stratum);
  const room = stratum === "vault" ? here : here.replace(/^(\d+)\s*\/\s*/, (_m, n: string) => `${n} / ${STRATA[stratum].name} · `);
  const channel = v.dive?.channel ?? null;
  const target = v.panel === null && !v.paused && channel === null ? nearby(ctx)?.label ?? null : null;
  let docket: HudExtra["docket"] = null;
  if (v.mode === "home" && v.panel === null) {
    const base = marrowOf(ctx);
    const standing = marrowStanding(v.home.standing);
    const goal = nextGoal(v.deep, base);
    const said = base.says("halloway");
    const prepared = v.home.stash.find((item) => item.id === v.rifleUid) ?? null;
    const last = v.home.last;
    docket = {
      life: v.home.life, scrip: v.home.bank.banked, stash: v.home.stash.length, returns: v.home.extractions, lost: v.home.deaths,
      standing: `${standing.tier(OPERATOR, "marrow").id} / ${standing.standing(OPERATOR, "marrow")}`,
      next: `${goal?.text ?? "Pattern 406 is home."} · ${v.rifleUid === null ? "issue sidearm" : `${prepared?.name ?? "service rifle"} at risk`}`,
      brief: said.length > 0 ? `Halloway: ${said[said.length - 1]}` : undefined,
      base: { food: v.deep.body.values["food"] ?? 0, water: v.deep.body.values["water"] ?? 0, power: base.num("marrow.power"), meals: Math.floor(base.num("marrow.food")), flasks: Math.floor(base.num("marrow.water")) },
      last: last == null ? null : { kind: last.kind, reason: last.reason },
    };
  }
  return { room, target, channel: channel === null ? null : channel.kind ?? "search", docket };
}

function slotMeta(sl: SaveSlotMeta): { id: string; label: string; meta: string; empty: boolean } {
  return {
    id: sl.id,
    label: sl.name ?? recordLabel(sl.id),
    meta: sl.empty ? "empty" : sl.savedAt === undefined ? "" : new Date(sl.savedAt).toLocaleDateString(),
    empty: sl.empty,
  };
}

interface LayerApi {
  ctx: GameContext;
  getMenu: () => MenuState | null;
  setMenu: (m: MenuState | null) => void;
  rebuild: () => void;
  phase: () => string;
  settings: () => { settings: SettingsController; store: ReturnType<typeof useSettingsStore> };
}

function baseMenu(ctx: GameContext, phase: string, s: { settings: SettingsController; store: ReturnType<typeof useSettingsStore> }, prev: MenuState | null): MenuState {
  const v = viewStore.read(ctx);
  const ph = phase === "paused" ? "paused" : phase === "menu" ? "menu" : "play";
  const keep = prev !== null && prev.phase === ph ? prev : null;
  const filled = recordSlots.list().filter((sl) => !sl.empty).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  const recent = filled[0] ?? null;
  const held = recordSlots.list().slice().sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  const emptySlot = recordSlots.list().find((sl) => sl.empty)?.id ?? held[0]?.id ?? null;
  const open = recordOf(ctx)?.slot() ?? "marrow";
  return {
    phase: ph as "menu" | "paused",
    pane: keep?.pane ?? "root",
    cat: keep?.cat ?? 0,
    busy: keep?.busy ?? null,
    notice: keep?.notice ?? null,
    settings: { categories: s.settings.categories, store: s.store },
    slots: recordSlots.list().map(slotMeta),
    recent: recent === null ? null : { id: recent.id, label: recent.name ?? recordLabel(recent.id) },
    emptySlot,
    open,
    callsign: v.home.callsign ?? "",
    air: v.home.refits.includes("tank") ? 145 : 110,
    diving: v.dive !== null,
    life: v.home.life,
    banked: v.home.bank.banked,
    footer: `${v.home.bank.banked} scrip banked · Life ${v.home.life}`,
  };
}

function onUiEvent(ev: RuneUiEvent, api: LayerApi): void {
  const { ctx } = api;
  const command = (name: string, input: unknown = {}) => ctx.game.commands.run(`deepward.${name}`, input);
  const id = ev.id;
  const m = api.getMenu();
  const setMenu = (fn: (cur: MenuState | null) => MenuState | null) => {
    const next = fn(api.getMenu());
    api.setMenu(next);
    if (next !== null) api.rebuild();
  };
  const refreshSlots = () => {
    void refreshRecordSlots(ctx).then(() => {
      api.setMenu(baseMenu(ctx, api.phase(), api.settings(), api.getMenu()));
      api.rebuild();
    });
  };
  const whileBusy = (label: string, work: () => Promise<unknown>) => {
    setMenu((cur) => (cur === null ? cur : { ...cur, busy: label }));
    void Promise.all([work(), new Promise((r) => setTimeout(r, 280))]).finally(() => {
      setMenu((cur) => (cur === null ? cur : { ...cur, busy: null }));
    });
  };
  if (id === "pause") { command("pause"); return; }
  if (id === "cache") { command("cache"); grab(); return; }
  if (id === "interact") { command("interact"); if (viewStore.read(ctx).panel === null && !viewStore.read(ctx).paused) grab(); return; }
  if (id === "callsign" && ev.kind === "submit" && typeof ev.text === "string") {
    const text = ev.text.trim();
    if (text !== "") viewStore.update(ctx, (st) => ({ ...st, home: { ...st.home, callsign: text } }));
    return;
  }
  if (id.startsWith("mi.")) {
    const which = id.slice(3);
    const v = viewStore.read(ctx);
    if (which === "resume") {
      if (m?.phase === "paused") command(v.mode === "home" || v.mode === "dive" ? "close" : "pause");
      else openMarrowTitle(ctx);
      grab();
      return;
    }
    if (which === "save" || which === "settings" || which === "credits" || which === "records" || which === "new" || which === "title") {
      setMenu((cur) => (cur === null ? cur : { ...cur, pane: which === "save" || which === "title" ? which : which }));
      if (which === "records") refreshSlots();
      return;
    }
    if (which === "continue") {
      const recent = m?.recent;
      if (recent != null) whileBusy("Reading the record", async () => { await loadRecordSlot(ctx, recent.id); refreshSlots(); });
      return;
    }
    return;
  }
  if (id === "new.go") {
    const slot = m?.emptySlot ?? null;
    if (slot !== null) whileBusy("Printing the record", async () => { await beginRecordSlot(ctx, slot, recordSlots.get(slot)?.empty === false); refreshSlots(); });
    return;
  }
  if (id === "save.go") {
    whileBusy("Writing the record", async () => { await persistRecord(ctx); refreshSlots(); });
    return;
  }
  if (id === "title.go") {
    whileBusy("Writing the record", () => withdrawToTitle(ctx));
    return;
  }
  if (id.startsWith("cat.")) {
    const catId = id.slice(4);
    setMenu((cur) => {
      if (cur === null) return cur;
      const idx = cur.settings?.categories.findIndex((c) => c.id === catId) ?? -1;
      return { ...cur, cat: idx === -1 ? cur.cat : idx };
    });
    return;
  }
  if (id.startsWith("slot.open.")) {
    const slot = id.slice("slot.open.".length);
    whileBusy("Reading the record", async () => { await loadRecordSlot(ctx, slot); refreshSlots(); });
    return;
  }
  if (id.startsWith("slot.del.")) {
    const slot = id.slice("slot.del.".length);
    whileBusy("Burning the record", async () => {
      recordSlots.clear(slot);
      await recordOf(ctx)?.deleteSlot(slot);
      refreshSlots();
    });
    return;
  }
  if (id.startsWith("set.")) {
    const rest = id.slice(4);
    const row = m?.settings?.categories.flatMap((c) => c.rows).find((r) => r.id === rest);
    if (row === undefined) return;
    if (ev.kind === "slider" && typeof ev.value === "number" && row.min !== undefined && row.max !== undefined) {
      row.set(row.min + ev.value * (row.max - row.min));
    } else if (ev.kind === "toggle" && typeof ev.value === "number") {
      row.set(ev.value === 1);
    } else if (ev.kind === "select" && typeof ev.value === "number" && row.options !== undefined) {
      const opt = row.options[Math.round(ev.value)];
      if (opt !== undefined) row.set(opt.value);
    }
    api.rebuild();
    return;
  }
}

export function RuneLayer({ ctx, phase, settings }: { ctx: GameContext; phase: GamePhase; settings: SettingsController }): null {
  const store = useSettingsStore();
  const menuRef = useRef<MenuState | null>(null);
  const rebuildRef = useRef<() => void>(() => {});
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const settingsRef = useRef({ settings, store });
  settingsRef.current = { settings, store };

  useEffect(() => {
    let dead = false;
    let ui: RuneUi | null = null;
    const api: LayerApi = {
      ctx,
      getMenu: () => menuRef.current,
      setMenu: (m) => { menuRef.current = m; },
      rebuild: () => rebuildRef.current(),
      phase: () => phaseRef.current,
      settings: () => settingsRef.current,
    };
    const rebuild = () => {
      if (ui === null || dead) return;
      const v = viewStore.read(ctx);
      const ph = phaseRef.current;
      if (ph === "menu" || ph === "paused") {
        const m = menuRef.current;
        if (m === null) return;
        const sig = menuSignature(m);
        if (sig === lastSig) return;
        lastSig = sig;
        const spec = menuSpec(ui, m);
        ui.setSpec(spec.children, spec.modal);
        return;
      }
      const x = hudExtra(ctx, v);
      const sig = hudSignature(v, x);
      if (sig === lastSig) return;
      lastSig = sig;
      const modal = v.panel !== null || v.paused || (v.mode !== "home" && v.mode !== "dive");
      ui.setSpec(hudSpec(ui, v, x), modal);
    };
    let lastSig = "";
    rebuildRef.current = rebuild;
    const unsub = ctx.subscribe(rebuild);
    void RuneUi.create({
      canvasId: "jg-ui",
      fonts: [FONT_SHARE_TECH, FONT_RAJDHANI, FONT_RAJDHANI_BOLD].map(resolveAssetBaseUrl),
      sans: "Rajdhani",
      mono: "Share Tech Mono",
      zIndex: 40,
    }).then((created) => {
      if (dead) { created.destroy(); return; }
      ui = created;
      liveBindings(created, ctx);
      created.on("*", (ev) => onUiEvent(ev, api));
      menuRef.current = baseMenu(ctx, phaseRef.current, settingsRef.current, null);
      lastSig = "";
      rebuild();
    }).catch((error) => console.warn("jg-ui mount failed", error));
    return () => {
      dead = true;
      unsub();
      rebuildRef.current = () => {};
      ui?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // Phase or settings-structure changes rebuild the menu/HUD spec.
  useEffect(() => {
    menuRef.current = baseMenu(ctx, phase === "menu" || phase === "paused" ? phase : "play", settingsRef.current, menuRef.current);
    rebuildRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, settings.categories]);

  return null;
}
