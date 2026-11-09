import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useActionBindings } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { allActionCodes } from "@jgengine/core/input/actionBindings";
import { useSceneSwapping } from "@jgengine/core/ui/sceneSwap.view";
import { useBrowserSuspension, useDialogBehavior } from "@jgengine/react";
import { useOptionalGamePhase } from "@jgengine/react/hooks";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { useGameStore } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { HudButton } from "@jgengine/core/hud/hudButton.view";
import { HudSurface } from "@jgengine/core/hud/hudSurface.view";
import { viewStore, storageChanged, type View } from "../controls";
import { CACHE, footprint, ITEMS, type Dive } from "../state";
import { weaponReadout } from "../combat";
import { loadOf, CACHE_WEIGHT } from "../haul";
import { breakdownValue, compareToPrepared, kindOf, statLines, type Item } from "../items";
import { REFITS, refitMissing, type RefitId } from "../progression";
import { counterRows, SCRIP, scripJournal } from "../counter";
import { STRATA } from "../strata";
import { ItemMark } from "./ItemMark";
import { FabricatorSheet } from "./FabricatorSheet";
import { marrowOf, marrowState } from "../marrow";
import { RECORD_KEY, SAVE_KEY } from "../save";
import { useGameFonts } from "@jgengine/core/ui/fonts.view";
import { GAME_FONTS } from "../../art/look";
import { RuneLayer } from "./rune/runeLayer";
import { Visor, VisorReticle } from "./VisorHud";

/*
 * The visor HUD is a tree of leaves. GameUI itself re-renders only when the screen's structure
 * changes (a panel opens, the dive starts, air goes low). Each panel selects just what it shows, and
 * the readouts that move every tick (air, suit, food, water, the rail, ammo, the load, a search) are
 * getters bound to their own text and bar nodes, so a tick never re-renders a panel.
 */

type Command = (name: string, input?: unknown) => unknown;
type DialogRef = ReturnType<typeof useDialogBehavior>;

function grab(): void {
  const canvas = document.querySelector("canvas");
  // The published shell receives keys on its focusable canvas wrapper. A menu
  // button can disappear while retaining keyboard focus, so return it to play.
  canvas?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
  try { const request = canvas?.requestPointerLock(); if (request instanceof Promise) void request.catch(() => {}); } catch { /* the player can click the scene */ }
}
const RARITY_LABEL: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const STAT_LABEL: Record<string, string> = { damage: "damage", rate: "rate", value: "assay" };
const NO_CACHE: Dive["cache"] = [];
const signed = (value: number, digits = 2): string => `${value > 0 ? "+" : ""}${Math.abs(value) < 1e-9 ? "0" : value.toFixed(digits)}`;
/** Affix text: the roll's own words, so a rated spool reads as rated. */
function affixText(item: Item): string {
  return item.affixes.map(affix => `${affix.id} ${signed(affix.value)} ${affix.stat}${affix.op === "mul" ? "×" : ""}`).join(" · ");
}
/** Per-stat deltas against the prepared rifle; only gear of the same kind has a baseline. */
function Compared({ item, equipped }: { item: Item; equipped: Item | null }) {
  if (equipped === null || equipped.id === item.id || kindOf(equipped) !== kindOf(item)) return null;
  const comparison = compareToPrepared(item, equipped);
  const verdict = comparison.better === "candidate" ? "Better than prepared" : comparison.better === "equipped" ? "Worse than prepared" : "Even with prepared";
  return <p className={`dw-compare ${comparison.better}`}>
    <strong>{verdict}</strong>{" "}
    {comparison.deltas.map(delta => `${STAT_LABEL[delta.stat] ?? delta.stat} ${signed(delta.delta)}`).join(" · ")}
    <small> scored {signed(comparison.scoreDelta, 1)} of {Math.round(comparison.scoreCandidate)}</small>
  </p>;
}

const isOpen = (view: View): boolean => view.panel === null && !view.paused && (view.mode === "home" || view.mode === "dive");

/** Over the canvas while the next floor builds and compiles: where the rail or the lift is taking you. */
function TravelCard() {
  const swapping = useSceneSwapping();
  const where = useStore(viewStore, v => v.dive === null ? "Marrow" : `${STRATA[v.dive.stratum].numeral} · ${STRATA[v.dive.stratum].name}`);
  return swapping ? <div className="dw-travel" role="status"><span>{where}</span></div> : null;
}

export function GameUI() {
  useGameFonts(GAME_FONTS);
  const ctx = useGameContext();
  const screen = useStore(viewStore, v => ({ panel: v.panel, mode: v.mode, paused: v.paused, diving: v.dive !== null, low: v.dive !== null && v.dive.oxygen <= 25 }));
  const phase = useOptionalGamePhase();
  const settings = useSettings();
  const command: Command = (name, input = {}) => ctx.game.commands.run(`deepward.${name}`, input);
  const shiftDialogRef = useDialogBehavior({
    open: screen.panel !== null || screen.mode === "reprinting" || screen.mode === "saving" || screen.mode === "blocked",
    focusKey: screen.panel ?? screen.mode,
    onClose: screen.mode === "home" || screen.mode === "dive" ? () => command("close") : undefined,
  });
  useEffect(() => {
    if (screen.panel === null && !screen.paused && (screen.mode === "home" || screen.mode === "dive")) {
      document.querySelector("canvas")?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
    }
  }, [screen.panel, screen.paused, screen.mode]);
  useBrowserSuspension(() => {
    if (isOpen(viewStore.read(ctx))) ctx.game.commands.run("deepward.pause", { paused: true });
  });
  const bindings = useActionBindings();
  const cacheBinding = bindings["deepwardCache"];
  const cacheKeys = useRef<readonly string[]>([]);
  cacheKeys.current = cacheBinding === undefined ? [] : allActionCodes(cacheBinding);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // The cache key closes the open cache: ahead of the sheet's focus trap, which would take Tab
      // to move between its buttons and leave "Close cache / Tab" a lie.
      if (cacheKeys.current.includes(event.code) && !event.repeat && !settings.isOpen && viewStore.read(ctx).panel === "cache") {
        event.preventDefault(); event.stopImmediatePropagation();
        ctx.game.commands.run("deepward.cache", {});
        grab();
        return;
      }
      if (event.code !== "Escape" || event.repeat || settings.isOpen) return;
      if (!isOpen(viewStore.read(ctx))) return;
      event.preventDefault(); event.stopImmediatePropagation();
      ctx.game.commands.run("deepward.pause", {});
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === SAVE_KEY || event.key.startsWith(RECORD_KEY)) storageChanged(ctx);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("storage", storage);
    };
  }, [ctx, settings.isOpen]);
  // The pause menu covers a HUD that stays mounted, only hidden: tearing the whole HUD down on
  // Escape and building it again on resume froze each of those frames for ~45 ms.
  const pauseMenu = phase === "paused" && screen.panel === null && (screen.mode === "home" || screen.mode === "dive");
  const close = () => { command("close"); grab(); };
  const sheets = <>
    {screen.panel === "stash" && <StashSheet dialogRef={shiftDialogRef} command={command} close={close} />}
    {screen.panel === "fabricator" && <FabricatorPanel dialogRef={shiftDialogRef} command={command} close={close} />}
    {screen.panel === "cache" && screen.diving && <CacheSheet dialogRef={shiftDialogRef} command={command} close={close} />}
    {screen.mode === "reprinting" && <ReprintSheet dialogRef={shiftDialogRef} command={command} />}
    {(screen.mode === "saving" || screen.mode === "blocked") && <SaveSheet dialogRef={shiftDialogRef} command={command} />}
  </>;
  return <>
    <RuneLayer ctx={ctx} phase={phase} settings={settings} />
    {phase !== "menu" && <div className={`dw-ui dw-hud ${screen.low ? "dw-low" : ""} ${screen.paused ? "dw-held" : ""}`} style={pauseMenu ? HIDDEN : undefined} aria-hidden={pauseMenu || undefined} onKeyDown={event => {
      if (event.code === "Tab") event.stopPropagation();
      if ((event.code === "Space" || event.code === "Enter") && event.target instanceof HTMLElement && event.target.closest("button, a, input, select, textarea, [contenteditable=true]")) event.stopPropagation();
    }}>
      <VisorGlass low={screen.low} />
    </div>}
    {typeof document === "undefined" ? null : createPortal(<div className="dw-ui dw-sheet-layer"><TravelCard />{sheets}</div>, document.body)}
  </>;
}

const HIDDEN = { display: "none" } as const;

/** The helmet glass: the low-air wash, the hurt wash and the reticle. */
function VisorGlass({ low }: { low: boolean }) {
  const glass = useStore(viewStore, v => ({ diving: v.dive !== null, hurt: v.dive !== null && v.dive.hurt > 0, hit: v.dive !== null && v.dive.flash > 0 }));
  return <>
    <Visor low={low} hurt={glass.hurt} />
    {/* Always mounted, only faded: its first draw links a blur program in the browser, a frame frozen mid-fight. */}
    <div className="dw-hurtwash" data-on={glass.hurt ? "" : undefined} aria-hidden="true" />
    {glass.diving && <VisorReticle hit={glass.hit} />}
  </>;
}

function StashSheet({ dialogRef, command, close }: { dialogRef: DialogRef; command: Command; close: () => void }) {
  const { home, rifleUid, hint, error } = useStore(viewStore, v => ({ home: v.home, rifleUid: v.rifleUid, hint: v.hint, error: v.error }));
  const prepared = home.stash.find(item => item.id === rifleUid) ?? null;
  const counter = counterRows(home);
  const journal = scripJournal(home, 4);
  return <div className="dw-modal"><HudSurface ref={dialogRef} elevation="modal" data-hud-window className="dw-sheet" aria-label="Marrow stash" role="dialog" aria-modal="true" tabIndex={-1}>
    <HudButton className="dw-sheet-close" onClick={close}>Close bench ×</HudButton>
    <span className="dw-eyebrow">Permanent / saved on return</span><h2>Marrow's stash</h2>
    <p>These exact item instances survived the rail journey. They remain here through deaths and reloads. Each carries the level of the room it came from and whatever its roll turned out to be.</p>
    {prepared !== null && <p className="dw-prepared"><strong>Prepared: {prepared.name}</strong> · {Math.round(prepared.stats["damage"] ?? 0)} damage · {(1 / (prepared.stats["rate"] ?? 2)).toFixed(2)}s cycle · {prepared.mass} weight. It is the baseline every other rifle is compared against.</p>}
    <h3>Choose the next shift</h3><p>Travel light with the issue sidearm and twelve free cache squares, or risk a recovered rifle for {Math.round(prepared?.stats["damage"] ?? 30)} damage per shot instead of {weaponReadout(null).damage}. A rifle fills three squares and is lost on death. Returning banks the same rifle again.</p>
    <HudButton aria-pressed={rifleUid === null} onClick={() => command("prepareRifle", { uid: null })}>Travel light / keep rifles safe</HudButton>
    {home.stash.length === 0 ? <p className="dw-empty">Empty shelves. Bring something home from Bellwether.</p> : <div className="dw-stash-list">{home.stash.map(item => <article key={item.id}>
      <ItemMark kind={kindOf(item)} size={38} /><div><strong>{item.name}</strong><p>{RARITY_LABEL[item.rarity] ?? item.rarity} · level {item.level} · {ITEMS[kindOf(item)].maker} · {ITEMS[kindOf(item)].found}</p><small>{ITEMS[kindOf(item)].detail}</small>
        <small>{statLines(item).map(line => `${line.label} ${line.value.toFixed(line.digits)}${line.unit}`).join(" · ")} · weight {item.mass}</small>
        {item.affixes.length > 0 && <small className="dw-affix">{affixText(item)}</small>}
        <small>Found on dive {item.id.split(":")[0]}</small>
        <Compared item={item} equipped={prepared} />
        <div className="dw-actions">
          {kindOf(item) === "service-rifle" && <HudButton aria-pressed={rifleUid === item.id} onClick={() => command("prepareRifle", { uid: item.id })}>{rifleUid === item.id ? "Prepared / three squares at risk" : "Prepare this rifle / risk next shift"}</HudButton>}
          <HudButton onClick={() => command("dismantle", { id: item.id })}>Dismantle / {breakdownValue(item)} scrip</HudButton>
        </div></div>
    </article>)}</div>}
    <h3>Fitter's counter / {home.bank.banked} scrip banked</h3><p>Marrow clears operators it trusts. Better standing also prices every shelf a little lower.</p>
    {journal.length > 0 && <ol className="dw-journal" aria-label="Scrip journal">{journal.map(entry => <li key={entry.seq}>
      <span>{entry.reason}{entry.ref === undefined ? "" : ` / ${entry.ref}`}</span><strong>{entry.amount > 0 ? "+" : ""}{entry.amount}</strong><small>{entry.balanceAfter} banked</small>
    </li>)}</ol>}
    <div className="dw-counter">{counter.map(row => <article className="dw-supply" key={row.supply.kind}>
      <ItemMark kind={row.supply.kind} size={32} /><div><strong>{row.supply.label}</strong><p>{row.supply.blurb}</p>
        <small>{row.price} {SCRIP.unit} / unit{row.locked ? ` / locked, needs ${row.needs} standing` : ""}</small>
        <HudButton disabled={row.locked || row.price > home.bank.banked} onClick={() => command("buy", { kind: row.supply.kind })}>{row.locked ? "Locked" : row.price > home.bank.banked ? `Need ${row.price - home.bank.banked} more` : `Buy for ${row.price}`}</HudButton></div>
    </article>)}</div>
    <h3>Refit the next departure</h3><p>Both refits need a copper spool. Spending it here means another rail journey for the other refit. Installed refits survive every Life.</p>
    {(Object.keys(REFITS) as RefitId[]).map(id => { const refit = REFITS[id], installed = home.refits.includes(id), missing = refitMissing(home, id); return <article className="dw-refit" key={id}>
      <h4>{refit.name} {installed ? " / installed" : ""}</h4><p>{refit.effect}</p>
      <p>Cost: {refit.recipe.inputs.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>
      <HudButton disabled={installed || missing.length > 0} onClick={() => command("refit", { id })}>{installed ? `${refit.name} installed` : `Install ${refit.name}`}</HudButton>
      {missing.length > 0 && !installed && <p>Still needed: {missing.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>}
    </article>; })}
    <p role="status">{hint}</p>{error && <p role="alert">{error}</p>}
    <div className="dw-actions"><HudButton onClick={close}>Back to Marrow</HudButton><HudButton onClick={() => window.location.reload()}>Reload saved stash</HudButton></div>
  </HudSurface></div>;
}

/** The fabricator: it shows the gear and the codex, never the body, so the body's drain at home does not re-render it. */
function FabricatorPanel({ dialogRef, command, close }: { dialogRef: DialogRef; command: Command; close: () => void }) {
  const ctx = useGameContext();
  const sheet = useGameStore(state => {
    const view = viewStore.read(state);
    return { home: view.home, gear: view.deep.gear, codex: view.deep.codex, lures: view.deep.lures, charted: view.deep.charted, departTo: view.departTo, hint: view.hint, error: view.error, world: marrowState(state) };
  });
  const deep = viewStore.read(ctx).deep;
  return <FabricatorSheet dialogRef={dialogRef} home={sheet.home} deep={deep} world={marrowOf(ctx)} departTo={sheet.departTo} hint={sheet.hint} error={sheet.error} command={command} close={close} />;
}

function CacheSheet({ dialogRef, command, close }: { dialogRef: DialogRef; command: Command; close: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { cache, hand } = useStore(viewStore, v => ({ cache: v.dive?.cache ?? NO_CACHE, hand: v.dive?.hand ?? "sidearm" }));
  const load = loadOf(cache);
  const chosen = cache.find(i => i.id === selected);
  const cells = Array.from({ length: CACHE.w * CACHE.h }, (_, i) => ({ x: i % CACHE.w, y: i / CACHE.w | 0 }));
  return <div className="dw-modal dw-cache-modal"><HudSurface ref={dialogRef} elevation="modal" data-hud-window className="dw-sheet" aria-label="Carried cache" role="dialog" aria-modal="true" tabIndex={-1}>
    <HudButton className="dw-sheet-close" onClick={close}>Close cache ×</HudButton>
    <span className="dw-eyebrow">Carried cache / 4 × 3 / equipment capacity</span><h2>What fits comes home.</h2><p className="dw-error">The tank and prints keep moving while you pack.</p>
    <div className="dw-load"><strong>{load.mass} / {CACHE_WEIGHT} weight</strong> <progress max={CACHE_WEIGHT} value={load.mass} /> <small>{load.remaining} free · anything heavier is refused at the source</small></div>
    <div className="dw-cache-grid">
      {cells.map(c => <HudButton className="dw-cache-cell" key={`${c.x}:${c.y}`} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }} aria-label={`Move selected item to column ${c.x + 1}, row ${c.y + 1}`} onClick={() => { if (chosen) command("pack", { uid: chosen.id, x: c.x, y: c.y }); }} />)}
      {cache.map(i => { const f = footprint(i), item = ITEMS[kindOf(i)]; return <HudButton key={i.id} className={`dw-cache-item ${selected === i.id ? "selected" : ""}`} style={{ gridColumn: `${i.x + 1} / span ${f.w}`, gridRow: `${i.y + 1} / span ${f.h}`, borderColor: item.color }} onClick={() => setSelected(i.id)}><ItemMark kind={kindOf(i)} size={28} /><span style={{ color: item.color }}>{item.name}</span><small>{i.rarity} · Lv {i.level}</small></HudButton>; })}
    </div>
    {chosen ? <div className="dw-pack-controls"><strong>{chosen.name}</strong><p>Select an empty square as its upper-left corner. {chosen.mass} weight, level {chosen.level}.</p>
      <div className="dw-actions">{([[-1, 0, "←"], [0, -1, "↑"], [0, 1, "↓"], [1, 0, "→"]] as const).map(([dx, dy, label]) => <HudButton key={label} aria-label={`Move ${label}`} onClick={() => command("pack", { uid: chosen.id, x: chosen.x + dx, y: chosen.y + dy })}>{label}</HudButton>)}
        <HudButton onClick={() => command("pack", { uid: chosen.id, rotate: true })}>Rotate</HudButton><HudButton onClick={() => { command("discard", { uid: chosen.id }); setSelected(null); }}>Leave behind</HudButton></div>
    </div> : <p>Select a carried item to repack, rotate or leave it behind.</p>}
    {cache.some(i => kindOf(i) === "service-rifle") && <div className="dw-hand-wheel"><span>ONE HAND</span><HudButton aria-pressed={hand === "sidearm"} onClick={() => command("equip", { hand: "sidearm" })}>Issue sidearm</HudButton><HudButton aria-pressed={hand === "service-rifle"} onClick={() => command("equip", { hand: "service-rifle" })}>Found service rifle</HudButton></div>}
    <HudButton onClick={() => { command("cache"); grab(); }}>Close cache / Tab</HudButton>
  </HudSurface></div>;
}

function ReprintSheet({ dialogRef, command }: { dialogRef: DialogRef; command: Command }) {
  const ctx = useGameContext();
  const { home, error } = useStore(viewStore, v => ({ home: v.home, error: v.error }));
  return <div className="dw-modal"><HudSurface ref={dialogRef} elevation="modal" data-hud-window className="dw-sheet dw-pause" aria-label="Life ended" role="alertdialog" aria-modal="true" tabIndex={-1}>
    <span className="dw-eyebrow">Halloway / reprint docket · Life {home.life - 1} ended</span><h2>Bellwether kept the haul.</h2>
    <p>{home.last?.reason}</p><p>{home.last?.count === null ? "Carried haul lost." : `${home.last?.count ?? 0} carried items lost.`} {home.stash.length} banked items and {home.refits.length} installed refits remain safe in Marrow.</p>
    <p>Halloway has printed Life {home.life}. This loss is already saved; accepting the reprint is the only way back to the rail.</p>
    {error && <p role="alert">{error}</p>}
    <HudButton onClick={() => { command("acknowledgeReprint"); if (viewStore.read(ctx).mode === "home") grab(); }}>Accept reprint / return to Marrow</HudButton>
    <HudButton onClick={() => window.location.reload()}>Reload saved Marrow</HudButton>
  </HudSurface></div>;
}

function SaveSheet({ dialogRef, command }: { dialogRef: DialogRef; command: Command }) {
  const { mode, error } = useStore(viewStore, v => ({ mode: v.mode, error: v.error }));
  return <div className="dw-modal"><HudSurface ref={dialogRef} elevation="modal" data-hud-window className="dw-sheet dw-pause" role="alertdialog" aria-label="Marrow save boundary" aria-modal="true" tabIndex={-1}>
    <span className="dw-eyebrow">Marrow / save boundary</span><h2>{mode === "saving" ? "Return pending" : "Marrow is unavailable"}</h2><p>{error}</p>
    <p>{mode === "saving" ? "The simulation is stopped. This return has not been acknowledged; retry or reload the saved record." : "The saved record has been preserved. No new dive can begin."}</p>
    {mode === "saving" && <HudButton onClick={() => command("retrySave")}>Retry saving this return</HudButton>}
    <HudButton onClick={() => window.location.reload()}>Reload saved Marrow</HudButton>
  </HudSurface></div>;
}
