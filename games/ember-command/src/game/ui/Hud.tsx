/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneFor, RuneLabel, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { foldStatContributions } from "@jgengine/core/progression/statGraph";

import { hudStore, type ArmyUnit, type HudSnapshot } from "../hudStore";
import { campaignOrdinal } from "../campaign";
import { BARRACKS_UNITS, BUILDINGS, COMBATANTS, TRAINABLE, type BuildingId, type TrainableId } from "../catalog";
import { FORMATIONS } from "../formations";
import {
  ARMOR_REDUCE_PER_RANK, ASSAULT_DMG_PER_RANK, ASSAULT_SLOW_PER_RANK, BULWARK_DULL_PER_RANK, BULWARK_GUARD_PER_RANK,
  rankContributions, UPGRADES, WEAPON_DMG_PER_RANK, type UpgradeId,
} from "../upgrades";
import { HERO_DMG_PER_LEVEL } from "../hero";
import { Eyebrow, Glyph, hud, InkBar, Row, Small, Text, useHudSlice } from "./kit";
import { MAP_SIZE, TacticalMinimap } from "./Minimap";
import { ROSTER_METRICS, rosterFit, rosterPage } from "./rosterPage";
import { GILT, MARAUDER_INK, MOSS, OCHRE, VANGUARD_INK, WAX } from "./theme";

const BUILD_LABELS: Record<string, string> = { barracks: "Barracks", farm: "Farm", guard_tower: "Guard Tower" };
const UNIT_ICON: Record<string, string> = { footman: "helm", rifleman: "rifleman", peasant: "peasant" };
const isWorker = (unit: ArmyUnit) => unit.kind === "peasant";

/** Mission clock as the field desk writes it: whole minutes and seconds. */
export function orderClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** One entry on the ledger strip: a glyph and its bound count. */
function LedgerEntry({ icon, value, warn, label }: { icon: string; value: () => string; warn?: () => boolean; label: string }) {
  return <Row gap={5} label={label}>
    <Glyph name={icon} size={18} color={OCHRE} />
    <RuneLabel textStyle="number" value={bind(value)} {...(warn === undefined ? {} : { color: bind(() => (warn() ? WAX : "#2b1d10")) })} />
  </Row>;
}
function KeepGauge({ name, hp, max, color, warn, phoneGauge }: { phoneGauge: boolean; name: string; hp: () => number; max: () => number; color: string; warn?: () => boolean }) {
  return <RuneView gap={3} minWidth={phoneGauge ? 88 : 132}>
    <Row gap={5}><Small text={name} /><RuneLabel textStyle="number" value={bind(() => String(hp()))} {...(warn === undefined ? {} : { color: bind(() => (warn() ? WAX : "#2b1d10")) })} /></Row>
    <InkBar value={hp} max={max} color={color} width={phoneGauge ? 80 : 120} label={`${name} walls`} />
  </RuneView>;
}

/** The ledger strip: stores, both keeps' walls and the reinforcement clock, each bound at its leaf. */
function Ledger({ phone }: { phone: boolean }) {
  const food = () => { const h = hud(); return `${h.foodUsed}${h.foodReserved ? `+${h.foodReserved}` : ""}/${h.foodCap}`; };
  return <RuneView variant="note" layout={phone ? "grid" : "row"} {...(phone ? { columns: 3 } : {})} gap={phone ? 8 : 16} items="center" label="Ledger">
    <LedgerEntry icon="gold" value={() => String(hud().gold)} label="gold" />
    <LedgerEntry icon="lumber" value={() => String(hud().lumber)} label="lumber" />
    <LedgerEntry icon="food" value={food} warn={() => { const h = hud(); return h.foodUsed + h.foodReserved >= h.foodCap; }} label="food" />
    <KeepGauge phoneGauge={phone} name="Warcamp" hp={() => hud().enemyKeepHp} max={() => hud().enemyKeepMax} color={MARAUDER_INK} />
    <KeepGauge phoneGauge={phone} name="Ember Command" hp={() => hud().playerKeepHp} max={() => hud().playerKeepMax} color={VANGUARD_INK}
      warn={() => { const h = hud(); return h.playerKeepMax > 0 && h.playerKeepHp / h.playerKeepMax < 0.4; }} />
    <Row gap={5} tooltip="Marauder reinforcements: the wave count and the seconds until the next one lands">
      <Glyph name="skull" size={18} color={bind(() => (hud().nextWaveIn <= 10 ? WAX : "#5e4630"))} />
      <RuneView gap={0}>
        <Small text={bind(() => `Wave ${hud().wavesSent}`)} />
        <RuneLabel textStyle="number" value={bind(() => `${hud().nextWaveIn}s`)} color={bind(() => (hud().nextWaveIn <= 10 ? WAX : "#2b1d10"))} />
      </RuneView>
    </Row>
  </RuneView>;
}

/** The orders note: the campaign's live order with its step marks, clock and count, or the skirmish's aim. */
function OrdersNote({ width }: { width: number }) {
  const shape = useHudSlice((h) => {
    const c = h.campaign;
    return c === null ? null : { phase: c.phase, index: c.index, title: c.title, objective: c.objective, step: c.step, steps: c.steps, timer: c.remaining !== null, timed: c.duration !== null && c.duration > 0, count: c.count };
  });
  const live = shape !== null && shape.phase === "live";
  return <RuneView variant="note" width={width} gap={4}>
    {live ? <>
      <Row justify="between">
        <Eyebrow text={`Order ${campaignOrdinal(shape.index - 1)} · ${shape.title}`} grow={1} />
        <Row gap={3} label={`objective ${shape.step} of ${shape.steps}`}>
          {Array.from({ length: Math.max(1, shape.steps) }, (_, i) => <RuneView key={i} width={8} height={8} radius={4} border={{ width: 1, color: WAX }} {...(i < shape.step ? { fill: WAX } : {})} />)}
        </Row>
      </Row>
      <Text textStyle="verb" text={shape.objective} />
      {shape.timer ? <Row>
        <RuneLabel textStyle="number" value={bind(() => orderClock(hud().campaign?.remaining ?? 0))} />
        {shape.timed ? <InkBar value={() => hud().campaign?.remaining ?? 0} max={() => hud().campaign?.duration ?? 1} color={WAX} width={width - 90} label="time left on this order" /> : null}
      </Row> : null}
      {shape.count > 0 ? <Row>
        <RuneLabel textStyle="number" value={bind(() => `${hud().campaign?.counted ?? 0} / ${hud().campaign?.count ?? 0}`)} />
        <InkBar value={() => hud().campaign?.counted ?? 0} max={() => hud().campaign?.count ?? 1} color={VANGUARD_INK} width={width - 90} label="order progress" />
      </Row> : null}
    </> : <>
      <Eyebrow text={shape === null ? "Free skirmish" : `Next order · ${campaignOrdinal(shape.index - 1)}`} />
      <Text textStyle="verb" text={shape === null ? "Raze the Marauder Warcamp" : shape.title} />
    </>}
  </RuneView>;
}

type Tone = "ready" | "active" | "locked";
const CHIP_WORD: Record<string, string> = { gold: "gold", lumber: "lumber", food: "food", mana: "mana", stopwatch: "cooldown" };
interface Tip { title: string; desc: string; chips: { icon: string; text: string }[] }

function costFoot(gold?: number, lumber?: number): string {
  return [gold ? String(gold) : "", lumber ? `·${lumber}` : ""].filter(Boolean).join("");
}
function costChips(gold?: number, lumber?: number): Tip["chips"] {
  return [...(gold ? [{ icon: "gold", text: String(gold) }] : []), ...(lumber ? [{ icon: "lumber", text: String(lumber) }] : [])];
}
export function trainTone(h: HudSnapshot, id: TrainableId): Tone {
  const t = TRAINABLE[id];
  if (h.phase !== "playing") return "locked";
  if (BARRACKS_UNITS.has(id) && !h.hasBarracks) return "locked";
  if ((t.cost.gold ?? 0) > h.gold || (t.cost.lumber ?? 0) > h.lumber) return "locked";
  return h.foodUsed + h.foodReserved + COMBATANTS[id].food <= h.foodCap ? "ready" : "locked";
}
function buildTone(h: HudSnapshot, type: BuildingId): Tone {
  if (h.buildArmed === type) return "active";
  const b = BUILDINGS[type];
  if (h.phase !== "playing") return "locked";
  return (b.cost.gold ?? 0) <= h.gold && (b.cost.lumber ?? 0) <= h.lumber ? "ready" : "locked";
}
function researchTone(h: HudSnapshot, id: UpgradeId): Tone {
  const up = UPGRADES[id], { rank, have, unlocked } = h.research[id];
  if (have > rank) return "active";
  if (h.phase !== "playing" || !unlocked || have >= up.maxRank) return "locked";
  const c = up.cost(rank);
  return (c.gold ?? 0) <= h.gold && (c.lumber ?? 0) <= h.lumber ? "ready" : "locked";
}
/** A doctrine whose rival was chosen reads as closed, not just unaffordable. */
const RIVAL_DOCTRINE: Partial<Record<UpgradeId, UpgradeId>> = { assault: "bulwark", bulwark: "assault" };
function researchFoot(h: HudSnapshot, id: UpgradeId): string {
  const up = UPGRADES[id], { rank, have } = h.research[id];
  if (have >= up.maxRank) return "max";
  if (have > rank) return "…";
  const rival = RIVAL_DOCTRINE[id];
  if (rival !== undefined && h.research[rival].have > 0) return "closed";
  return costFoot(up.cost(rank).gold, up.cost(rank).lumber);
}
const RESEARCH_DESC: Record<UpgradeId, string> = {
  weapons: `+${WEAPON_DMG_PER_RANK} damage to your whole army per rank.`,
  armor: `−${ARMOR_REDUCE_PER_RANK} damage taken by your whole army per rank.`,
  assault: `Doctrine: +${ASSAULT_DMG_PER_RANK} damage per rank, soldiers march ${Math.round(ASSAULT_SLOW_PER_RANK * 100)}% slower per rank. Choosing it closes Bulwark for this battle.`,
  bulwark: `Doctrine: −${BULWARK_GUARD_PER_RANK} damage taken and −${BULWARK_DULL_PER_RANK} damage dealt per rank. Choosing it closes Assault for this battle.`,
};

/** One stone token on the command board: its glyph, carved key, badge and foot, tone bound to the stores. */
function Slot({ icon, hotkey, foot, badge, tone, tip, setTip, command, size }: {
  icon: string | (() => string); hotkey: string; foot?: () => string; badge?: () => string; tone: () => Tone; tip: () => Tip;
  setTip: (tip: Tip | null) => void; command?: { name: string; input?: unknown }; size: number;
}) {
  const show = () => setTip(tip());
  return <RuneAction variant="token" width={size} height={size} label={tip().title} {...(command === undefined ? {} : { command })}
    disabled={bind(() => tone() === "locked")} border={bind(() => (tone() === "active" ? { width: 2, color: GILT } : { width: 1, color: "#1a1612" }))}
    fill={bind(() => (tone() === "active" ? "#5a3a1c" : "#3b3530"))} onHover={(inside) => setTip(inside ? tip() : null)} onFocus={show}>
    <Glyph name={typeof icon === "string" ? icon : icon()} size={Math.round(size * 0.5)} color={bind(() => (tone() === "active" ? "#ffe2a6" : GILT))} />
    <RuneView pin={[4, 2, null, null]}><Text textStyle="token" text={hotkey} /></RuneView>
    {badge === undefined ? null : <RuneView pin={[null, 2, 4, null]}><Text textStyle="token" color="#ffe2a6" text={bind(badge)} /></RuneView>}
    {foot === undefined ? null : <RuneView pin={[0, null, 0, 2]} items="center"><Text textStyle="token" color="#f1dfb8" text={bind(foot)} /></RuneView>}
  </RuneAction>;
}

/** The command board: eighteen stone tokens in a leather case, with a writ above for the one in hand. */
function CommandBoard({ columns, size }: { columns: number; size: number }) {
  // The writ stays mounted and binds to the token in hand, so hovering a token patches leaves instead of resubmitting the tree mid-press.
  const held = useMemo(() => ({ tip: null as Tip | null }), []);
  const setTip = (tip: Tip | null) => { held.tip = tip; };
  const acts: string[] = useHudSlice((h) => h.heroActs.map((a) => a.id));
  const p = { setTip, size };
  const train = (id: TrainableId, key: string, desc: string) => <Slot {...p} icon={id} hotkey={key} command={{ name: `train.${id}` }} tone={() => trainTone(hud(), id)}
    foot={() => (BARRACKS_UNITS.has(id) && !hud().hasBarracks ? "locked" : costFoot(TRAINABLE[id].cost.gold, TRAINABLE[id].cost.lumber))}
    tip={() => ({ title: `Train ${id[0]!.toUpperCase()}${id.slice(1)}`, desc, chips: costChips(TRAINABLE[id].cost.gold, TRAINABLE[id].cost.lumber) })} />;
  const build = (type: BuildingId, icon: string, key: string, title: string, desc: string, extra: Tip["chips"] = []) => <Slot {...p} icon={icon} hotkey={key}
    command={{ name: "build.arm", input: { type } }} tone={() => buildTone(hud(), type)} foot={() => costFoot(BUILDINGS[type].cost.gold, BUILDINGS[type].cost.lumber)}
    tip={() => ({ title, desc, chips: [...costChips(BUILDINGS[type].cost.gold, BUILDINGS[type].cost.lumber), ...extra] })} />;
  const research = (id: UpgradeId, icon: string, key: string) => <Slot {...p} icon={icon} hotkey={key} command={{ name: `research.${id}` }}
    tone={() => researchTone(hud(), id)} foot={() => researchFoot(hud(), id)} badge={() => { const r = hud().research[id].rank; return r > 0 ? String(r) : ""; }}
    tip={() => { const up = UPGRADES[id], rank = hud().research[id].rank, c = up.cost(rank); return { title: `${up.label} — L${rank}/${up.maxRank}`, desc: RESEARCH_DESC[id], chips: costChips(c.gold, c.lumber) }; }} />;
  const act = (id: string) => {
    const view = () => hud().heroActs.find((a) => a.id === id);
    if (!acts.includes(id)) return <Slot {...p} icon="thunder" hotkey="·" foot={() => "—"} tone={() => "locked"} tip={() => ({ title: "Hero act", desc: "Bram's acts appear here once he takes the field.", chips: [] })} />;
    const first = view()!;
    return <Slot {...p} icon={first.icon} hotkey={first.hotkey} command={{ name: "hero.act", input: { act: id } }}
      tone={() => { const a = view(); return a === undefined || !a.owned || !a.ready ? "locked" : "ready"; }}
      foot={() => { const a = view(); return a === undefined || !a.owned ? "—" : a.ready ? "ready" : `${a.remaining}s`; }}
      tip={() => { const a = view() ?? first; return { title: a.owned ? a.label : `${a.label} — not in Bram's kit`, desc: a.owned ? a.blurb : `${a.blurb} Take it at a level-up to add it to the command board.`, chips: a.owned ? [{ icon: "mana", text: String(a.manaCost) }, { icon: "stopwatch", text: `${a.cooldownSeconds}s` }] : [] }; }} />;
  };
  const playing = () => hud().phase === "playing";
  return <RuneView gap={6} items="end">
    <RuneView variant="note" width={columns * (size + 4) + 14} gap={4} role="tooltip" hidden={bind(() => held.tip === null)}>
      <Text textStyle="verb" text={bind(() => held.tip?.title ?? "")} />
      <Small text={bind(() => held.tip?.desc ?? "")} />
      <Text textStyle="number" color={OCHRE} text={bind(() => (held.tip?.chips ?? []).map((c) => `${c.text} ${CHIP_WORD[c.icon] ?? c.icon}`).join("  ·  "))} />
    </RuneView>
    <RuneView variant="leather" layout="grid" columns={columns} gap={4}>
      {train("peasant", "1", "Worker — mines gold, cuts lumber, and raises buildings.")}
      {train("footman", "2", "Frontline screen. Deals 50% more damage to armored Reavers; holds raiders away from rifles. Requires a Barracks.")}
      {train("rifleman", "3", "Full firepower beyond 3m; weak at close range and against armored Reavers. Strong against the warcamp. Requires a Barracks.")}
      <Slot {...p} icon="attackMove" hotkey="R" command={{ name: "unit.attackMove" }} tone={() => (!playing() ? "locked" : hud().attackMoveArmed ? "active" : "ready")}
        tip={() => ({ title: "Attack-Move", desc: "Arm, then right-click a destination — the group fights anything it meets on the way.", chips: [] })} />
      {build("barracks", "barracks", "B", "Build Barracks", "Unlocks Footman & Rifleman and enables research.")}
      {build("farm", "farm", "G", "Build Farm", `Raises your food (supply) cap by ${BUILDINGS.farm.supply}.`, [{ icon: "food", text: `+${BUILDINGS.farm.supply}` }])}
      {build("guard_tower", "tower", "T", "Build Guard Tower", "Auto-fires on Marauders that stray into range.")}
      <Slot {...p} icon="rally" hotkey="F" command={{ name: "unit.rally" }} tone={() => (!playing() ? "locked" : hud().rallyArmed ? "active" : "ready")}
        tip={() => ({ title: "Rally Point", desc: "Arm, then right-click where new recruits should gather.", chips: [] })} />
      {research("weapons", "weapons", "Z")}
      {research("armor", "armor", "X")}
      {act("thunderclap")}
      <Slot {...p} icon="hold" hotkey="V" command={{ name: "unit.hold" }} tone={() => (playing() ? "ready" : "locked")}
        tip={() => ({ title: "Hold Army", desc: "All combat troops stop and attack only enemies within weapon reach. Workers keep harvesting.", chips: [] })} />
      {act("banner")}
      {act("volley")}
      {act("ward")}
      <Slot {...p} icon="medal" hotkey="·" foot={() => "kit"} badge={() => (hud().heroKit.length > 0 ? String(hud().heroKit.length) : "")}
        tone={() => (hud().heroKit.length > 0 ? "active" : "locked")}
        tip={() => { const kit = hud().heroKit; return kit.length === 0
          ? { title: "Field kit", desc: "Bram's kit is empty. Every level-up offers two picks: an act for the command board or an item he carries.", chips: [] }
          : { title: `Field kit — ${kit.length} pick${kit.length === 1 ? "" : "s"}`, desc: kit.map((k) => `${k.label}: ${k.blurb}`).join("  ·  "), chips: [] }; }} />
      {research("assault", "attackMove", "N")}
      {research("bulwark", "shield", "M")}
    </RuneView>
  </RuneView>;
}

/** Bram's card: a medallion with his level, ink bars for health, mana and experience, and his stat line. */
function HeroCard({ ctx, width }: { ctx: GameContext; width: number }) {
  const barWidth = Math.max(60, width - 24 - 58 - 64);
  const stat = (id: string) => ctx.scene.entity.stats.get("hero", id);
  const alive = () => (stat("health")?.current ?? 0) > 0;
  const rankOf = (id: UpgradeId) => hud().research[id].rank;
  const dmg = () => foldStatContributions(COMBATANTS.hero.damage + (hud().heroLevel - 1) * HERO_DMG_PER_LEVEL, rankContributions(rankOf, "dealt"));
  const armor = () => -foldStatContributions(0, rankContributions(rankOf, "taken"));
  const pace = () => Math.round(foldStatContributions(COMBATANTS.hero.walkSpeed, rankContributions(rankOf, "speed")) * 10) / 10;
  const bar = (id: string, color: string, label: string, floor: (n: number) => number) => <Row gap={6}>
    <InkBar value={() => stat(id)?.current ?? 0} max={() => stat(id)?.max ?? 1} color={color} width={barWidth} label={label} />
    <Small minWidth={52} text={bind(() => { const s = stat(id); return s === null ? "—" : `${floor(s.current)}/${s.max}`; })} />
  </Row>;
  return <Row gap={10} items="start">
    <RuneView width={48} height={48} radius={24} fill={bind(() => (alive() ? "#8e1f17" : "#4b3b30"))} border={{ width: 2, color: "#3a0b06" }} items="center" justify="center">
      <Glyph name="helm" size={26} color="#ffd9c8" hidden={bind(() => !alive())} />
      <Glyph name="skull" size={26} color="#d8c9b8" hidden={bind(alive)} />
      <RuneView pin={[null, null, -2, -2]} width={20} height={20} radius={10} fill="#efe3c6" border={{ width: 1, color: "#2b1d10" }} items="center" justify="center">
        <Text textStyle="small" color="#2b1d10" text={bind(() => String(hud().heroLevel))} />
      </RuneView>
    </RuneView>
    <RuneView gap={3} grow={1}>
      <Text textStyle="verb" text="Bram the Bold" />
      {bar("health", MOSS, "Bram's health", Math.ceil)}
      {bar("mana", VANGUARD_INK, "Bram's mana", Math.floor)}
      <InkBar value={() => stat("xp")?.current ?? 0} max={() => stat("xp")?.max ?? 1} color={OCHRE} height={4} width={barWidth + 64} label="Bram's experience" />
      <Row gap={12}>
        <Row gap={3}><Glyph name="weapons" size={14} color="#5e4630" /><Small text={bind(() => String(dmg()))} label="damage" /></Row>
        <Row gap={3}><Glyph name="shield" size={14} color="#5e4630" /><Small text={bind(() => String(armor()))} label="armor" /></Row>
        <Row gap={3}><Glyph name="boots" size={14} color="#5e4630" /><Small text={bind(() => String(pace()))} label="walk speed" /></Row>
      </Row>
    </RuneView>
  </Row>;
}

/** Every fielded fighting unit as a stone token with a health rule under it; whole tokens per page. */
function ArmyRow({ rowWidth }: { rowWidth: number }) {
  const troops = useHudSlice((h) => h.army.filter((u) => !isWorker(u)).map((u) => ({ id: u.id, kind: u.kind })));
  const [requested, setRequested] = useState(0);
  if (troops.length === 0) return <Small text="No troops afield — train Footmen (2)" />;
  const fit = rosterFit(troops.length, rowWidth);
  const view = rosterPage(troops.length, fit.pageSize, requested);
  const ratio = (id: string) => { const u = hud().army.find((a) => a.id === id); return u === undefined || u.max <= 0 ? 0 : Math.max(0, Math.min(1, u.hp / u.max)); };
  const wedge = (label: string, glyph: string, enabled: boolean, page: number) => <RuneAction width={ROSTER_METRICS.arrow} height={ROSTER_METRICS.crest} label={label}
    disabled={!enabled} run={() => setRequested(page)} fill="#4a2c19" radius={3} items="center" justify="center"><Text textStyle="gilt" text={glyph} /></RuneAction>;
  return <Row gap={ROSTER_METRICS.gap} label="army units">
    {fit.paged ? wedge("Show earlier army units", "‹", view.hasPrev, view.page - 1) : null}
    {troops.slice(view.start, view.end).map((u) => <RuneView key={u.id} width={ROSTER_METRICS.crest} gap={2} label={`${u.kind} unit`} role="listitem"
      tooltip={u.kind}>
      <RuneView width={ROSTER_METRICS.crest} height={ROSTER_METRICS.crest - 6} radius={(ROSTER_METRICS.crest - 6) / 2} fill="#3b3530" items="center" justify="center"
        border={bind(() => ({ width: 2, color: ratio(u.id) < 0.35 ? WAX : "#1a1612" }))}>
        <Glyph name={UNIT_ICON[u.kind] ?? "footman"} size={18} />
      </RuneView>
      <InkBar value={() => ratio(u.id)} max={() => 1} color={MOSS} height={4} width={ROSTER_METRICS.crest} label={`${u.kind} health`} />
    </RuneView>)}
    {fit.paged ? wedge("Show later army units", "›", view.hasNext, view.page + 1) : null}
  </Row>;
}

function HeroPanel({ ctx, width }: { ctx: GameContext; width: number }) {
  const inner = width - 24;
  return <RuneView variant="note" width={width} gap={6}>
    <HeroCard ctx={ctx} width={width} />
    <Row justify="between">
      <Small text={bind(() => `Afield · ${hud().army.filter((u) => !isWorker(u)).length}`)} />
      <Row gap={4} label="workers"><Glyph name="peasant" size={14} color="#5e4630" /><Small text={bind(() => String(hud().army.filter(isWorker).length))} /></Row>
      <RuneAction command={{ name: "unit.selectArmy" }} label="Select the whole army" disabled={bind(() => hud().army.length === 0 || hud().phase !== "playing")}
        layout="row" gap={6} padding={[3, 8, 3, 8]} border={{ width: 1, color: "#2b1d10" }} radius={2} hover="#2b1d1014" items="center">
        <Text text="Take all" /><Text textStyle="small" text="H" />
      </RuneAction>
    </Row>
    <ArmyRow rowWidth={inner} />
    <RuneView gap={3} hidden={bind(() => { const h = hud(); return h.producing + h.building + h.researching === 0; })}>
      <Small text={bind(() => { const h = hud(); return [h.producing > 0 ? `Training ×${h.producing}` : "", h.building > 0 ? `Building ×${h.building}` : "", h.researching > 0 ? `Research ×${h.researching}` : ""].filter(Boolean).join("  ·  "); })} />
      <RuneView hidden={bind(() => hud().producing === 0)}><InkBar value={() => hud().trainProgress} max={() => 1} color={OCHRE} height={4} width={inner} label="training progress" /></RuneView>
    </RuneView>
  </RuneView>;
}

/** Formation tabs under the map: the active shape carries the wax. */
function FormationTabs() {
  const formation = useHudSlice((h) => h.formation);
  return <Row gap={4}>{FORMATIONS.map((option) => <RuneAction key={option.id} command={{ name: "unit.formation", input: { kind: option.id } }} label={`${option.label} formation`}
    tooltip={`${option.label} (${option.hotkey}) — ${option.blurb}`} grow={1} padding={[4, 6, 4, 6]} radius={2} items="center"
    fill={formation === option.id ? WAX : "#3b2614"} border={{ width: 1, color: formation === option.id ? GILT : "#2a170b" }} hover="#ffffff1a">
    <Text textStyle="token" text={`${option.hotkey} ${option.label}`} />
  </RuneAction>)}</Row>;
}

function MapPanel({ ctx }: { ctx: GameContext }) {
  return <RuneView variant="wood" width={MAP_SIZE + 18}>
    <RuneView>
      <TacticalMinimap ctx={ctx} />
      <RuneView pin={[null, 4, 6, null]}><Text textStyle="eyebrow" text="N" /></RuneView>
    </RuneView>
    <FormationTabs />
  </RuneView>;
}

/** The level-up writ: two picks, an act for the command board or an item Bram carries. */
function LevelUpWrit({ width }: { width: number }) {
  const offer = useHudSlice((h) => (h.heroOffer !== null && h.phase === "playing" ? h.heroOffer : null));
  if (offer === null) return null;
  return <RuneView anchor="center" variant="sheet" width={width} gap={10} label="Level-up writ">
    <Row justify="between"><Eyebrow text={`Bram reaches level ${offer.level}`} /><Small text="Choose one" /></Row>
    {offer.options.map((option, index) => {
      const disabled = !option.allocatable || option.taken;
      return <RuneAction key={option.id} command={{ name: "hero.pick", input: { id: option.id } }} disabled={disabled} label={`${option.label} — ${option.kind === "active" ? "act" : "item"}`}
        layout="row" gap={10} padding={8} border={{ width: 1, color: "#5e463088" }} radius={2} hover="#8e1f171a" items="start">
        <RuneView variant="token" width={46} height={46}><Glyph name={option.icon} size={24} /><RuneView pin={[4, 2, null, null]}><Text textStyle="token" text={String(index + 7)} /></RuneView></RuneView>
        <RuneView gap={2} grow={1} shrink>
          <Text textStyle="verb" text={option.label} />
          <Small text={option.taken ? "In the kit" : option.kind === "active" ? "Act" : "Item"} />
          <Text text={option.blurb} />
        </RuneView>
      </RuneAction>;
    })}
    <Small text="Picks are kept with the campaign: Bram carries them into the next mission." />
  </RuneView>;
}

function ModeBanner() {
  const mode = useHudSlice((h) => ({ rally: h.rallyArmed, attack: h.attackMoveArmed, build: h.buildArmed }));
  const lines = [
    ...(mode.rally || mode.attack ? [`${mode.rally ? "Rally point" : "Attack-move"} · Right-click a destination · Esc to cancel`] : []),
    ...(mode.build !== null ? [`Right-click your side of the field to place the ${BUILD_LABELS[mode.build] ?? "building"}`] : []),
  ];
  if (lines.length === 0) return null;
  return <RuneView anchor="top" inset={110} gap={6} items="center">{lines.map((line) => <RuneView key={line} variant="note" padding={[6, 16, 6, 16]}><Text text={line} align="center" /></RuneView>)}</RuneView>;
}

/**
 * The war table's HUD: the ledger and pinned orders along the top, the survey map, Bram's card and the
 * command board along the bottom, and the wax seal top right. Order reports and refusals come from
 * the engine notice feed, drawn by GameUI.
 */
export function RtsHud({ ctx, width, height, pause, mapOpen, toggleMap }: { ctx: GameContext; width: number; height: number; pause: ReactNode; mapOpen: boolean; toggleMap: () => void }): ReactNode {
  const phone = width < 700;
  if (phone) {
    const board = Math.floor((width - 16 - 18 - 5 * 4) / 6);
    return <>
      <RuneView anchor="top-left" safe inset={8} width={width - 16 - 66} gap={6}>
        <Ledger phone />
        <OrdersNote width={width - 16 - 66} />
        <RuneAction run={toggleMap} label={mapOpen ? "Hide map" : "Show map"} variant="plank" minHeight={30} padding={[4, 12, 4, 12]} width={110}>
          <Text textStyle="gilt" text={mapOpen ? "Hide map" : "Map"} />
        </RuneAction>
        {mapOpen ? <MapPanel ctx={ctx} /> : null}
      </RuneView>
      <RuneView anchor="top-right" safe inset={8}>{pause}</RuneView>
      <ModeBanner />
      <RuneView anchor="bottom" safe inset={8} gap={6} items="center">
        <HeroPanel ctx={ctx} width={width - 16} />
        <CommandBoard columns={6} size={Math.min(52, board)} />
      </RuneView>
      <LevelUpWrit width={Math.min(420, width - 24)} />
    </>;
  }
  const heroWidth = Math.min(420, width - (MAP_SIZE + 18) - (4 * 56 + 18) - 72);
  return <>
    <RuneView anchor="top-left" safe inset={12} gap={8} items="start">
      <Ledger phone={false} />
      <OrdersNote width={330} />
    </RuneView>
    <RuneView anchor="top-right" safe inset={12}>{pause}</RuneView>
    <ModeBanner />
    <RuneView anchor="bottom-left" safe inset={12}><MapPanel ctx={ctx} /></RuneView>
    <RuneView anchor="bottom" safe inset={12}><HeroPanel ctx={ctx} width={heroWidth} /></RuneView>
    <RuneView anchor="bottom-right" safe inset={12}><CommandBoard columns={4} size={52} /></RuneView>
    <LevelUpWrit width={460} />
  </>;
}

