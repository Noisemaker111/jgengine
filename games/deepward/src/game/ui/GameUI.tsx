import { useEffect, useState, useSyncExternalStore } from "react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useBrowserSuspension, useDialogBehavior } from "@jgengine/react";
import { useOptionalGamePhase } from "@jgengine/react/hooks";
import { useSettings } from "@jgengine/react/settings";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { distance, EXIT, roomAt } from "../../world";
import { nearby, storageChanged, viewStore } from "../controls";
import { CACHE, footprint, ITEMS } from "../state";
import { weaponReadout } from "../combat";
import { loadOf, CACHE_WEIGHT } from "../haul";
import { breakdownValue, compareToPrepared, itemValue, kindOf, statLines, type Item } from "../items";
import { REFITS, refitMissing, type RefitId } from "../progression";
import { counterRows, marrowStanding, OPERATOR, SCRIP, scripJournal } from "../counter";
import { ItemMark } from "./ItemMark";
import { DeepwardMenu } from "./menu/DeepwardMenu";
import { RECORD_KEY, SAVE_KEY } from "../save";
import { placement } from "./hudPanels";
import { ActionPlate, DepthStrip, DiveComputer, Docket, HoldTab, KitCounter, RadioLine, Reticle, SearchBar, Visor } from "./VisorHud";
import { FabricatorSheet } from "./FabricatorSheet";
import { marrowOf } from "../marrow";
import { nextGoal, sealMark } from "../deep";
import { crushDamage, STRATA } from "../strata";
import { useGameFonts } from "@jgengine/react/gameFonts";
import { GAME_FONTS } from "../../art/fonts/fonts";

const PORTRAIT = "(max-aspect-ratio: 4/5)";
/** A tall phone: the visor's readouts move to the top corners so the bottom lane stays free. */
function usePortrait(): boolean {
  return useSyncExternalStore(
    notify => { const query = window.matchMedia(PORTRAIT); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); },
    () => window.matchMedia(PORTRAIT).matches,
    () => false,
  );
}
function grab(): void {
  const canvas = document.querySelector("canvas");
  // The published shell receives keys on its focusable canvas wrapper. A menu
  // button can disappear while retaining keyboard focus, so return it to play.
  canvas?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
  try { const request = canvas?.requestPointerLock(); if (request instanceof Promise) void request.catch(() => {}); } catch { /* the player can click the scene */ }
}
const RARITY_LABEL: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const STAT_LABEL: Record<string, string> = { damage: "damage", rate: "rate", value: "assay" };
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
export function GameUI() {
  useGameFonts(GAME_FONTS);
  const ctx = useGameContext(), view = useStore(viewStore);
  const hud = useHudLayout({ storageKey: "deepward.hud" });
  const portrait = usePortrait();
  const phase = useOptionalGamePhase();
  const at = useGameStore(state => state.scene.entity.get(state.player.userId)?.position ?? [0, 0, 14] as const);
  const target = useGameStore(nearby);
  const [selected, setSelected] = useState<string | null>(null);
  const settings = useSettings();
  const command = (name: string, input: unknown = {}) => ctx.game.commands.run(`deepward.${name}`, input);
  const shiftDialogRef = useDialogBehavior({
    open: view.panel !== null || view.mode === "reprinting" || view.mode === "saving" || view.mode === "blocked",
    focusKey: view.panel ?? view.mode,
    onClose: view.mode === "home" || view.mode === "dive" ? () => command("close") : undefined,
  });
  useEffect(() => {
    if (view.panel === null && !view.paused && (view.mode === "home" || view.mode === "dive")) {
      document.querySelector("canvas")?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
    }
  }, [view.panel, view.paused, view.mode]);
  useBrowserSuspension(() => {
    const v = viewStore.read(ctx);
    if (!v.paused && v.panel === null && (v.mode === "home" || v.mode === "dive")) ctx.game.commands.run("deepward.pause", { paused: true });
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || event.repeat || settings.isOpen) return;
      const current = viewStore.read(ctx);
      if (current.panel !== null || current.paused || (current.mode !== "home" && current.mode !== "dive")) return;
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
  // The title and the pause are one menu system: the live station stays behind both. A save
  // boundary or a pending reprint keeps its own sheet, so the menu steps aside for it.
  if (phase === "menu" || (phase === "paused" && view.panel === null && (view.mode === "home" || view.mode === "dive"))) return <DeepwardMenu />;
  const dive = view.dive;
  const low = dive !== null && dive.oxygen <= 25;
  const weapon = weaponReadout(dive);
  const load = loadOf(dive?.cache ?? []);
  const chosen = dive?.cache.find(i => i.id === selected);
  const cells = Array.from({ length: CACHE.w * CACHE.h }, (_, i) => ({ x: i % CACHE.w, y: i / CACHE.w | 0 }));
  const marrowLedger = marrowStanding(view.home.standing);
  const marrowTier = marrowLedger.tier(OPERATOR, "marrow");
  const marrowScore = marrowLedger.standing(OPERATOR, "marrow");
  const counter = counterRows(view.home);
  const journal = scripJournal(view.home, 4);
  const prepared = view.home.stash.find(item => item.id === view.rifleUid) ?? null;
  const close = () => { command("close"); grab(); };
  // Marrow's base and story world, and what the body and the suit read on this floor.
  const base = marrowOf(ctx);
  const goal = nextGoal(view.deep, base);
  const said = base.says("halloway");
  const body = { food: view.deep.body.values.food ?? 0, water: view.deep.body.values.water ?? 0 };
  const stratum = dive?.stratum ?? "vault";
  const room = roomAt(at, stratum);
  const depthRoom = stratum === "vault" ? room : room.replace(/^(\d+)\s*\/\s*/, (_, n: string) => `${n} / ${STRATA[stratum].name} · `);
  const channelLabel = { search: "Searching", harvest: "Working", scan: "Scanning", supply: "Taking", creature: "Scanning", zero: "Copying" } as const;
  return <div className={`dw-ui dw-hud ${low ? "dw-low" : ""} ${view.paused ? "dw-held" : ""}`} onKeyDown={event => {
    if (event.code === "Tab") event.stopPropagation();
    if ((event.code === "Space" || event.code === "Enter") && event.target instanceof HTMLElement && event.target.closest("button, a, input, select, textarea, [contenteditable=true]")) event.stopPropagation();
  }}>
    <Visor low={low} hurt={dive !== null && dive.hurt > 0} />
    {dive !== null && dive.hurt > 0 && <div className="dw-hurtwash" aria-hidden="true" />}
    {dive !== null && <Reticle hit={dive.flash > 0} />}
    <HudCanvas layout={hud} editChord={false} compactScale={0.86}>
      <HudPanel {...placement("shift", portrait)} compact="keep" locked>
        <HoldTab disabled={view.mode !== "home" && view.mode !== "dive"} onPause={() => command("pause")} />
      </HudPanel>
      {dive !== null && <>
        <HudPanel {...placement("depth", portrait)} compact="keep" interactive={false} locked>
          <DepthStrip room={depthRoom} />
        </HudPanel>
        <HudPanel {...placement("air", portrait)} compact="keep" interactive={false} locked>
          <DiveComputer oxygen={dive.oxygen} tank={dive.tankSeconds} health={dive.health} rail={distance(at, EXIT)} sealed={dive.tankSeconds > 110} low={low} hurt={dive.hurt > 0}
            body={body} seal={{ mark: sealMark(view.deep), pressure: STRATA[stratum].pressure, crushing: crushDamage(stratum, sealMark(view.deep)) > 0 }}
            belt={{ ...dive.belt, lamp: dive.lamp }} />
        </HudPanel>
        <HudPanel {...placement("haul", portrait)} compact="keep" locked>
          <KitCounter weapon={weapon.label} loaded={view.ammo?.loaded ?? null} capacity={view.ammo?.capacity ?? null} reserve={view.ammo?.reserve ?? 0}
            reloading={view.ammo?.reloading ? Math.round((1 - view.ammo.reloadProgress) * 1.3 * 10) / 10 : null}
            items={dive.cache.length} mass={load.mass} capacityWeight={CACHE_WEIGHT} onCache={() => command("cache")} />
        </HudPanel>
      </>}
      {view.mode === "home" && view.panel === null && <HudPanel {...placement("home", portrait)} compact="keep" interactive={false} locked>
        <Docket life={view.home.life} scrip={view.home.bank.banked} stash={view.home.stash.length} returns={view.home.extractions} lost={view.home.deaths}
          standing={`${marrowTier.id} / ${marrowScore}`}
          next={`${goal?.text ?? "Pattern 406 is home."} · ${view.rifleUid === null ? "issue sidearm" : `${prepared?.name ?? "service rifle"} at risk`}`}
          brief={said.length > 0 ? `Halloway: ${said[said.length - 1]}` : undefined}
          base={{ food: body.food, water: body.water, power: base.num("marrow.power"), meals: base.num("marrow.food"), flasks: base.num("marrow.water") }}
          last={view.home.last === null ? null : { kind: view.home.last.kind, reason: view.home.last.reason }} />
      </HudPanel>}
      <HudPanel {...placement("radio", portrait)} compact="keep" interactive={false} locked>
        <RadioLine hint={view.hint} error={view.error && view.mode !== "saving" && view.mode !== "blocked" ? view.error : null} />
      </HudPanel>
      <HudPanel {...placement("prompt", portrait)} compact="keep" locked>
        {dive?.channel !== null && dive?.channel !== undefined ? <SearchBar remaining={dive.channel.remaining} total={dive.channel.total ?? 1.4} label={channelLabel[dive.channel.kind ?? "search"]} />
          : target !== null && view.panel === null && !view.paused ? <ActionPlate label={target.label} onAct={() => { command("interact"); const next = viewStore.read(ctx); if (!next.paused && next.panel === null && (next.mode === "home" || next.mode === "dive")) grab(); }} />
          : null}
      </HudPanel>
    </HudCanvas>
    {view.panel === "stash" && <div className="dw-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet" aria-label="Marrow stash" role="dialog" aria-modal="true" tabIndex={-1}>
      <HudButton className="dw-sheet-close" onClick={close}>Close bench ×</HudButton>
      <span className="dw-eyebrow">Permanent / saved on return</span><h2>Marrow's stash</h2>
      <p>These exact item instances survived the rail journey. They remain here through deaths and reloads. Each carries the level of the room it came from and whatever its roll turned out to be.</p>
      {prepared !== null && <p className="dw-prepared"><strong>Prepared: {prepared.name}</strong> · {Math.round(prepared.stats.damage ?? 0)} damage · {(1 / (prepared.stats.rate ?? 2)).toFixed(2)}s cycle · {prepared.mass} weight. It is the baseline every other rifle is compared against.</p>}
      <h3>Choose the next shift</h3><p>Travel light with the issue sidearm and twelve free cache squares, or risk a recovered rifle for {Math.round(prepared?.stats.damage ?? 30)} damage per shot instead of {weaponReadout(null).damage}. A rifle fills three squares and is lost on death. Returning banks the same rifle again.</p>
      <HudButton aria-pressed={view.rifleUid === null} onClick={() => command("prepareRifle", { uid: null })}>Travel light / keep rifles safe</HudButton>
      {view.home.stash.length === 0 ? <p className="dw-empty">Empty shelves. Bring something home from Bellwether.</p> : <div className="dw-stash-list">{view.home.stash.map(item => <article key={item.id}>
        <ItemMark kind={kindOf(item)} size={38} /><div><strong>{item.name}</strong><p>{RARITY_LABEL[item.rarity] ?? item.rarity} · level {item.level} · {ITEMS[kindOf(item)].maker} · {ITEMS[kindOf(item)].found}</p><small>{ITEMS[kindOf(item)].detail}</small>
          <small>{statLines(item).map(line => `${line.label} ${line.value.toFixed(line.digits)}${line.unit}`).join(" · ")} · weight {item.mass}</small>
          {item.affixes.length > 0 && <small className="dw-affix">{affixText(item)}</small>}
          <small>Found on dive {item.id.split(":")[0]}</small>
          <Compared item={item} equipped={prepared} />
          <div className="dw-actions">
            {kindOf(item) === "service-rifle" && <HudButton aria-pressed={view.rifleUid === item.id} onClick={() => command("prepareRifle", { uid: item.id })}>{view.rifleUid === item.id ? "Prepared / three squares at risk" : "Prepare this rifle / risk next shift"}</HudButton>}
            <HudButton onClick={() => command("dismantle", { id: item.id })}>Dismantle / {breakdownValue(item)} scrip</HudButton>
          </div></div>
      </article>)}</div>}
      <h3>Fitter's counter / {view.home.bank.banked} scrip banked</h3><p>Marrow clears operators it trusts. Better standing also prices every shelf a little lower.</p>
      {journal.length > 0 && <ol className="dw-journal" aria-label="Scrip journal">{journal.map(entry => <li key={entry.seq}>
        <span>{entry.reason}{entry.ref === undefined ? "" : ` / ${entry.ref}`}</span><strong>{entry.amount > 0 ? "+" : ""}{entry.amount}</strong><small>{entry.balanceAfter} banked</small>
      </li>)}</ol>}
      <div className="dw-counter">{counter.map(row => <article className="dw-supply" key={row.supply.kind}>
        <ItemMark kind={row.supply.kind} size={32} /><div><strong>{row.supply.label}</strong><p>{row.supply.blurb}</p>
          <small>{row.price} {SCRIP.unit} / unit{row.locked ? ` / locked, needs ${row.needs} standing` : ""}</small>
          <HudButton disabled={row.locked || row.price > view.home.bank.banked} onClick={() => command("buy", { kind: row.supply.kind })}>{row.locked ? "Locked" : row.price > view.home.bank.banked ? `Need ${row.price - view.home.bank.banked} more` : `Buy for ${row.price}`}</HudButton></div>
      </article>)}</div>
      <h3>Refit the next departure</h3><p>Both refits need a copper spool. Spending it here means another rail journey for the other refit. Installed refits survive every Life.</p>
      {(Object.keys(REFITS) as RefitId[]).map(id => { const refit = REFITS[id], installed = view.home.refits.includes(id), missing = refitMissing(view.home, id); return <article className="dw-refit" key={id}>
        <h4>{refit.name} {installed ? " / installed" : ""}</h4><p>{refit.effect}</p>
        <p>Cost: {refit.recipe.inputs.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>
        <HudButton disabled={installed || missing.length > 0} onClick={() => command("refit", { id })}>{installed ? `${refit.name} installed` : `Install ${refit.name}`}</HudButton>
        {missing.length > 0 && !installed && <p>Still needed: {missing.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</p>}
      </article>; })}
      <p role="status">{view.hint}</p>{view.error && <p role="alert">{view.error}</p>}
      <div className="dw-actions"><HudButton onClick={close}>Back to Marrow</HudButton><HudButton onClick={() => window.location.reload()}>Reload saved stash</HudButton></div>
    </HudSurface></div>}
    {view.panel === "fabricator" && <FabricatorSheet dialogRef={shiftDialogRef} home={view.home} deep={view.deep} world={base} departTo={view.departTo} hint={view.hint} error={view.error} command={command} close={close} />}
    {view.panel === "cache" && dive !== null && <div className="dw-modal dw-cache-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet" aria-label="Carried cache" role="dialog" aria-modal="true" tabIndex={-1}>
      <HudButton className="dw-sheet-close" onClick={close}>Close cache ×</HudButton>
      <span className="dw-eyebrow">Carried cache / 4 × 3 / equipment capacity</span><h2>What fits comes home.</h2><p className="dw-error">The tank and prints keep moving while you pack.</p>
      <div className="dw-load"><strong>{load.mass} / {CACHE_WEIGHT} weight</strong> <progress max={CACHE_WEIGHT} value={load.mass} /> <small>{load.remaining} free · anything heavier is refused at the source</small></div>
      <div className="dw-cache-grid">
        {cells.map(c => <HudButton className="dw-cache-cell" key={`${c.x}:${c.y}`} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }} aria-label={`Move selected item to column ${c.x + 1}, row ${c.y + 1}`} onClick={() => { if (chosen) command("pack", { uid: chosen.id, x: c.x, y: c.y }); }} />)}
        {dive.cache.map(i => { const f = footprint(i), item = ITEMS[kindOf(i)]; return <HudButton key={i.id} className={`dw-cache-item ${selected === i.id ? "selected" : ""}`} style={{ gridColumn: `${i.x + 1} / span ${f.w}`, gridRow: `${i.y + 1} / span ${f.h}`, borderColor: item.color }} onClick={() => setSelected(i.id)}><ItemMark kind={kindOf(i)} size={28} /><span style={{ color: item.color }}>{item.name}</span><small>{i.rarity} · Lv {i.level}</small></HudButton>; })}
      </div>
      {chosen ? <div className="dw-pack-controls"><strong>{chosen.name}</strong><p>Select an empty square as its upper-left corner. {chosen.mass} weight, level {chosen.level}.</p>
        <div className="dw-actions">{([[-1, 0, "←"], [0, -1, "↑"], [0, 1, "↓"], [1, 0, "→"]] as const).map(([dx, dy, label]) => <HudButton key={label} aria-label={`Move ${label}`} onClick={() => command("pack", { uid: chosen.id, x: chosen.x + dx, y: chosen.y + dy })}>{label}</HudButton>)}
          <HudButton onClick={() => command("pack", { uid: chosen.id, rotate: true })}>Rotate</HudButton><HudButton onClick={() => { command("discard", { uid: chosen.id }); setSelected(null); }}>Leave behind</HudButton></div>
      </div> : <p>Select a carried item to repack, rotate or leave it behind.</p>}
      {dive.cache.some(i => kindOf(i) === "service-rifle") && <div className="dw-hand-wheel"><span>ONE HAND</span><HudButton aria-pressed={dive.hand === "sidearm"} onClick={() => command("equip", { hand: "sidearm" })}>Issue sidearm</HudButton><HudButton aria-pressed={dive.hand === "service-rifle"} onClick={() => command("equip", { hand: "service-rifle" })}>Found service rifle</HudButton></div>}
      <HudButton onClick={() => { command("cache"); grab(); }}>Close cache / Tab</HudButton>
    </HudSurface></div>}
    {view.mode === "reprinting" && <div className="dw-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet dw-pause" aria-label="Life ended" role="alertdialog" aria-modal="true" tabIndex={-1}>
      <span className="dw-eyebrow">Halloway / reprint docket · Life {view.home.life - 1} ended</span><h2>Bellwether kept the haul.</h2>
      <p>{view.home.last?.reason}</p><p>{view.home.last?.count === null ? "Carried haul lost." : `${view.home.last?.count ?? 0} carried items lost.`} {view.home.stash.length} banked items and {view.home.refits.length} installed refits remain safe in Marrow.</p>
      <p>Halloway has printed Life {view.home.life}. This loss is already saved; accepting the reprint is the only way back to the rail.</p>
      {view.error && <p role="alert">{view.error}</p>}
      <HudButton onClick={() => { command("acknowledgeReprint"); if (viewStore.read(ctx).mode === "home") grab(); }}>Accept reprint / return to Marrow</HudButton>
      <HudButton onClick={() => window.location.reload()}>Reload saved Marrow</HudButton>
    </HudSurface></div>}
    {(view.mode === "saving" || view.mode === "blocked") && <div className="dw-modal"><HudSurface ref={shiftDialogRef} elevation="modal" data-hud-window className="dw-sheet dw-pause" role="alertdialog" aria-label="Marrow save boundary" aria-modal="true" tabIndex={-1}>
      <span className="dw-eyebrow">Marrow / save boundary</span><h2>{view.mode === "saving" ? "Return pending" : "Marrow is unavailable"}</h2><p>{view.error}</p>
      <p>{view.mode === "saving" ? "The simulation is stopped. This return has not been acknowledged; retry or reload the saved record." : "The saved record has been preserved. No new dive can begin."}</p>
      {view.mode === "saving" && <HudButton onClick={() => command("retrySave")}>Retry saving this return</HudButton>}
      <HudButton onClick={() => window.location.reload()}>Reload saved Marrow</HudButton>
    </HudSurface></div>}
  </div>;
}
