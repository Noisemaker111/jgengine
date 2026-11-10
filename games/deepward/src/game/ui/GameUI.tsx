/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";
import { useActionBindings } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { allActionCodes } from "@jgengine/core/input/actionBindings";
import { useSceneSwapping } from "@jgengine/core/ui/sceneSwap.view";
import { useBrowserSuspension } from "@jgengine/ui";
import { RuneBox, RuneSurface, useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useOptionalGamePhase } from "@jgengine/ui/hooks";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { useGameStore } from "@jgengine/ui/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { ALL, AMBER, Button, Heading, RED, Row, Section, Sheet, Tag, Text } from "./dock";
import { groundDistance, EXIT, roomAt } from "../../world";
import { nearby, storageChanged, viewStore, type View } from "../controls";
import { CACHE, footprint, ITEMS, type Dive } from "../state";
import { weaponReadout } from "../combat";
import { loadOf, CACHE_WEIGHT } from "../haul";
import { breakdownValue, compareToPrepared, kindOf, statLines, type Item } from "../items";
import { REFITS, refitMissing, type RefitId } from "../progression";
import { counterRows, marrowStanding, OPERATOR, SCRIP, scripJournal } from "../counter";
import { ItemMark } from "./ItemMark";
import { DeepwardMenu, RecordSettings } from "./menu/DeepwardMenu";
import { RECORD_KEY, SAVE_KEY } from "../save";
import { ActionPlate, DepthStrip, DiveComputer, Docket, HoldTab, KitCounter, CommsLine, VisorReticle, SearchBar, Visor } from "./VisorHud";
import { FabricatorSheet } from "./FabricatorSheet";
import { marrowOf, marrowState } from "../marrow";
import { nextGoal, sealMark } from "../deep";
import { crushDamage, STRATA } from "../strata";
import { GAME_FONTS } from "../../art/look";

/*
 * The visor HUD is a tree of leaves. GameUI itself re-renders only when the screen's structure
 * changes (a panel opens, the dive starts, air goes low). Each panel selects just what it shows, and
 * the readouts that move every tick (air, suit, food, water, the rail, ammo, the load, a search) are
 * getters bound to their own text and bar nodes, so a tick never re-renders a panel.
 */

type Command = (name: string, input?: unknown) => unknown;

for (const face of [GAME_FONTS.display, GAME_FONTS.body, GAME_FONTS.numeric]) {
  if (face !== undefined) registerNativeRuneFont(resolveAssetBaseUrl(face.src));
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
const CHANNEL_LABEL = { search: "Searching", harvest: "Working", scan: "Scanning", supply: "Taking", creature: "Scanning", zero: "Copying" } as const;
const HOME_SPOT = [0, 0, 14] as const;
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
  return <Text size={11} color={comparison.better === "candidate" ? "#9ce0a0" : "#eead78"}>
    {verdict}{" "}
    {comparison.deltas.map(delta => `${STAT_LABEL[delta.stat] ?? delta.stat} ${signed(delta.delta)}`).join(" · ")}
    {` scored ${signed(comparison.scoreDelta, 1)} of ${Math.round(comparison.scoreCandidate)}`}
  </Text>;
}

/** The carried mass of a cache list, worked out once per list: the list keeps its identity until it changes. */
const carriedMass = new WeakMap<readonly Item[], number>();
function massOf(cache: readonly Item[]): number {
  let mass = carriedMass.get(cache);
  if (mass === undefined) { mass = loadOf(cache).mass; carriedMass.set(cache, mass); }
  return mass;
}
function positionOf(ctx: GameContext): readonly [number, number, number] {
  return ctx.scene.entity.get(ctx.player.userId)?.position ?? HOME_SPOT;
}
const isOpen = (view: View): boolean => view.panel === null && !view.paused && (view.mode === "home" || view.mode === "dive");

/** Getters for every reading that moves each tick; the HUD binds them to their own nodes. */
function liveReadings(ctx: GameContext) {
  const view = () => viewStore.read(ctx);
  return {
    oxygen: () => view().dive?.oxygen ?? 0,
    health: () => view().dive?.health ?? 0,
    rail: () => groundDistance(positionOf(ctx), EXIT),
    food: () => view().deep.body.values["food"] ?? 0,
    water: () => view().deep.body.values["water"] ?? 0,
    loaded: () => view().ammo?.loaded ?? null,
    reserve: () => view().ammo?.reserve ?? 0,
    reloadLeft: () => { const ammo = view().ammo; return ammo?.reloading === true ? Math.round((1 - ammo.reloadProgress) * 1.3 * 10) / 10 : 0; },
    items: () => view().dive?.cache.length ?? 0,
    mass: () => { const cache = view().dive?.cache; return cache === undefined ? 0 : massOf(cache); },
    search: () => { const channel = view().dive?.channel; if (channel === null || channel === undefined) return 0; const total = channel.total ?? 1.4; return (total - channel.remaining) / total; },
  };
}
type Readings = ReturnType<typeof liveReadings>;

/** Over the canvas while the next floor builds and compiles: where the rail or the lift is taking you. */
function TravelCard() {
  const swapping = useSceneSwapping();
  const where = useStore(viewStore, v => v.dive === null ? "Marrow" : `${STRATA[v.dive.stratum].numeral} · ${STRATA[v.dive.stratum].name}`);
  return swapping ? <RuneBox pin={ALL} fill="#05090a" justify="center" items="center"><Tag>{where}</Tag></RuneBox> : null;
}

export function GameUI() {
  const ctx = useGameContext();
  const screen = useStore(viewStore, v => ({ panel: v.panel, mode: v.mode, paused: v.paused, diving: v.dive !== null, low: v.dive !== null && v.dive.oxygen <= 25 }));
  const { width, height } = useRuneViewport();
  const phase = useOptionalGamePhase();
  const settings = useSettings();
  const readings = useMemo(() => liveReadings(ctx), [ctx]);
  const command: Command = (name, input = {}) => ctx.game.commands.run(`deepward.${name}`, input);
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
  // The title and the pause are one menu system: the live station stays behind both. A save
  // boundary or a pending reprint keeps its own sheet, so the menu steps aside for it.
  // The pause menu covers a HUD that stays mounted, only hidden: tearing the whole HUD down on
  // Escape and building it again on resume froze each of those frames for ~45 ms.
  const pauseMenu = phase === "paused" && screen.panel === null && (screen.mode === "home" || screen.mode === "dive");
  const close = () => { command("close"); grab(); };
  const phone = width < 520;
  return <RuneSurface label="Deepward" family="Rajdhani" color="#ede9d9">
    <RuneBox pin={ALL} hidden={phase === "menu" || pauseMenu}>
    <VisorGlass low={screen.low} />
      <RuneBox pin={[null, 20, 20, null]}>
        <HoldTab disabled={screen.mode !== "home" && screen.mode !== "dive"} onPause={() => command("pause")} />
      </RuneBox>
      {screen.diving && <>
        <RuneBox pin={[20, 20, 130, null]} items="center">
          <DepthReadout />
        </RuneBox>
        <RuneBox pin={[12, phone ? 75 : null, null, phone ? null : 20]}>
          <AirReadout readings={readings} />
        </RuneBox>
        <RuneBox pin={[null, phone ? 340 : null, 12, phone ? null : 20]}>
          <HaulReadout readings={readings} onCache={() => command("cache")} />
        </RuneBox>
      </>}
      {screen.mode === "home" && screen.panel === null && <RuneBox pin={[20, 20, null, null]}>
        <HomeDocket />
      </RuneBox>}
      <RuneBox pin={[0, null, 0, height < 560 ? 14 : 20]} items="center" gap={8}>
        <Prompt readings={readings} command={command} />
        <Radio />
      </RuneBox>
    {screen.panel === "stash" && <StashSheet command={command} close={close} />}
    {screen.panel === "fabricator" && <FabricatorPanel command={command} close={close} />}
    {screen.panel === "cache" && screen.diving && <CacheSheet command={command} close={close} />}
    {screen.mode === "reprinting" && <ReprintSheet command={command} />}
    {(screen.mode === "saving" || screen.mode === "blocked") && <SaveSheet command={command} />}
    <TravelCard />
    </RuneBox>
    {phase === "menu" || pauseMenu ? <DeepwardMenu /> : null}
    {settings.isOpen ? <Sheet title="Settings" close={settings.close}><RecordSettings /></Sheet> : null}
  </RuneSurface>;
}

/** The helmet glass: the low-air wash, the hurt wash and the reticle. */
function VisorGlass({ low }: { low: boolean }) {
  const glass = useStore(viewStore, v => ({ diving: v.dive !== null, hurt: v.dive !== null && v.dive.hurt > 0, hit: v.dive !== null && v.dive.flash > 0 }));
  return <>
    <Visor low={low} hurt={glass.hurt} />
    {/* Always mounted, only faded: its first draw links a blur program in the browser, a frame frozen mid-fight. */}
    {glass.diving && <VisorReticle hit={glass.hit} />}
  </>;
}

/** The room on the brow strip; it re-renders only when the diver walks into another room. */
function DepthReadout() {
  const room = useGameStore(ctx => {
    const stratum = viewStore.read(ctx).dive?.stratum ?? "vault";
    const here = roomAt(positionOf(ctx), stratum);
    return stratum === "vault" ? here : here.replace(/^(\d+)\s*\/\s*/, (_, n: string) => `${n} / ${STRATA[stratum].name} · `);
  });
  return <DepthStrip room={room} />;
}

function AirReadout({ readings }: { readings: Readings }) {
  const suit = useStore(viewStore, v => {
    const dive = v.dive, stratum = dive?.stratum ?? "vault", mark = sealMark(v.deep);
    return {
      tank: dive?.tankSeconds ?? 1, low: dive !== null && dive.oxygen <= 25, hurt: dive !== null && dive.hurt > 0,
      mark, pressure: STRATA[stratum].pressure, crushing: crushDamage(stratum, mark) > 0,
      ration: dive?.belt.ration ?? 0, flasks: dive?.belt.water ?? 0, lure: dive?.belt.lure ?? 0, lamp: dive?.lamp ?? false,
    };
  });
  const body = useMemo(() => ({ food: readings.food, water: readings.water }), [readings]);
  return <DiveComputer oxygen={readings.oxygen} health={readings.health} rail={readings.rail} tank={suit.tank} sealed={suit.tank > 110} low={suit.low} hurt={suit.hurt}
    body={body} seal={{ mark: suit.mark, pressure: suit.pressure, crushing: suit.crushing }}
    belt={{ ration: suit.ration, water: suit.flasks, lure: suit.lure, lamp: suit.lamp }} />;
}

function HaulReadout({ readings, onCache }: { readings: Readings; onCache: () => void }) {
  const hand = useStore(viewStore, v => ({
    weapon: weaponReadout(v.dive).label, capacity: v.ammo?.capacity ?? null, reloading: v.ammo?.reloading === true,
    full: v.dive !== null && massOf(v.dive.cache) >= CACHE_WEIGHT,
  }));
  return <KitCounter weapon={hand.weapon} capacity={hand.capacity} reloading={hand.reloading} full={hand.full} capacityWeight={CACHE_WEIGHT}
    loaded={readings.loaded} reserve={readings.reserve} reloadLeft={readings.reloadLeft} items={readings.items} mass={readings.mass} onCache={onCache} />;
}

/** Marrow's departure docket, re-rendered only when a figure on it changes as shown. */
function HomeDocket() {
  const docket = useGameStore(ctx => {
    const view = viewStore.read(ctx), base = marrowOf(ctx);
    const standing = marrowStanding(view.home.standing);
    const goal = nextGoal(view.deep, base), said = base.says("halloway");
    const prepared = view.home.stash.find(item => item.id === view.rifleUid) ?? null;
    return {
      life: view.home.life, scrip: view.home.bank.banked, stash: view.home.stash.length, returns: view.home.extractions, lost: view.home.deaths,
      standing: `${standing.tier(OPERATOR, "marrow").id} / ${standing.standing(OPERATOR, "marrow")}`,
      next: `${goal?.text ?? "Pattern 406 is home."} · ${view.rifleUid === null ? "issue sidearm" : `${prepared?.name ?? "service rifle"} at risk`}`,
      brief: said.length > 0 ? `Halloway: ${said[said.length - 1]}` : undefined,
      food: Math.ceil(view.deep.body.values["food"] ?? 0), water: Math.ceil(view.deep.body.values["water"] ?? 0),
      power: base.num("marrow.power"), meals: Math.floor(base.num("marrow.food")), flasks: Math.floor(base.num("marrow.water")),
      lastKind: view.home.last?.kind ?? null, lastReason: view.home.last?.reason ?? "",
    };
  });
  return <Docket life={docket.life} scrip={docket.scrip} stash={docket.stash} returns={docket.returns} lost={docket.lost} standing={docket.standing} next={docket.next} brief={docket.brief}
    base={{ food: docket.food, water: docket.water, power: docket.power, meals: docket.meals, flasks: docket.flasks }}
    last={docket.lastKind === null ? null : { kind: docket.lastKind, reason: docket.lastReason }} />;
}

function Radio() {
  const radio = useStore(viewStore, v => ({ hint: v.hint, error: v.error && v.mode !== "saving" && v.mode !== "blocked" ? v.error : null }));
  return <CommsLine hint={radio.hint} error={radio.error} />;
}

/** A running search's bar, or the action the diver is standing at. */
function Prompt({ readings, command }: { readings: Readings; command: Command }) {
  const ctx = useGameContext();
  const prompt = useGameStore(state => {
    const view = viewStore.read(state), channel = view.dive?.channel ?? null;
    if (channel !== null) return { channel: channel.kind ?? "search", target: null };
    return { channel: null, target: view.panel === null && !view.paused ? nearby(state)?.label ?? null : null };
  });
  if (prompt.channel !== null) return <SearchBar done={readings.search} label={CHANNEL_LABEL[prompt.channel]} />;
  if (prompt.target === null) return null;
  return <ActionPlate label={prompt.target} onAct={() => { command("interact"); if (isOpen(viewStore.read(ctx))) grab(); }} />;
}

function StashSheet({ command, close }: { command: Command; close: () => void }) {
  const { home, rifleUid, hint, error } = useStore(viewStore, v => ({ home: v.home, rifleUid: v.rifleUid, hint: v.hint, error: v.error }));
  const prepared = home.stash.find(item => item.id === rifleUid) ?? null;
  const counter = counterRows(home);
  const journal = scripJournal(home, 4);
  return <Sheet title="Marrow's stash" close={close}>
    <Tag color={AMBER}>Permanent / saved on return</Tag>
    <Text>These exact item instances survived the rail journey. They remain here through deaths and reloads. Each carries the level of the room it came from and whatever its roll turned out to be.</Text>
    {prepared !== null && <Text>Prepared: {prepared.name} · {Math.round(prepared.stats["damage"] ?? 0)} damage · {(1 / (prepared.stats["rate"] ?? 2)).toFixed(2)}s cycle · {prepared.mass} weight. It is the baseline every other rifle is compared against.</Text>}
    <Heading>Choose the next shift</Heading><Text>Travel light with the issue sidearm and twelve free cache squares, or risk a recovered rifle for {Math.round(prepared?.stats["damage"] ?? 30)} damage per shot instead of {weaponReadout(null).damage}. A rifle fills three squares and is lost on death. Returning banks the same rifle again.</Text>
    <Button onPress={() => command("prepareRifle", { uid: null })}>Travel light / keep rifles safe</Button>
    {home.stash.length === 0 ? <Text>Empty shelves. Bring something home from Bellwether.</Text> : <RuneBox gap={9}>{home.stash.map(item => <Section key={item.id}>
      <Row><ItemMark kind={kindOf(item)} size={38} /><Text size={17}>{item.name}</Text></Row>
        <Text size={11}>{RARITY_LABEL[item.rarity] ?? item.rarity} · level {item.level} · {ITEMS[kindOf(item)].maker} · {ITEMS[kindOf(item)].found}</Text><Text size={11}>{ITEMS[kindOf(item)].detail}</Text>
        <Text size={11}>{statLines(item).map(line => `${line.label} ${line.value.toFixed(line.digits)}${line.unit}`).join(" · ")} · weight {item.mass}</Text>
        {item.affixes.length > 0 && <Text size={11}>{affixText(item)}</Text>}
        <Tag>Found on dive {item.id.split(":")[0]}</Tag>
        <Compared item={item} equipped={prepared} />
        <RuneBox gap={8}>
          {kindOf(item) === "service-rifle" && <Button onPress={() => command("prepareRifle", { uid: item.id })}>{rifleUid === item.id ? "Prepared / three squares at risk" : "Prepare this rifle / risk next shift"}</Button>}
          <Button onPress={() => command("dismantle", { id: item.id })}>{`Dismantle / ${breakdownValue(item)} scrip`}</Button>
        </RuneBox>
    </Section>)}</RuneBox>}
    <Heading>Fitter's counter / {home.bank.banked} scrip banked</Heading><Text>Marrow clears operators it trusts. Better standing also prices every shelf a little lower.</Text>
    {journal.map(entry => <Text key={entry.seq} size={11}>{entry.reason}{entry.ref === undefined ? "" : ` / ${entry.ref}`} {entry.amount > 0 ? "+" : ""}{entry.amount} · {entry.balanceAfter} banked</Text>)}
    {counter.map(row => <Section key={row.supply.kind}>
      <Row><ItemMark kind={row.supply.kind} size={32} /><Text>{row.supply.label}</Text></Row><Text>{row.supply.blurb}</Text>
      <Text size={11}>{row.price} {SCRIP.unit} / unit{row.locked ? ` / locked, needs ${row.needs} standing` : ""}</Text>
      <Button disabled={row.locked || row.price > home.bank.banked} onPress={() => command("buy", { kind: row.supply.kind })}>{row.locked ? "Locked" : row.price > home.bank.banked ? `Need ${row.price - home.bank.banked} more` : `Buy for ${row.price}`}</Button>
    </Section>)}
    <Heading>Refit the next departure</Heading><Text>Both refits need a copper spool. Spending it here means another rail journey for the other refit. Installed refits survive every Life.</Text>
    {(Object.keys(REFITS) as RefitId[]).map(id => { const refit = REFITS[id], installed = home.refits.includes(id), missing = refitMissing(home, id); return <Section key={id}>
      <Text>{refit.name} {installed ? " / installed" : ""}</Text><Text>{refit.effect}</Text>
      <Text>Cost: {refit.recipe.inputs.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</Text>
      <Button disabled={installed || missing.length > 0} onPress={() => command("refit", { id })}>{installed ? `${refit.name} installed` : `Install ${refit.name}`}</Button>
      {missing.length > 0 && !installed && <Text>Still needed: {missing.map(i => `${i.count} ${ITEMS[i.itemId as keyof typeof ITEMS].name}`).join(" + ")}</Text>}
    </Section>; })}
    <Text role="status">{hint}</Text>{error && <Text color={RED} role="alert">{error}</Text>}
    <Button onPress={close}>Back to Marrow</Button><Button onPress={() => window.location.reload()}>Reload saved stash</Button>
  </Sheet>;
}

/** The fabricator: it shows the gear and the codex, never the body, so the body's drain at home does not re-render it. */
function FabricatorPanel({ command, close }: { command: Command; close: () => void }) {
  const ctx = useGameContext();
  const sheet = useGameStore(state => {
    const view = viewStore.read(state);
    return { home: view.home, gear: view.deep.gear, codex: view.deep.codex, lures: view.deep.lures, charted: view.deep.charted, departTo: view.departTo, hint: view.hint, error: view.error, world: marrowState(state) };
  });
  const deep = viewStore.read(ctx).deep;
  return <FabricatorSheet home={sheet.home} deep={deep} world={marrowOf(ctx)} departTo={sheet.departTo} hint={sheet.hint} error={sheet.error} command={command} close={close} />;
}

function CacheSheet({ command, close }: { command: Command; close: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { cache, hand } = useStore(viewStore, v => ({ cache: v.dive?.cache ?? NO_CACHE, hand: v.dive?.hand ?? "sidearm" }));
  const load = loadOf(cache);
  const chosen = cache.find(i => i.id === selected);
  const { width } = useRuneViewport();
  const cell = Math.min(120, (width - 90) / CACHE.w);
  const cells = Array.from({ length: CACHE.w * CACHE.h }, (_, i) => ({ x: i % CACHE.w, y: i / CACHE.w | 0 }));
  return <Sheet title="What fits comes home." label="Carried cache" close={close}>
    <Tag color={AMBER}>Carried cache / 4 × 3 / equipment capacity</Tag><Text color={RED}>The tank and prints keep moving while you pack.</Text>
    <Text>{load.mass} / {CACHE_WEIGHT} weight · {load.remaining} free · anything heavier is refused at the source</Text>
    <RuneBox width={cell * CACHE.w} height={76 * CACHE.h}>
      {cells.map(c => <Button key={`${c.x}:${c.y}`} pin={[c.x * cell, c.y * 76, null, null]} width={cell - 5} height={71} fill="#112125" label={`Move selected item to column ${c.x + 1}, row ${c.y + 1}`} onPress={() => { if (chosen) command("pack", { uid: chosen.id, x: c.x, y: c.y }); }} />)}
      {cache.map(i => { const f = footprint(i), item = ITEMS[kindOf(i)]; return <Button key={i.id} pin={[i.x * cell, i.y * 76, null, null]} width={cell * f.w - 5} height={76 * f.h - 5} padding={7} fill="#1c3030" border={{ width: selected === i.id ? 3 : 2, color: selected === i.id ? "#f2e2ba" : item.color }} label={`Select ${item.name}`} onPress={() => setSelected(i.id)}><ItemMark kind={kindOf(i)} size={28} /><Text size={11} color={item.color}>{item.name}</Text><Tag size={9}>{i.rarity} · Lv {i.level}</Tag></Button>; })}
    </RuneBox>
    {chosen ? <Section><Text>{chosen.name}</Text><Text>Select an empty square as its upper-left corner. {chosen.mass} weight, level {chosen.level}.</Text>
      <Row>{([[-1, 0, "←"], [0, -1, "↑"], [0, 1, "↓"], [1, 0, "→"]] as const).map(([dx, dy, label]) => <Button key={label} label={`Move ${label}`} onPress={() => command("pack", { uid: chosen.id, x: chosen.x + dx, y: chosen.y + dy })}>{label}</Button>)}</Row>
      <Button onPress={() => command("pack", { uid: chosen.id, rotate: true })}>Rotate</Button><Button onPress={() => { command("discard", { uid: chosen.id }); setSelected(null); }}>Leave behind</Button>
    </Section> : <Text>Select a carried item to repack, rotate or leave it behind.</Text>}
    {cache.some(i => kindOf(i) === "service-rifle") && <Section><Tag>ONE HAND / {hand}</Tag><Button onPress={() => command("equip", { hand: "sidearm" })}>Issue sidearm</Button><Button onPress={() => command("equip", { hand: "service-rifle" })}>Found service rifle</Button></Section>}
    <Button onPress={() => { command("cache"); grab(); }}>Close cache / Tab</Button>
  </Sheet>;
}

function ReprintSheet({ command }: { command: Command }) {
  const ctx = useGameContext();
  const { home, error } = useStore(viewStore, v => ({ home: v.home, error: v.error }));
  return <Sheet title="Bellwether kept the haul." label="Life ended">
    <Tag color={AMBER}>Halloway / reprint docket · Life {home.life - 1} ended</Tag>
    <Text>{home.last?.reason}</Text><Text>{home.last?.count === null ? "Carried haul lost." : `${home.last?.count ?? 0} carried items lost.`} {home.stash.length} banked items and {home.refits.length} installed refits remain safe in Marrow.</Text>
    <Text>Halloway has printed Life {home.life}. This loss is already saved; accepting the reprint is the only way back to the rail.</Text>
    {error && <Text color={RED} role="alert">{error}</Text>}
    <Button onPress={() => { command("acknowledgeReprint"); if (viewStore.read(ctx).mode === "home") grab(); }}>Accept reprint / return to Marrow</Button>
    <Button onPress={() => window.location.reload()}>Reload saved Marrow</Button>
  </Sheet>;
}

function SaveSheet({ command }: { command: Command }) {
  const { mode, error } = useStore(viewStore, v => ({ mode: v.mode, error: v.error }));
  return <Sheet title={mode === "saving" ? "Return pending" : "Marrow is unavailable"} label="Marrow save boundary">
    <Tag color={AMBER}>Marrow / save boundary</Tag><Text color={RED}>{error}</Text>
    <Text>{mode === "saving" ? "The simulation is stopped. This return has not been acknowledged; retry or reload the saved record." : "The saved record has been preserved. No new dive can begin."}</Text>
    {mode === "saving" && <Button onPress={() => command("retrySave")}>Retry saving this return</Button>}
    <Button onPress={() => window.location.reload()}>Reload saved Marrow</Button>
  </Sheet>;
}
