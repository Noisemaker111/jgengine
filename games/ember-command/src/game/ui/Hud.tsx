/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneFor, RuneLabel, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { foldStatContributions } from "@jgengine/core/progression/statGraph";

import { hudStore, type ArmyUnit, type HudSnapshot } from "../hudStore";
import { campaignOrdinal } from "../campaign";
import { activeMap } from "../../maps";
import { BUILDINGS, COMBATANTS, missingChamber, TRAINABLE, type BuildingId, type TrainableId } from "../catalog";
import { TRAIL_PAINT_COST } from "../tuning";
import { FORMATIONS } from "../formations";
import {
  ARMOR_REDUCE_PER_RANK, ASSAULT_DMG_PER_RANK, ASSAULT_SLOW_PER_RANK, BULWARK_DULL_PER_RANK, BULWARK_GUARD_PER_RANK,
  rankContributions, UPGRADES, WEAPON_DMG_PER_RANK, type UpgradeId,
} from "../upgrades";
import { HERO_DMG_PER_LEVEL } from "../hero";
import { Eyebrow, Glyph, hud, InkBar, Row, Small, Text, useHudSlice } from "./kit";
import { MAP_SIZE, TacticalMinimap } from "./Minimap";
import { ROSTER_METRICS, rosterFit, rosterPage } from "./rosterPage";
import { GILT, RIVAL_INK, MOSS, OCHRE, RED_INK, WAX } from "./theme";

const BUILD_LABELS: Record<string, string> = { barracks: "Barracks Chamber", fungus_garden: "Fungus Garden", acid_mound: "Acid Mound", nursery: "Nursery Chamber", granary: "Granary Chamber" };
const UNIT_ICON: Record<string, string> = { soldier: "soldier", spitter: "spitter", worker: "worker", scout: "scout", beetle: "beetle" };
const isWorker = (unit: ArmyUnit) => unit.kind === "worker";

/** Mission clock as the field journal writes it: whole minutes and seconds. */
export function orderClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** One entry on the ledger strip: a glyph and its bound count. */
function LedgerEntry({ icon, value, warn, label }: { icon: string; value: () => string; warn?: () => boolean; label: string }) {
  return <Row gap={5} label={label}>
    <Glyph name={icon} size={18} color={OCHRE} />
    <RuneLabel textStyle="number" value={bind(value)} {...(warn === undefined ? {} : { color: bind(() => (warn() ? WAX : "#1f2a12")) })} />
  </Row>;
}
function KeepGauge({ name, hp, max, color, warn, phoneGauge }: { phoneGauge: boolean; name: string; hp: () => number; max: () => number; color: string; warn?: () => boolean }) {
  return <RuneView gap={3} minWidth={phoneGauge ? 88 : 132}>
    <Row gap={5}><Small text={name} /><RuneLabel textStyle="number" value={bind(() => String(hp()))} {...(warn === undefined ? {} : { color: bind(() => (warn() ? WAX : "#1f2a12")) })} /></Row>
    <InkBar value={hp} max={max} color={color} width={phoneGauge ? 80 : 120} label={`${name} health`} />
  </RuneView>;
}

/** The pantry strip: stores, both nests' health and the black-ant raid clock, each bound at its leaf. */
function Ledger({ phone }: { phone: boolean }) {
  const food = () => { const h = hud(); return `${h.foodUsed}${h.foodReserved ? `+${h.foodReserved}` : ""}/${h.foodCap}`; };
  return <RuneView variant="note" layout={phone ? "grid" : "row"} {...(phone ? { columns: 3 } : {})} gap={phone ? 8 : 16} items="center" label="Pantry">
    <LedgerEntry icon="sugar" value={() => String(hud().sugar)} label="sugar" />
    <LedgerEntry icon="leaf" value={() => String(hud().leaf)} label="leaf" />
    <LedgerEntry icon="food" value={food} warn={() => { const h = hud(); return h.foodUsed + h.foodReserved >= h.foodCap; }} label="brood room" />
    <KeepGauge phoneGauge={phone} name="Black nest" hp={() => hud().enemyKeepHp} max={() => hud().enemyKeepMax} color={RIVAL_INK} />
    <KeepGauge phoneGauge={phone} name="Red nest" hp={() => hud().playerKeepHp} max={() => hud().playerKeepMax} color={RED_INK}
      warn={() => { const h = hud(); return h.playerKeepMax > 0 && h.playerKeepHp / h.playerKeepMax < 0.4; }} />
    <Row gap={5} tooltip="Black-ant raids: the wave count and the seconds until the next one marches">
      <Glyph name="skull" size={18} color={bind(() => (hud().nextWaveIn <= 10 ? WAX : "#4c5a2c"))} />
      <RuneView gap={0}>
        <Small text={bind(() => `Raid ${hud().wavesSent}`)} />
        <RuneLabel textStyle="number" value={bind(() => `${hud().nextWaveIn}s`)} color={bind(() => (hud().nextWaveIn <= 10 ? WAX : "#1f2a12"))} />
      </RuneView>
    </Row>
  </RuneView>;
}

/** The orders note: the campaign's live order with its step marks, clock and count, or the skirmish's aim. */
function OrdersNote({ width }: { width: number }) {
  const shape = useHudSlice((h) => {
    const c = h.campaign;
    return c === null ? null : { phase: c.phase, index: c.index, title: c.title, objective: c.objective, step: c.step, steps: c.steps, timer: c.remaining !== null, timed: c.duration !== null && c.duration > 0, count: c.count, away: c.map !== activeMap() ? c.mapLabel : null };
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
        <InkBar value={() => hud().campaign?.counted ?? 0} max={() => hud().campaign?.count ?? 1} color={RED_INK} width={width - 90} label="order progress" />
      </Row> : null}
    </> : <>
      <Eyebrow text={shape === null ? "Free skirmish" : shape.away !== null ? `Next order · ${campaignOrdinal(shape.index - 1)} · on ${shape.away}` : `Next order · ${campaignOrdinal(shape.index - 1)}`} />
      <Text textStyle="verb" text={shape === null ? "Dig out the Black Ant Nest" : shape.title} />
    </>}
  </RuneView>;
}

/** The yard strip: what the sprinkler, the mower, the sky and the kid are doing right now. */
function YardStrip({ width }: { width: number }) {
  const hz = useHudSlice((h) => h.hazards);
  const items: { text: string; warn: boolean }[] = [];
  if (hz.sprinkler !== "none") items.push({ text: hz.sprinkler === "on" ? "Sprinkler spraying" : hz.sprinkler === "warming" ? "Sprinkler hissing: about to spray!" : "Sprinkler idle", warn: hz.sprinkler !== "off" });
  if (hz.mower !== "none") items.push({ text: hz.mower === "crossing" ? "MOWER CROSSING" : hz.mower === "warning" ? `Mower in ${hz.mowerIn ?? 0}s — clear the lane!` : `Mower in ${hz.mowerIn ?? 0}s`, warn: hz.mower !== "idle" });
  if (hz.rain) items.push({ text: "Rain: slow going, scent washing", warn: true });
  if (hz.night) items.push({ text: "Night: antennae short", warn: false });
  if (hz.heat !== "none") items.push({ text: hz.heat === "baking" ? "Driveway baking: keep to the cracks and the car's shade" : "Night: the pavement has cooled", warn: hz.heat === "baking" });
  if (hz.beam !== "none") items.push({ text: hz.beam === "focused" ? "BEAM FOCUSED — find shade" : "Beam blurred", warn: hz.beam === "focused" });
  if (items.length === 0) return null;
  return <RuneView variant="note" width={width} gap={2} label="Yard">
    <Eyebrow text="The yard" />
    {items.map((item) => <Text key={item.text} textStyle="small" color={item.warn ? WAX : "#1f2a12"} text={item.text} />)}
  </RuneView>;
}

/** Nightfall dims the lawn: a deep-blue wash whose strength follows the darkness clock. */
function NightWash() {
  const dark = useHudSlice((h) => h.hazards.dark);
  if (dark <= 0) return null;
  return <RuneView anchor="fill" fill={`#0a1430${Math.round(dark * 0.55 * 255).toString(16).padStart(2, "0")}`} label="night" />;
}

type Tone = "ready" | "active" | "locked";
const CHIP_WORD: Record<string, string> = { sugar: "sugar", leaf: "leaf", food: "brood room", mana: "fury", stopwatch: "cooldown" };
interface Tip { title: string; desc: string; chips: { icon: string; text: string }[] }

function costFoot(sugar?: number, leaf?: number): string {
  return [sugar ? String(sugar) : "", leaf ? `·${leaf}` : ""].filter(Boolean).join("");
}
function costChips(sugar?: number, leaf?: number): Tip["chips"] {
  return [...(sugar ? [{ icon: "sugar", text: String(sugar) }] : []), ...(leaf ? [{ icon: "leaf", text: String(leaf) }] : [])];
}
/** The chambers the hatch gates read, from the HUD snapshot. */
function standingOf(h: HudSnapshot): Set<string> {
  const standing = new Set<string>();
  if (h.hasBarracks) standing.add("barracks");
  if (h.hasNursery) standing.add("nursery");
  return standing;
}

export function trainTone(h: HudSnapshot, id: TrainableId): Tone {
  const t = TRAINABLE[id];
  if (h.phase !== "playing") return "locked";
  if (missingChamber(id, standingOf(h)) !== null) return "locked";
  if ((t.cost.sugar ?? 0) > h.sugar || (t.cost.leaf ?? 0) > h.leaf) return "locked";
  return h.foodUsed + h.foodReserved + COMBATANTS[id].food <= h.foodCap ? "ready" : "locked";
}
function buildTone(h: HudSnapshot, type: BuildingId): Tone {
  if (h.buildArmed === type) return "active";
  const b = BUILDINGS[type];
  if (h.phase !== "playing") return "locked";
  return (b.cost.sugar ?? 0) <= h.sugar && (b.cost.leaf ?? 0) <= h.leaf ? "ready" : "locked";
}
function researchTone(h: HudSnapshot, id: UpgradeId): Tone {
  const up = UPGRADES[id], { rank, have, unlocked } = h.research[id];
  if (have > rank) return "active";
  if (h.phase !== "playing" || !unlocked || have >= up.maxRank) return "locked";
  const c = up.cost(rank);
  return (c.sugar ?? 0) <= h.sugar && (c.leaf ?? 0) <= h.leaf ? "ready" : "locked";
}
/** A doctrine whose rival was chosen reads as closed, not just unaffordable. */
const RIVAL_DOCTRINE: Partial<Record<UpgradeId, UpgradeId>> = { assault: "bulwark", bulwark: "assault" };
function researchFoot(h: HudSnapshot, id: UpgradeId): string {
  const up = UPGRADES[id], { rank, have } = h.research[id];
  if (have >= up.maxRank) return "max";
  if (have > rank) return "…";
  const rival = RIVAL_DOCTRINE[id];
  if (rival !== undefined && h.research[rival].have > 0) return "closed";
  return costFoot(up.cost(rank).sugar, up.cost(rank).leaf);
}
const RESEARCH_DESC: Record<UpgradeId, string> = {
  weapons: `+${WEAPON_DMG_PER_RANK} bite damage for the whole colony per rank.`,
  armor: `−${ARMOR_REDUCE_PER_RANK} damage taken by the whole colony per rank.`,
  assault: `Swarm instinct: +${ASSAULT_DMG_PER_RANK} damage per rank, ants march ${Math.round(ASSAULT_SLOW_PER_RANK * 100)}% slower per rank. Choosing it closes Turtle for this battle.`,
  bulwark: `Turtle instinct: −${BULWARK_GUARD_PER_RANK} damage taken and −${BULWARK_DULL_PER_RANK} damage dealt per rank. Choosing it closes Swarm for this battle.`,
};

/** One moss token on the command board: its glyph, key, badge and foot, tone bound to the stores. */
function Slot({ icon, hotkey, foot, badge, tone, tip, setTip, command, size }: {
  icon: string | (() => string); hotkey: string; foot?: () => string; badge?: () => string; tone: () => Tone; tip: () => Tip;
  setTip: (tip: Tip | null) => void; command?: { name: string; input?: unknown }; size: number;
}) {
  const show = () => setTip(tip());
  return <RuneAction variant="token" width={size} height={size} label={tip().title} {...(command === undefined ? {} : { command })}
    disabled={bind(() => tone() === "locked")} border={bind(() => (tone() === "active" ? { width: 2, color: GILT } : { width: 1, color: "#16290c" }))}
    fill={bind(() => (tone() === "active" ? "#7a5a10" : "#2b4a1a"))} onHover={(inside) => setTip(inside ? tip() : null)} onFocus={show}>
    <Glyph name={typeof icon === "string" ? icon : icon()} size={Math.round(size * 0.5)} color={bind(() => (tone() === "active" ? "#ffe2a6" : GILT))} />
    <RuneView pin={[4, 2, null, null]}><Text textStyle="token" text={hotkey} /></RuneView>
    {badge === undefined ? null : <RuneView pin={[null, 2, 4, null]}><Text textStyle="token" color="#ffe2a6" text={bind(badge)} /></RuneView>}
    {foot === undefined ? null : <RuneView pin={[0, null, 0, 2]} items="center"><Text textStyle="token" color="#fff4c8" text={bind(foot)} /></RuneView>}
  </RuneAction>;
}

/** The command board: the colony's verbs as moss tokens on a leaf, with a note above for the one in hand. */
function CommandBoard({ columns, size }: { columns: number; size: number }) {
  // The writ stays mounted and binds to the token in hand, so hovering a token patches leaves instead of resubmitting the tree mid-press.
  const held = useMemo(() => ({ tip: null as Tip | null }), []);
  const setTip = (tip: Tip | null) => { held.tip = tip; };
  const acts: string[] = useHudSlice((h) => h.heroActs.map((a) => a.id));
  const p = { setTip, size };
  const train = (id: TrainableId, key: string, desc: string) => <Slot {...p} icon={id} hotkey={key} command={{ name: `train.${id}` }} tone={() => trainTone(hud(), id)}
    foot={() => (missingChamber(id, standingOf(hud())) !== null ? "locked" : costFoot(TRAINABLE[id].cost.sugar, TRAINABLE[id].cost.leaf))}
    tip={() => ({ title: `Hatch ${COMBATANTS[id].label}`, desc, chips: costChips(TRAINABLE[id].cost.sugar, TRAINABLE[id].cost.leaf) })} />;
  const build = (type: BuildingId, icon: string, key: string, title: string, desc: string, extra: Tip["chips"] = []) => <Slot {...p} icon={icon} hotkey={key}
    command={{ name: "build.arm", input: { type } }} tone={() => buildTone(hud(), type)} foot={() => costFoot(BUILDINGS[type].cost.sugar, BUILDINGS[type].cost.leaf)}
    tip={() => ({ title, desc, chips: [...costChips(BUILDINGS[type].cost.sugar, BUILDINGS[type].cost.leaf), ...extra] })} />;
  const research = (id: UpgradeId, icon: string, key: string) => <Slot {...p} icon={icon} hotkey={key} command={{ name: `research.${id}` }}
    tone={() => researchTone(hud(), id)} foot={() => researchFoot(hud(), id)} badge={() => { const r = hud().research[id].rank; return r > 0 ? String(r) : ""; }}
    tip={() => { const up = UPGRADES[id], rank = hud().research[id].rank, c = up.cost(rank); return { title: `${up.label} — L${rank}/${up.maxRank}`, desc: RESEARCH_DESC[id], chips: costChips(c.sugar, c.leaf) }; }} />;
  const act = (id: string) => {
    const view = () => hud().heroActs.find((a) => a.id === id);
    if (!acts.includes(id)) return <Slot {...p} icon="thunder" hotkey="·" foot={() => "—"} tone={() => "locked"} tip={() => ({ title: "Marshal's act", desc: "The Marshal's acts appear here once he takes the field.", chips: [] })} />;
    const first = view()!;
    return <Slot {...p} icon={first.icon} hotkey={first.hotkey} command={{ name: "hero.act", input: { act: id } }}
      tone={() => { const a = view(); return a === undefined || !a.owned || !a.ready ? "locked" : "ready"; }}
      foot={() => { const a = view(); return a === undefined || !a.owned ? "—" : a.ready ? "ready" : `${a.remaining}s`; }}
      tip={() => { const a = view() ?? first; return { title: a.owned ? a.label : `${a.label} — not in the Marshal's kit`, desc: a.owned ? a.blurb : `${a.blurb} Take it at a level-up to add it to the command board.`, chips: a.owned ? [{ icon: "mana", text: String(a.manaCost) }, { icon: "stopwatch", text: `${a.cooldownSeconds}s` }] : [] }; }} />;
  };
  const playing = () => hud().phase === "playing";
  return <RuneView gap={6} items="end">
    <RuneView variant="note" width={columns * (size + 4) + 14} gap={4} role="tooltip" hidden={bind(() => held.tip === null)}>
      <Text textStyle="verb" text={bind(() => held.tip?.title ?? "")} />
      <Small text={bind(() => held.tip?.desc ?? "")} />
      <Text textStyle="number" color={OCHRE} text={bind(() => (held.tip?.chips ?? []).map((c) => `${c.text} ${CHIP_WORD[c.icon] ?? c.icon}`).join("  ·  "))} />
    </RuneView>
    <RuneView variant="leather" layout="grid" columns={columns} gap={4}>
      {train("worker", "1", "Forages crumbs, sugar and leaf pulp, lays scent on the way home, and digs chambers.")}
      {train("soldier", "2", "Big-jawed front line. Bites black majors 50% harder; screens spitters from raiders. Needs a Barracks Chamber.")}
      {train("spitter", "3", "Acid at range: full damage past 3 m, weak up close and against armoured majors, strong against nests; acid slows what it hits. Needs a Barracks Chamber.")}
      {train("scout", "9", "Fast and fragile, with antennae that sense twice as far. Black ants it senses carry marking scent and stay on your map for 10 s.")}
      {train("beetle", "0", "A tamed rhinoceros beetle: slow, huge, and it tears chambers apart. Needs a Barracks and a Nursery Chamber.")}
      <Slot {...p} icon="attackMove" hotkey="R" command={{ name: "unit.attackMove" }} tone={() => (!playing() ? "locked" : hud().attackMoveArmed ? "active" : "ready")}
        tip={() => ({ title: "Attack-Move", desc: "Arm, then right-click a destination: the column bites anything it meets on the way.", chips: [] })} />
      <Slot {...p} icon="trail" hotkey="P" command={{ name: "unit.trail" }} tone={() => (!playing() ? "locked" : hud().trailArmed ? "active" : hud().sugar >= TRAIL_PAINT_COST ? "ready" : "locked")}
        foot={() => String(TRAIL_PAINT_COST)}
        tip={() => ({ title: "Pheromone Line", desc: "Arm, then right-click: lays a scent trail from the selected ants (or the nest) to that point. Red ants run up to 40% faster on scent and forage quicker at a scented node. Rain and the sprinkler wash it away.", chips: costChips(TRAIL_PAINT_COST) })} />
      {build("barracks", "barracks", "B", "Dig Barracks Chamber", "Hatches Soldiers, Spitters and Beetles, unlocks instincts and takes food drop-offs. Every Barracks adds a brood lane: one more egg hatching at once.")}
      {build("fungus_garden", "fungus_garden", "G", "Dig Fungus Garden", `Feeds the brood: raises your brood room (supply) by ${BUILDINGS.fungus_garden.supply}.`, [{ icon: "food", text: `+${BUILDINGS.fungus_garden.supply}` }])}
      {build("nursery", "nursery", "U", "Dig Nursery Chamber", "Warms the brood: unlocks the Tank Beetle and every egg hatches 25% faster.")}
      {build("granary", "granary", "Y", "Dig Granary Chamber", "A forward food store: workers drop their loads here (dig it near the popsicle), and it ferments +1 sugar a second.")}
      {build("acid_mound", "tower", "T", "Dig Acid Mound", "A spitting turret that soaks black ants who stray into range.")}
      <Slot {...p} icon="rally" hotkey="F" command={{ name: "unit.rally" }} tone={() => (!playing() ? "locked" : hud().rallyArmed ? "active" : "ready")}
        tip={() => ({ title: "Rally Scent", desc: "Arm, then right-click where new hatchlings should gather.", chips: [] })} />
      <Slot {...p} icon="hold" hotkey="V" command={{ name: "unit.hold" }} tone={() => (playing() ? "ready" : "locked")}
        tip={() => ({ title: "Hold", desc: "Every fighting ant stops and bites only what comes within reach. Workers keep foraging.", chips: [] })} />
      {research("weapons", "weapons", "Z")}
      {research("armor", "armor", "X")}
      {act("thunderclap")}
      {act("banner")}
      {act("volley")}
      {act("ward")}
      <Slot {...p} icon="medal" hotkey="·" foot={() => "kit"} badge={() => (hud().heroKit.length > 0 ? String(hud().heroKit.length) : "")}
        tone={() => (hud().heroKit.length > 0 ? "active" : "locked")}
        tip={() => { const kit = hud().heroKit; return kit.length === 0
          ? { title: "Marshal's kit", desc: "The Marshal's kit is empty. Every level-up offers two picks: an act for the command board or a trait he carries.", chips: [] }
          : { title: `Marshal's kit — ${kit.length} pick${kit.length === 1 ? "" : "s"}`, desc: kit.map((k) => `${k.label}: ${k.blurb}`).join("  ·  "), chips: [] }; }} />
      {research("assault", "attackMove", "N")}
      {research("bulwark", "shield", "M")}
    </RuneView>
  </RuneView>;
}

/** The Marshal's card: a medallion with his level, bars for health, fury and experience, and his stat line. */
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
    <RuneView width={48} height={48} radius={24} fill={bind(() => (alive() ? "#d9361f" : "#4a4a3a"))} border={{ width: 2, color: "#6a120a" }} items="center" justify="center">
      <Glyph name="helm" size={26} color="#ffd9c8" hidden={bind(() => !alive())} />
      <Glyph name="skull" size={26} color="#d8c9b8" hidden={bind(alive)} />
      <RuneView pin={[null, null, -2, -2]} width={20} height={20} radius={10} fill="#fff6d6" border={{ width: 1, color: "#1f2a12" }} items="center" justify="center">
        <Text textStyle="small" color="#1f2a12" text={bind(() => String(hud().heroLevel))} />
      </RuneView>
    </RuneView>
    <RuneView gap={3} grow={1}>
      <Text textStyle="verb" text="Marshal Mandible" />
      {bar("health", MOSS, "the Marshal's health", Math.ceil)}
      {bar("mana", RED_INK, "the Marshal's fury", Math.floor)}
      <InkBar value={() => stat("xp")?.current ?? 0} max={() => stat("xp")?.max ?? 1} color={OCHRE} height={4} width={barWidth + 64} label="the Marshal's experience" />
      <Row gap={12}>
        <Row gap={3}><Glyph name="weapons" size={14} color="#4c5a2c" /><Small text={bind(() => String(dmg()))} label="damage" /></Row>
        <Row gap={3}><Glyph name="shield" size={14} color="#4c5a2c" /><Small text={bind(() => String(armor()))} label="armor" /></Row>
        <Row gap={3}><Glyph name="boots" size={14} color="#4c5a2c" /><Small text={bind(() => String(pace()))} label="walk speed" /></Row>
      </Row>
    </RuneView>
  </Row>;
}

/** Every fielded fighting ant as a moss token with a health bar under it; whole tokens per page. */
function ArmyRow({ rowWidth }: { rowWidth: number }) {
  const troops = useHudSlice((h) => h.army.filter((u) => !isWorker(u)).map((u) => ({ id: u.id, kind: u.kind })));
  const [requested, setRequested] = useState(0);
  if (troops.length === 0) return <Small text="No fighters afield — hatch Soldiers (2)" />;
  const fit = rosterFit(troops.length, rowWidth);
  const view = rosterPage(troops.length, fit.pageSize, requested);
  const ratio = (id: string) => { const u = hud().army.find((a) => a.id === id); return u === undefined || u.max <= 0 ? 0 : Math.max(0, Math.min(1, u.hp / u.max)); };
  const wedge = (label: string, glyph: string, enabled: boolean, page: number) => <RuneAction width={ROSTER_METRICS.arrow} height={ROSTER_METRICS.crest} label={label}
    disabled={!enabled} run={() => setRequested(page)} fill="#3f7a24" radius={3} items="center" justify="center"><Text textStyle="gilt" text={glyph} /></RuneAction>;
  return <Row gap={ROSTER_METRICS.gap} label="army units">
    {fit.paged ? wedge("Show earlier army units", "‹", view.hasPrev, view.page - 1) : null}
    {troops.slice(view.start, view.end).map((u) => <RuneView key={u.id} width={ROSTER_METRICS.crest} gap={2} label={`${u.kind} unit`} role="listitem"
      tooltip={u.kind}>
      <RuneView width={ROSTER_METRICS.crest} height={ROSTER_METRICS.crest - 6} radius={(ROSTER_METRICS.crest - 6) / 2} fill="#2b4a1a" items="center" justify="center"
        border={bind(() => ({ width: 2, color: ratio(u.id) < 0.35 ? WAX : "#16290c" }))}>
        <Glyph name={UNIT_ICON[u.kind] ?? "soldier"} size={18} />
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
      <Row gap={4} label="workers"><Glyph name="worker" size={14} color="#4c5a2c" /><Small text={bind(() => String(hud().army.filter(isWorker).length))} /></Row>
      <RuneAction command={{ name: "unit.selectArmy" }} label="Select the whole colony" disabled={bind(() => hud().army.length === 0 || hud().phase !== "playing")}
        layout="row" gap={6} padding={[3, 8, 3, 8]} border={{ width: 1, color: "#1f2a12" }} radius={2} hover="#1f2a1214" items="center">
        <Text text="Take all" /><Text textStyle="small" text="H" />
      </RuneAction>
    </Row>
    <ArmyRow rowWidth={inner} />
    <RuneView gap={3} hidden={bind(() => { const h = hud(); return h.producing + h.building + h.researching === 0; })}>
      <Small text={bind(() => { const h = hud(); return [h.producing > 0 ? `Eggs ×${h.producing}` : "", h.building > 0 ? `Digging ×${h.building}` : "", h.researching > 0 ? `Instincts ×${h.researching}` : ""].filter(Boolean).join("  ·  "); })} />
      <RuneView hidden={bind(() => hud().producing === 0)}><InkBar value={() => hud().trainProgress} max={() => 1} color={OCHRE} height={4} width={inner} label="hatching progress" /></RuneView>
    </RuneView>
  </RuneView>;
}

/** Formation tabs under the map: the active shape carries the wax. */
function FormationTabs() {
  const formation = useHudSlice((h) => h.formation);
  return <Row gap={4}>{FORMATIONS.map((option) => <RuneAction key={option.id} command={{ name: "unit.formation", input: { kind: option.id } }} label={`${option.label} formation`}
    tooltip={`${option.label} (${option.hotkey}) — ${option.blurb}`} grow={1} padding={[4, 6, 4, 6]} radius={2} items="center"
    fill={formation === option.id ? WAX : "#2b4a1a"} border={{ width: 1, color: formation === option.id ? GILT : "#16290c" }} hover="#ffffff1a">
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

/** The level-up card: two picks, an act for the command board or a trait the Marshal carries. */
function LevelUpWrit({ width, docked = false }: { width: number; docked?: boolean }) {
  const offer = useHudSlice((h) => (h.heroOffer !== null && h.phase === "playing" ? h.heroOffer : null));
  if (offer === null) return null;
  return <RuneView anchor={docked ? "top-right" : "center"} {...(docked ? { inset: 84, safe: true } : {})} variant="sheet" width={width} gap={10} label="Level-up card">
    <Row justify="between"><Eyebrow text={`Marshal Mandible molts to level ${offer.level}`} /><Small text="Choose one" /></Row>
    {offer.options.map((option, index) => {
      const disabled = !option.allocatable || option.taken;
      return <RuneAction key={option.id} command={{ name: "hero.pick", input: { id: option.id } }} disabled={disabled} label={`${option.label} — ${option.kind === "active" ? "act" : "item"}`}
        layout="row" gap={10} padding={8} border={{ width: 1, color: "#4c5a2c88" }} radius={2} hover="#d9361f1a" items="start">
        <RuneView variant="token" width={46} height={46}><Glyph name={option.icon} size={24} /><RuneView pin={[4, 2, null, null]}><Text textStyle="token" text={String(index + 7)} /></RuneView></RuneView>
        <RuneView gap={2} grow={1} shrink>
          <Text textStyle="verb" text={option.label} />
          <Small text={option.taken ? "In the kit" : option.kind === "active" ? "Act" : "Trait"} />
          <Text text={option.blurb} />
        </RuneView>
      </RuneAction>;
    })}
    <Small text="Picks are kept with the campaign: the Marshal carries them into the next mission." />
  </RuneView>;
}

function ModeBanner() {
  const mode = useHudSlice((h) => ({ rally: h.rallyArmed, attack: h.attackMoveArmed, build: h.buildArmed, trail: h.trailArmed }));
  const lines = [
    ...(mode.rally || mode.attack ? [`${mode.rally ? "Rally scent" : "Attack-move"} · Right-click a destination · Esc to cancel`] : []),
    ...(mode.trail ? ["Pheromone Line · Right-click where the trail should run to · Esc to cancel"] : []),
    ...(mode.build !== null ? [`Right-click open lawn on your side of the hose to dig the ${BUILD_LABELS[mode.build] ?? "chamber"}`] : []),
  ];
  if (lines.length === 0) return null;
  return <RuneView anchor="top" inset={110} gap={6} items="center">{lines.map((line) => <RuneView key={line} variant="note" padding={[6, 16, 6, 16]}><Text text={line} align="center" /></RuneView>)}</RuneView>;
}

/**
 * The garden-journal HUD: the pantry, the orders and the yard strip along the top, the lawn map, the
 * Marshal's card and the command board along the bottom, and the pause seal top right. Order reports and refusals come from
 * the engine notice feed, drawn by GameUI.
 */
export function RtsHud({ ctx, width, height, pause, mapOpen, toggleMap }: { ctx: GameContext; width: number; height: number; pause: ReactNode; mapOpen: boolean; toggleMap: () => void }): ReactNode {
  const phone = width < 700;
  if (phone) {
    const board = Math.floor((width - 16 - 18 - 5 * 4) / 6);
    return <>
      <NightWash />
      <RuneView anchor="top-left" safe inset={8} width={width - 16 - 66} gap={6}>
        <Ledger phone />
        <OrdersNote width={width - 16 - 66} />
        <YardStrip width={width - 16 - 66} />
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
  const heroWidth = Math.min(420, width - (MAP_SIZE + 18) - (6 * 56 + 18) - 72);
  return <>
    <NightWash />
    <RuneView anchor="top-left" safe inset={12} gap={8} items="start">
      <Ledger phone={false} />
      <OrdersNote width={330} />
      <YardStrip width={330} />
    </RuneView>
    <RuneView anchor="top-right" safe inset={12}>{pause}</RuneView>
    <ModeBanner />
    <RuneView anchor="bottom-left" safe inset={12}><MapPanel ctx={ctx} /></RuneView>
    <RuneView anchor="bottom" safe inset={12}><HeroPanel ctx={ctx} width={heroWidth} /></RuneView>
    <RuneView anchor="bottom-right" safe inset={12}><CommandBoard columns={6} size={52} /></RuneView>
    <LevelUpWrit width={380} docked />
  </>;
}

