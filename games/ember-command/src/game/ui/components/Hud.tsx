import type { CSSProperties, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { GameFrame } from "@jgengine/react/gameFrame";
import { HudFade } from "@jgengine/react/hudFade";
import { useRegisterLayoutRegion } from "@jgengine/react/gameViewport";
import { useEntityStat, useGame } from "@jgengine/react/hooks";

import { hudStore, type ArmyUnit, type HeroKitEntry, type HudSnapshot } from "../../hudStore";
import { campaignOrdinal, type CampaignReadout } from "../../campaign";
import { BARRACKS_UNITS, BUILDINGS, COMBATANTS, TRAINABLE } from "../../catalog";
import { FORMATIONS } from "../../formations";
import { UPGRADES, WEAPON_DMG_PER_RANK, ARMOR_REDUCE_PER_RANK } from "../../upgrades";
import { HERO_DMG_PER_LEVEL } from "../../hero";
import type { HeroActView, HeroOffer } from "../../heroActs";
import { Icon } from "../icons";
import { Minimap } from "./Minimap";
import { ROSTER_METRICS, rosterFit, rosterPage } from "../rosterPage";

const BUILD_LABELS: Record<string, string> = { barracks: "Barracks", farm: "Farm", guard_tower: "Guard Tower" };
const UNIT_ICON: Record<string, string> = { footman: "helm", rifleman: "rifleman", peasant: "peasant" };

/** The army row is the fighting troops; workers are counted beside it, since they keep to the seams. */
function isWorker(unit: ArmyUnit): boolean {
  return unit.kind === "peasant";
}

function useHud(): HudSnapshot {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}

/** Publish a top-of-table sheet as a HUD region, so the shell's notice feed settles below it instead of over it. */
function useTableRegion(id: string): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  useRegisterLayoutRegion({ id, kind: "hud", collisionPolicy: "allow" }, ref);
  return ref;
}

/**
 * A bar ruled in ink on the sheet: an outlined box filled with a hatched wash of one colour. It is a
 * meter for assistive tech, and the number beside it is the exact reading.
 */
function InkBar({ value, max, color, label, className }: { value: number; max: number; color: string; label: string; className?: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span
      className={`ec-ink-bar ${className ?? ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      style={{ "--fill": `${(ratio * 100).toFixed(1)}%`, "--ink": color } as CSSProperties}
    >
      <span />
    </span>
  );
}

/** One entry on the ledger strip: a glyph and its count, written in the quartermaster's hand. */
function LedgerEntry({ icon, value, warn, label }: { icon: string; value: string; warn?: boolean; label: string }) {
  return (
    <span className="ec-ledger-entry" data-warn={warn === true ? "" : undefined} aria-label={label}>
      <Icon name={icon} className="ec-ledger-glyph" />
      <b>{value}</b>
    </span>
  );
}

/**
 * The ledger strip along the top of the war table: stores, both keeps' walls and the reinforcement
 * clock, on a strip of the campaign's paper. It steps back when nothing changes and holds when a wave
 * is about to land or a keep is low.
 */
function Ledger() {
  const hud = useHud();
  const fedOut = hud.foodUsed + hud.foodReserved >= hud.foodCap;
  const keepLow = hud.playerKeepMax > 0 && hud.playerKeepHp / hud.playerKeepMax < 0.4;
  const waveNear = hud.nextWaveIn <= 10;
  const region = useTableRegion("ec-ledger");
  return (
    <HudFade
      className="ec-stock-fade"
      watch={[hud.gold, hud.lumber, hud.foodUsed, hud.foodCap, hud.enemyKeepHp, hud.playerKeepHp, hud.wavesSent]}
      hold={keepLow || waveNear}
      dimTo={0.62}
      idleMs={4500}
    >
      <div ref={region}>
      <GameFrame material="paper" tint="#e9dbb7" cut="torn" depth={8} padding="7px 18px 11px" className="ec-stock" aria-label="Ledger">
        <span className="ec-ledger-stores">
          <LedgerEntry icon="gold" value={String(hud.gold)} label={`${hud.gold} gold`} />
          <LedgerEntry icon="lumber" value={String(hud.lumber)} label={`${hud.lumber} lumber`} />
          <LedgerEntry
            icon="food"
            value={`${hud.foodUsed}${hud.foodReserved ? `+${hud.foodReserved}` : ""}/${hud.foodCap}`}
            warn={fedOut}
            label={`food ${hud.foodUsed} of ${hud.foodCap}`}
          />
        </span>
        <span className="ec-ledger-keep" data-side="enemy">
          <span className="ec-ledger-keep-name">Warcamp <b>{hud.enemyKeepHp}</b></span>
          <InkBar value={hud.enemyKeepHp} max={hud.enemyKeepMax} color="#a3291c" label="Marauder Warcamp walls" />
        </span>
        <span className="ec-ledger-keep" data-side="player" data-warn={keepLow ? "" : undefined}>
          <span className="ec-ledger-keep-name">Ember Command <b>{hud.playerKeepHp}</b></span>
          <InkBar value={hud.playerKeepHp} max={hud.playerKeepMax} color="#2d5b8c" label="Ember Command keep walls" />
        </span>
        <span
          className="ec-ledger-wave"
          data-warn={waveNear ? "" : undefined}
          title={`Marauder plan: ${hud.marauderPhase}, pressure tier ${hud.marauderTier} of 2`}
        >
          <Icon name="skull" className="ec-ledger-glyph" />
          <span>
            <small>Wave {hud.wavesSent}</small>
            <b>{hud.nextWaveIn}s</b>
          </span>
        </span>
      </GameFrame>
      </div>
    </HudFade>
  );
}

/** Mission clock as the field desk writes it: whole minutes and seconds. */
export function orderClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The live campaign order on the pinned note: step marks, the objective and its clock. */
function CampaignOrders({ campaign }: { campaign: CampaignReadout }) {
  const marks = Array.from({ length: Math.max(1, campaign.steps) }, (_, i) => i < campaign.step);
  return (
    <>
      <span className="ec-note-eyebrow">
        Order {campaignOrdinal(campaign.index - 1)} · {campaign.title}
        <span className="ec-note-marks" aria-label={`objective ${campaign.step} of ${campaign.steps}`}>
          {marks.map((done, i) => <i key={i} data-done={done ? "" : undefined} />)}
        </span>
      </span>
      <strong className="ec-note-objective">{campaign.objective}</strong>
      {campaign.remaining !== null ? (
        <span className="ec-note-line">
          <b>{orderClock(campaign.remaining)}</b>
          {campaign.duration !== null && campaign.duration > 0 ? (
            <InkBar value={campaign.remaining} max={campaign.duration} color="#8e1f17" label="time left on this order" />
          ) : null}
        </span>
      ) : null}
      {campaign.count > 0 ? (
        <span className="ec-note-line">
          <b>{campaign.counted} / {campaign.count}</b>
          <InkBar value={campaign.counted} max={campaign.count} color="#2d5b8c" label="order progress" />
        </span>
      ) : null}
    </>
  );
}

/** The orders note pinned under the ledger: the campaign's live order, or the skirmish's one aim. */
function OrdersNote() {
  const hud = useHud();
  const campaign = hud.campaign;
  const live = campaign !== null && campaign.phase === "live";
  const pressing = live && campaign.remaining !== null && campaign.remaining <= 30;
  const region = useTableRegion("ec-orders");
  return (
    <HudFade
      className="ec-objectives-fade"
      watch={[campaign?.step, campaign?.objective, campaign?.counted, hud.enemyKeepHp <= 0]}
      hold={pressing}
      dimTo={0.55}
      idleMs={6000}
    >
      <div ref={region}>
      <GameFrame material="paper" tint="#efe3c6" cut="box" depth={3} padding="12px 14px 12px" className="ec-objectives">
        <i className="ec-pin" aria-hidden />
        {live ? (
          <CampaignOrders campaign={campaign} />
        ) : (
          <>
            <span className="ec-note-eyebrow">{campaign === null ? "Free skirmish" : `Next order · ${campaignOrdinal(campaign.index - 1)}`}</span>
            <strong className="ec-note-objective">{campaign === null ? "Raze the Marauder Warcamp" : campaign.title}</strong>
          </>
        )}
      </GameFrame>
      </div>
    </HudFade>
  );
}

interface Tip {
  title: string;
  desc: string;
  chips: { icon: string; text: string }[];
}

/** One stone token on the command board: a gilt glyph, its key carved in the corner, its cost below. */
function Slot({
  icon,
  hotkey,
  foot,
  badge,
  tone,
  tip,
  setTip,
  onClick,
}: {
  icon: string;
  hotkey: string;
  foot?: string;
  badge?: string;
  tone: "ready" | "active" | "locked";
  tip: Tip;
  setTip: (t: Tip | null) => void;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      data-tone={tone}
      disabled={tone === "locked"}
      onClick={onClick}
      onPointerEnter={() => setTip(tip)}
      onPointerLeave={() => setTip(null)}
      onFocus={() => setTip(tip)}
      onBlur={() => setTip(null)}
      aria-label={tip.title}
      className="ec-slot"
    >
      <Icon name={icon} className="ec-slot-glyph" shadow="rgba(0, 0, 0, 0.85)" />
      <span className="ec-slot-key">{hotkey}</span>
      {badge !== undefined ? <span className="ec-slot-badge">{badge}</span> : null}
      {foot !== undefined ? <span className="ec-slot-foot">{foot}</span> : null}
    </button>
  );
}

function costFoot(gold?: number, lumber?: number): string {
  return [gold ? String(gold) : "", lumber ? `·${lumber}` : ""].filter(Boolean).join("");
}

function costChips(gold?: number, lumber?: number): { icon: string; text: string }[] {
  const chips: { icon: string; text: string }[] = [];
  if (gold) chips.push({ icon: "gold", text: String(gold) });
  if (lumber) chips.push({ icon: "lumber", text: String(lumber) });
  return chips;
}

function trainTone(hud: HudSnapshot, id: string): "ready" | "locked" {
  const t = TRAINABLE[id];
  if (t === undefined || hud.phase !== "playing") return "locked";
  if (BARRACKS_UNITS.has(id) && !hud.hasBarracks) return "locked";
  if ((t.cost.gold ?? 0) > hud.gold || (t.cost.lumber ?? 0) > hud.lumber) return "locked";
  return hud.foodUsed + hud.foodReserved + (COMBATANTS[id]?.food ?? 0) <= hud.foodCap ? "ready" : "locked";
}

function buildTone(hud: HudSnapshot, type: string): "ready" | "active" | "locked" {
  if (hud.buildArmed === type) return "active";
  const b = BUILDINGS[type];
  if (b === undefined || hud.phase !== "playing") return "locked";
  return (b.cost.gold ?? 0) <= hud.gold && (b.cost.lumber ?? 0) <= hud.lumber ? "ready" : "locked";
}

function researchTone(hud: HudSnapshot, id: string): "ready" | "locked" {
  const up = UPGRADES[id];
  if (up === undefined || hud.phase !== "playing" || !hud.hasBarracks) return "locked";
  const rank = id === "weapons" ? hud.weaponsRank : hud.armorRank;
  const have = id === "weapons" ? hud.weaponsHave : hud.armorHave;
  if (have >= up.maxRank || have > rank) return "locked";
  const c = up.cost(rank);
  return (c.gold ?? 0) <= hud.gold && (c.lumber ?? 0) <= hud.lumber ? "ready" : "locked";
}

function researchFoot(hud: HudSnapshot, id: string): string {
  const up = UPGRADES[id]!;
  const rank = id === "weapons" ? hud.weaponsRank : hud.armorRank;
  const have = id === "weapons" ? hud.weaponsHave : hud.armorHave;
  if (have >= up.maxRank) return "max";
  if (have > rank) return "…";
  return costFoot(up.cost(rank).gold, up.cost(rank).lumber);
}

/** One of Bram's acts: its mana and cooldown in the writ, its readiness on the token. */
function ActSlot({ act, setTip }: { act: HeroActView | undefined; setTip: (t: Tip | null) => void }) {
  const { commands } = useGame();
  if (act === undefined) {
    return <Slot icon="thunder" hotkey="·" foot="—" tone="locked" setTip={setTip} tip={{ title: "Hero act", desc: "Bram's acts appear here once he takes the field.", chips: [] }} />;
  }
  const tone: "ready" | "active" | "locked" = !act.owned ? "locked" : act.ready ? "ready" : "locked";
  const foot = !act.owned ? "—" : act.ready ? "ready" : `${act.remaining}s`;
  return (
    <Slot
      icon={act.icon}
      hotkey={act.hotkey}
      foot={foot}
      tone={tone}
      setTip={setTip}
      onClick={() => commands.run("hero.act", { act: act.id })}
      tip={{
        title: act.owned ? act.label : `${act.label} — not in Bram's kit`,
        desc: act.owned ? act.blurb : `${act.blurb} Take it at a level-up to add it to the command board.`,
        chips: act.owned
          ? [{ icon: "mana", text: String(act.manaCost) }, { icon: "stopwatch", text: `${act.cooldownSeconds}s` }]
          : [],
      }}
    />
  );
}

/** The picks Bram carries, as one token: a count on the stone, the kit in the writ. */
function KitSlot({ kit, setTip }: { kit: HeroKitEntry[]; setTip: (t: Tip | null) => void }) {
  const tip: Tip = kit.length === 0
    ? { title: "Field kit", desc: "Bram's kit is empty. Every level-up offers two picks: an act for the command board or an item he carries.", chips: [] }
    : { title: `Field kit — ${kit.length} pick${kit.length === 1 ? "" : "s"}`, desc: kit.map((pick) => `${pick.label}: ${pick.blurb}`).join("  ·  "), chips: [] };
  return (
    <Slot
      icon="medal"
      hotkey="·"
      foot="kit"
      badge={kit.length > 0 ? String(kit.length) : undefined}
      tone={kit.length > 0 ? "active" : "locked"}
      setTip={setTip}
      tip={tip}
    />
  );
}

/** The command board: sixteen stone tokens in a leather case, with a writ unrolled above for the one in hand. */
function CommandBoard() {
  const hud = useHud();
  const { commands } = useGame();
  const [tip, setTip] = useState<Tip | null>(null);
  const barracksFoot = (id: string) => (hud.hasBarracks ? costFoot(TRAINABLE[id]!.cost.gold, TRAINABLE[id]!.cost.lumber) : "locked");

  return (
    <GameFrame material="leather" tint="#4a2c19" cut="chamfer" depth={10} padding="9px" className="ec-board">
      {tip !== null ? (
        <GameFrame material="paper" cut="torn" depth={8} padding="10px 14px 14px" className="ec-writ" role="tooltip">
          <strong>{tip.title}</strong>
          <span>{tip.desc}</span>
          {tip.chips.length > 0 ? (
            <span className="ec-writ-chips">
              {tip.chips.map((c) => (
                <span key={c.icon + c.text}>
                  <Icon name={c.icon} className="ec-writ-glyph" />
                  {c.text}
                </span>
              ))}
            </span>
          ) : null}
        </GameFrame>
      ) : null}
      <div className="ec-board-grid">
        <Slot icon="peasant" hotkey="1" foot={costFoot(TRAINABLE.peasant!.cost.gold)} tone={trainTone(hud, "peasant")} setTip={setTip} onClick={() => commands.run("train.peasant", {})}
          tip={{ title: "Train Peasant", desc: "Worker — mines gold, cuts lumber, and raises buildings.", chips: costChips(TRAINABLE.peasant!.cost.gold, TRAINABLE.peasant!.cost.lumber) }} />
        <Slot icon="footman" hotkey="2" foot={barracksFoot("footman")} tone={trainTone(hud, "footman")} setTip={setTip} onClick={() => commands.run("train.footman", {})}
          tip={{ title: "Train Footman", desc: "Frontline screen. Deals 50% more damage to armored Reavers; holds raiders away from rifles. Requires a Barracks.", chips: costChips(TRAINABLE.footman!.cost.gold, TRAINABLE.footman!.cost.lumber) }} />
        <Slot icon="rifleman" hotkey="3" foot={barracksFoot("rifleman")} tone={trainTone(hud, "rifleman")} setTip={setTip} onClick={() => commands.run("train.rifleman", {})}
          tip={{ title: "Train Rifleman", desc: "Full firepower beyond 3m; weak at close range and against armored Reavers. Strong against the warcamp. Requires a Barracks.", chips: costChips(TRAINABLE.rifleman!.cost.gold, TRAINABLE.rifleman!.cost.lumber) }} />
        <Slot icon="attackMove" hotkey="R" tone={hud.phase === "playing" ? (hud.attackMoveArmed ? "active" : "ready") : "locked"} setTip={setTip} onClick={() => commands.run("unit.attackMove", {})}
          tip={{ title: "Attack-Move", desc: "Arm, then right-click a destination — the group fights anything it meets on the way.", chips: [] }} />

        <Slot icon="barracks" hotkey="B" foot={costFoot(BUILDINGS.barracks!.cost.gold, BUILDINGS.barracks!.cost.lumber)} tone={buildTone(hud, "barracks")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "barracks" })}
          tip={{ title: "Build Barracks", desc: "Unlocks Footman & Rifleman and enables research.", chips: costChips(BUILDINGS.barracks!.cost.gold, BUILDINGS.barracks!.cost.lumber) }} />
        <Slot icon="farm" hotkey="G" foot={costFoot(BUILDINGS.farm!.cost.gold, BUILDINGS.farm!.cost.lumber)} tone={buildTone(hud, "farm")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "farm" })}
          tip={{ title: "Build Farm", desc: `Raises your food (supply) cap by ${BUILDINGS.farm!.supply}.`, chips: [...costChips(BUILDINGS.farm!.cost.gold, BUILDINGS.farm!.cost.lumber), { icon: "food", text: `+${BUILDINGS.farm!.supply}` }] }} />
        <Slot icon="tower" hotkey="T" foot={costFoot(BUILDINGS.guard_tower!.cost.gold, BUILDINGS.guard_tower!.cost.lumber)} tone={buildTone(hud, "guard_tower")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "guard_tower" })}
          tip={{ title: "Build Guard Tower", desc: "Auto-fires on Marauders that stray into range.", chips: costChips(BUILDINGS.guard_tower!.cost.gold, BUILDINGS.guard_tower!.cost.lumber) }} />
        <Slot icon="rally" hotkey="F" tone={hud.phase === "playing" ? (hud.rallyArmed ? "active" : "ready") : "locked"} setTip={setTip} onClick={() => commands.run("unit.rally", {})} tip={{ title: "Rally Point", desc: "Arm, then right-click where new recruits should gather.", chips: [] }} />

        <Slot icon="weapons" hotkey="Z" badge={hud.weaponsRank > 0 ? String(hud.weaponsRank) : undefined} foot={researchFoot(hud, "weapons")} tone={researchTone(hud, "weapons")} setTip={setTip} onClick={() => commands.run("research.weapons", {})}
          tip={{ title: `${UPGRADES.weapons!.label} — L${hud.weaponsRank}/${UPGRADES.weapons!.maxRank}`, desc: `+${WEAPON_DMG_PER_RANK} damage to your whole army per rank.`, chips: costChips(UPGRADES.weapons!.cost(hud.weaponsRank).gold, UPGRADES.weapons!.cost(hud.weaponsRank).lumber) }} />
        <Slot icon="armor" hotkey="X" badge={hud.armorRank > 0 ? String(hud.armorRank) : undefined} foot={researchFoot(hud, "armor")} tone={researchTone(hud, "armor")} setTip={setTip} onClick={() => commands.run("research.armor", {})}
          tip={{ title: `${UPGRADES.armor!.label} — L${hud.armorRank}/${UPGRADES.armor!.maxRank}`, desc: `−${ARMOR_REDUCE_PER_RANK} damage taken by your whole army per rank.`, chips: costChips(UPGRADES.armor!.cost(hud.armorRank).gold, UPGRADES.armor!.cost(hud.armorRank).lumber) }} />
        <ActSlot act={hud.heroActs.find((entry) => entry.id === "thunderclap")} setTip={setTip} />
        <Slot icon="hold" hotkey="V" tone={hud.phase === "playing" ? "ready" : "locked"} setTip={setTip} onClick={() => commands.run("unit.hold", {})} tip={{ title: "Hold Army", desc: "All combat troops stop and attack only enemies within weapon reach. Workers keep harvesting.", chips: [] }} />

        {/* Bram's picked acts: one token each, dark until a level-up adds them. */}
        <ActSlot act={hud.heroActs.find((entry) => entry.id === "banner")} setTip={setTip} />
        <ActSlot act={hud.heroActs.find((entry) => entry.id === "volley")} setTip={setTip} />
        <ActSlot act={hud.heroActs.find((entry) => entry.id === "ward")} setTip={setTip} />
        <KitSlot kit={hud.heroKit} setTip={setTip} />
      </div>
    </GameFrame>
  );
}

/** Bram's card: a wax medallion with his level, ink bars for health, mana and experience, his stat line. */
function HeroCard() {
  const hud = useHud();
  const hp = useEntityStat("hero", "health");
  const mana = useEntityStat("hero", "mana");
  const xp = useEntityStat("hero", "xp");
  const alive = hp !== null && hp.current > 0;
  const dmg = (COMBATANTS.hero?.damage ?? 24) + (hud.heroLevel - 1) * HERO_DMG_PER_LEVEL + hud.weaponsRank * WEAPON_DMG_PER_RANK;
  const armor = hud.armorRank * ARMOR_REDUCE_PER_RANK;
  return (
    <div className="ec-hero">
      <span className="ec-medallion" data-fallen={alive ? undefined : ""} aria-hidden>
        <Icon name={alive ? "helm" : "skull"} className="ec-medallion-glyph" shadow="rgba(0, 0, 0, 0.5)" shadowDy={13} />
        <b>{hud.heroLevel}</b>
      </span>
      <span className="ec-hero-lines">
        <strong className="ec-hero-name">Bram the Bold</strong>
        {hp !== null ? (
          <span className="ec-hero-bar">
            <InkBar value={hp.current} max={hp.max} color="#3f7a2c" label="Bram's health" />
            <small>{Math.ceil(hp.current)}/{hp.max}</small>
          </span>
        ) : null}
        {mana !== null ? (
          <span className="ec-hero-bar">
            <InkBar value={mana.current} max={mana.max} color="#2d5b8c" label="Bram's mana" />
            <small>{Math.floor(mana.current)}/{mana.max}</small>
          </span>
        ) : null}
        {xp !== null && alive ? <InkBar value={xp.current} max={xp.max} color="#b0741c" label="Bram's experience" className="ec-ink-bar-thin" /> : null}
        <span className="ec-hero-stats">
          <span aria-label={`damage ${dmg}`}><Icon name="weapons" className="ec-hero-stat-glyph" />{dmg}</span>
          <span aria-label={`armor ${armor}`}><Icon name="shield" className="ec-hero-stat-glyph" />{armor}</span>
          <span aria-label="walk speed"><Icon name="boots" className="ec-hero-stat-glyph" />{COMBATANTS.hero?.walkSpeed ?? 4.3}</span>
        </span>
      </span>
    </div>
  );
}

/** Measures an element's content width; re-measures whenever it resizes. */
function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Every fielded fighting unit as a round stone token whose rim is its health. Whole tokens per page; the
 * wedges step one page and go dark at the ends. */
function ArmyRow() {
  const hud = useHud();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [requestedPage, setRequestedPage] = useState(0);
  const troops = hud.army.filter((unit) => !isWorker(unit));
  const count = troops.length;
  const fit = rosterFit(count, width);
  const view = rosterPage(count, fit.pageSize, requestedPage);
  const shown = troops.slice(view.start, view.end);

  return (
    <div ref={ref} className="ec-army" style={{ gap: ROSTER_METRICS.gap }}>
      {count === 0 ? (
        <span className="ec-army-empty">No troops afield — train Footmen (2)</span>
      ) : (
        <>
          {fit.paged ? (
            <button type="button" className="ec-wedge" aria-label="Show earlier army units" disabled={!view.hasPrev} onClick={() => setRequestedPage(view.page - 1)}>‹</button>
          ) : null}
          <div role="list" aria-label="army units" className="ec-army-list" style={{ gap: ROSTER_METRICS.gap }}>
            {shown.map((u: ArmyUnit) => {
              const label = `${u.kind} · ${Math.ceil(u.hp)}/${u.max} health`;
              const ratio = u.max > 0 ? Math.max(0, Math.min(1, u.hp / u.max)) : 0;
              return (
                <div
                  role="listitem"
                  tabIndex={0}
                  key={u.id}
                  aria-label={label}
                  title={label}
                  className="ec-token"
                  data-hurt={ratio < 0.35 ? "" : undefined}
                  style={{ "--hp": ratio.toFixed(3) } as CSSProperties}
                >
                  <span className="ec-token-stone">
                    <Icon name={UNIT_ICON[u.kind] ?? "footman"} className="ec-token-glyph" shadow="rgba(0, 0, 0, 0.7)" shadowDy={26} />
                  </span>
                </div>
              );
            })}
          </div>
          {fit.paged ? (
            <button type="button" className="ec-wedge" aria-label="Show later army units" disabled={!view.hasNext} onClick={() => setRequestedPage(view.page + 1)}>›</button>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The ruled line over the tokens: how many stand afield, and the call that takes them all in hand. */
function ArmyHeader() {
  const hud = useHud();
  const { commands } = useGame();
  return (
    <span className="ec-army-head">
      <span>Afield · {hud.army.filter((unit) => !isWorker(unit)).length}</span>
      <span className="ec-army-workers" aria-label={`${hud.army.filter(isWorker).length} workers`}>
        <Icon name="peasant" className="ec-hero-stat-glyph" />
        {hud.army.filter(isWorker).length}
      </span>
      <button
        type="button"
        className="ec-army-call"
        aria-label="Select the whole army"
        disabled={hud.army.length === 0 || hud.phase !== "playing"}
        onClick={() => commands.run("unit.selectArmy", {})}
      >
        Take all <span className="ec-slot-key">H</span>
      </button>
    </span>
  );
}

/** Formation tabs under the map: the marching shape the army dresses in and holds. The active
 * shape carries the wax; a click (or its hotkey) re-forms a standing group and arms the shape for
 * the next move order. */
function FormationTabs() {
  const hud = useHud();
  const { commands } = useGame();
  return (
    <div className="ec-formations">
      {FORMATIONS.map((option) => {
        const active = hud.formation === option.id;
        return (
          <button
            type="button"
            key={option.id}
            data-tone={active ? "active" : "ready"}
            aria-pressed={active}
            onClick={() => commands.run("unit.formation", { kind: option.id })}
            aria-label={`${option.label} formation`}
            title={`${option.label} (${option.hotkey}) — ${option.blurb}`}
            className="ec-formation"
          >
            <span className="ec-slot-key">{option.hotkey}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ProductionLine() {
  const hud = useHud();
  const bits: string[] = [];
  if (hud.producing > 0) bits.push(`Training ×${hud.producing}`);
  if (hud.building > 0) bits.push(`Building ×${hud.building}`);
  if (hud.researching > 0) bits.push(`Research ×${hud.researching}`);
  if (bits.length === 0) return null;
  return (
    <span className="ec-production">
      {bits.map((b) => <span key={b}>{b}</span>)}
      {hud.producing > 0 ? <InkBar value={hud.trainProgress} max={1} color="#b0741c" label="training progress" className="ec-ink-bar-thin" /> : null}
    </span>
  );
}

/** The bottom of the war table: the survey map in its frame, Bram's card with the army tokens, and the command board. */
function Console() {
  const hud = useHud();
  return (
    <div className="ec-console">
      <GameFrame material="wood" tint="#5b3b22" cut="chamfer" depth={10} padding="9px 9px 8px" className="ec-map-panel">
        <span className="ec-map-sheet">
          <Minimap />
          <span className="ec-map-north" aria-hidden>N</span>
        </span>
        <FormationTabs />
      </GameFrame>

      <GameFrame material="paper" tint="#ece0c2" cut="box" depth={3} padding="10px 12px 10px" className="ec-hero-panel">
        <HeroCard />
        <ArmyHeader />
        <ArmyRow />
        <ProductionLine />
      </GameFrame>

      <CommandBoard />

      {hud.buildArmed !== null ? (
        <GameFrame material="paper" cut="ticket" depth={8} padding="6px 16px" className="ec-build-mode">
          Right-click your side of the field to place the {BUILD_LABELS[hud.buildArmed] ?? "building"}
        </GameFrame>
      ) : null}
    </div>
  );
}

/** The level-up writ: two picks, an act for the command board or an item Bram carries. */
function LevelUpWrit({ offer }: { offer: HeroOffer }) {
  const { commands } = useGame();
  return (
    <GameFrame material="paper" cut="torn" depth={12} padding="14px 18px 22px" className="ec-levelup">
      <span className="ec-note-eyebrow">
        Bram reaches level {offer.level}
        <span>Choose one</span>
      </span>
      <span className="ec-levelup-picks">
        {offer.options.map((option, index) => {
          const disabled = !option.allocatable || option.taken;
          return (
            <button
              type="button"
              key={option.id}
              disabled={disabled}
              onClick={() => commands.run("hero.pick", { id: option.id })}
              aria-label={`${option.label} — ${option.kind === "active" ? "act" : "item"}`}
              className="ec-levelup-option"
            >
              <span className="ec-slot ec-slot-static" data-tone={disabled ? "locked" : "ready"} aria-hidden>
                <Icon name={option.icon} className="ec-slot-glyph" shadow="rgba(0, 0, 0, 0.85)" />
                <span className="ec-slot-key">{index + 7}</span>
              </span>
              <span className="ec-levelup-text">
                <strong>{option.label}</strong>
                <small>{option.taken ? "In the kit" : option.kind === "active" ? "Act" : "Item"}</small>
                <span>{option.blurb}</span>
              </span>
            </button>
          );
        })}
      </span>
      <small className="ec-levelup-foot">Picks are kept with the campaign: Bram carries them into the next mission.</small>
    </GameFrame>
  );
}

/** Order reports and refusals go to the engine notice feed (`ctx.game.notices`), which the shell draws. */
export function RtsHud(): ReactNode {
  const hud = useHud();
  return (
    <>
      <Ledger />
      <OrdersNote />
      <Console />
      {hud.heroOffer !== null && hud.phase === "playing" ? <LevelUpWrit offer={hud.heroOffer} /> : null}
      {hud.rallyArmed || hud.attackMoveArmed ? (
        <GameFrame material="paper" cut="ticket" depth={8} padding="6px 16px" className="ec-order-mode">
          {hud.rallyArmed ? "Rally point" : "Attack-move"} · Right-click a destination · Esc to cancel
        </GameFrame>
      ) : null}
    </>
  );
}
