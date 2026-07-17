import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";
import { useEntityStat, useGame } from "@jgengine/react/hooks";

import { hudStore, type ArmyUnit, type HudSnapshot } from "../../hudStore";
import { BARRACKS_UNITS, BUILDINGS, COMBATANTS, TRAINABLE } from "../../catalog";
import { UPGRADES, WEAPON_DMG_PER_RANK, ARMOR_REDUCE_PER_RANK } from "../../upgrades";
import { HERO_DMG_PER_LEVEL, THUNDERCLAP_COOLDOWN, THUNDERCLAP_COST } from "../../hero";
import { Minimap } from "./Minimap";

const BUILD_LABELS: Record<string, string> = { barracks: "Barracks", farm: "Farm", guard_tower: "Guard Tower" };
const UNIT_ICON: Record<string, string> = { footman: "⚔️", rifleman: "🏹", peasant: "🧑‍🌾" };

function useHud(): HudSnapshot {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}

/** Dark carved-stone panel with a gold edge and inset bevel — the shared chrome of every console
 * piece. Positioning (`absolute`/`relative`) is applied by each caller so it never clobbers layout. */
const FRAME =
  "rounded-lg border-2 border-amber-700/70 bg-gradient-to-b from-[#2b2519]/95 via-[#1a1610]/96 to-[#0e0b07]/97 " +
  "shadow-[0_8px_28px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,214,140,.16),inset_0_0_0_1px_rgba(0,0,0,.55)] backdrop-blur-sm";

/** Little gold corner brackets that give panels their ornate, forged feel. */
function Corners() {
  const base = "pointer-events-none absolute h-2 w-2 border-amber-400/60";
  return (
    <>
      <span className={base + " left-0.5 top-0.5 border-l-2 border-t-2"} />
      <span className={base + " right-0.5 top-0.5 border-r-2 border-t-2"} />
      <span className={base + " bottom-0.5 left-0.5 border-b-2 border-l-2"} />
      <span className={base + " bottom-0.5 right-0.5 border-b-2 border-r-2"} />
    </>
  );
}

/** A glossy stat bar with an optional inline value label (HP / mana / keep vitals). */
function Bar({ value, max, from, to, label, h = "h-3" }: { value: number; max: number; from: string; to: string; label?: string; h?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={"relative w-full overflow-hidden rounded-[3px] border border-black/80 bg-black/70 shadow-inner " + h}>
      <div className="h-full transition-[width] duration-200" style={{ width: `${pct * 100}%`, background: `linear-gradient(to bottom, ${from}, ${to})` }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      {label !== undefined ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-white/95 [text-shadow:0_1px_1px_rgba(0,0,0,.9)]">{label}</span>
      ) : null}
    </div>
  );
}

function ResourceChip({ icon, value, tone }: { icon: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-lg leading-none drop-shadow">{icon}</span>
      <span className={"min-w-[2.5ch] text-[15px] font-bold tabular-nums " + tone}>{value}</span>
    </div>
  );
}

/** Top-right stockpile + both keeps' vitals + the reinforcement clock, in one forged strip. */
function TopBar() {
  const hud = useHud();
  const foodTone = hud.foodUsed >= hud.foodCap ? "text-rose-300" : "text-emerald-200";
  return (
    <div className={"pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 px-4 py-2 font-serif text-slate-100 " + FRAME}>
      <Corners />
      <ResourceChip icon="🪙" value={String(hud.gold)} tone="text-amber-300" />
      <ResourceChip icon="🪵" value={String(hud.lumber)} tone="text-orange-200" />
      <ResourceChip icon="🍖" value={`${hud.foodUsed}/${hud.foodCap}`} tone={foodTone} />
      <div className="mx-1 h-8 w-px bg-amber-800/50" />
      <div className="flex w-32 flex-col gap-0.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-rose-300"><span>Warcamp</span><span className="tabular-nums">{hud.enemyKeepHp}</span></div>
        <Bar value={hud.enemyKeepHp} max={hud.enemyKeepMax} from="#ff7a5c" to="#b5321c" h="h-2.5" />
      </div>
      <div className="flex w-32 flex-col gap-0.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sky-300"><span>Ironhold</span><span className="tabular-nums">{hud.playerKeepHp}</span></div>
        <Bar value={hud.playerKeepHp} max={hud.playerKeepMax} from="#7db4ff" to="#2f63c8" h="h-2.5" />
      </div>
      <div className="mx-1 h-8 w-px bg-amber-800/50" />
      <div className="flex flex-col items-center leading-tight" title="Marauder reinforcement wave">
        <span className="text-[10px] font-bold uppercase tracking-widest text-rose-300/90">Wave {hud.wavesSent}</span>
        <span className="text-[13px] font-bold tabular-nums text-rose-100">💀 {hud.nextWaveIn}s</span>
      </div>
    </div>
  );
}

/** Top-left objective card with a collapsible controls crib. */
function ObjectivesPanel() {
  const hud = useHud();
  const [open, setOpen] = useState(true);
  const done = hud.enemyKeepHp <= 0;
  return (
    <div className={"pointer-events-auto absolute left-3 top-3 z-20 w-64 px-3 py-2 font-serif text-slate-100 " + FRAME}>
      <Corners />
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300/90">Objectives</span>
        <span className={"text-amber-400/80 transition-transform " + (open ? "rotate-0" : "-rotate-90")}>⌄</span>
      </button>
      {open ? (
        <>
          <div className="mt-1.5 flex items-start gap-2">
            <span className={"mt-0.5 text-lg leading-none " + (done ? "grayscale" : "")}>{done ? "🏆" : "🎖️"}</span>
            <div className="leading-tight">
              <div className="text-[13px] font-bold text-amber-100">Raze the Marauder Warcamp</div>
              <div className="text-[11px] text-slate-400">Destroy the Warcamp to win</div>
            </div>
          </div>
          <div className="mt-2 border-t border-amber-800/30 pt-1.5 text-[10px] leading-relaxed text-slate-400">
            <div>Drag to box-select · left-click a unit</div>
            <div>Right-click to move · on an enemy to attack</div>
            <div className="mt-1 text-slate-500">A Warcraft III homage · art: KayKit &amp; Quaternius (CC0)</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface Tip {
  title: string;
  desc: string;
  chips: { icon: string; text: string }[];
}

/** A single command-card cell: big glyph, corner hotkey, a footer line, and hover-driven tooltip. */
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
  const shell =
    tone === "locked"
      ? "cursor-not-allowed border-slate-700/70 bg-gradient-to-b from-slate-800/70 to-slate-950/80 text-slate-600"
      : tone === "active"
        ? "border-sky-300 bg-gradient-to-b from-sky-500/40 to-slate-900/80 text-sky-100 shadow-[0_0_10px_2px_rgba(80,160,255,.55),inset_0_1px_0_rgba(255,255,255,.25)]"
        : "border-amber-600/70 bg-gradient-to-b from-[#3a3016]/90 to-[#14100a]/95 text-amber-100 hover:from-amber-600/40 hover:text-white shadow-[inset_0_1px_0_rgba(255,220,150,.2)]";
  return (
    <button
      type="button"
      disabled={tone === "locked"}
      onClick={onClick}
      onMouseEnter={() => setTip(tip)}
      onMouseLeave={() => setTip(null)}
      className={"relative flex h-[52px] w-[52px] items-center justify-center rounded-md border-2 transition " + shell}
    >
      <span className="text-2xl leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,.8)]">{icon}</span>
      <span className="absolute left-0.5 top-0 text-[9px] font-bold text-slate-200/80 [text-shadow:0_1px_1px_rgba(0,0,0,.9)]">{hotkey}</span>
      {badge !== undefined ? (
        <span className="absolute -right-1 -top-1 rounded-full border border-amber-300/70 bg-slate-900 px-1 text-[9px] font-bold text-amber-200 tabular-nums">{badge}</span>
      ) : null}
      {foot !== undefined ? (
        <span className="absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[8px] font-semibold leading-tight text-amber-200/90 [text-shadow:0_1px_1px_rgba(0,0,0,.9)]">{foot}</span>
      ) : null}
    </button>
  );
}

function goldLumber(gold?: number, lumber?: number): string {
  return [gold ? `🪙${gold}` : "", lumber ? `🪵${lumber}` : ""].filter(Boolean).join(" ");
}

function trainTone(hud: HudSnapshot, id: string): "ready" | "locked" {
  const t = TRAINABLE[id];
  if (t === undefined || hud.phase !== "playing") return "locked";
  if (BARRACKS_UNITS.has(id) && !hud.hasBarracks) return "locked";
  if ((t.cost.gold ?? 0) > hud.gold || (t.cost.lumber ?? 0) > hud.lumber) return "locked";
  return hud.foodUsed + (COMBATANTS[id]?.food ?? 0) <= hud.foodCap ? "ready" : "locked";
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
  if (have >= up.maxRank) return "MAX";
  if (have > rank) return "…";
  return goldLumber(up.cost(rank).gold, up.cost(rank).lumber);
}

/** The 3×4 ornate command grid — recruit / construct / powers — with a shared hover tooltip. */
function CommandGrid() {
  const hud = useHud();
  const { commands } = useGame();
  const [tip, setTip] = useState<Tip | null>(null);
  const armed = hud.buildArmed !== null;

  return (
    <div className="relative">
      {tip !== null ? (
        <div className={"pointer-events-none absolute bottom-[calc(100%+10px)] right-0 z-30 w-64 px-3 py-2 font-serif " + FRAME}>
          <Corners />
          <div className="text-[13px] font-bold text-amber-200">{tip.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-300">{tip.desc}</div>
          {tip.chips.length > 0 ? (
            <div className="mt-1.5 flex gap-3 text-[11px] font-bold text-amber-100">
              {tip.chips.map((c) => (
                <span key={c.icon + c.text} className="flex items-center gap-1"><span>{c.icon}</span>{c.text}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-4 grid-rows-3 gap-1.5">
        <Slot icon="🧑‍🌾" hotkey="Q" foot={goldLumber(TRAINABLE.peasant!.cost.gold, TRAINABLE.peasant!.cost.lumber)} tone={trainTone(hud, "peasant")} setTip={setTip} onClick={() => commands.run("train.peasant", {})}
          tip={{ title: "Train Peasant", desc: "Worker — mines gold, cuts lumber, and raises buildings.", chips: [{ icon: "🪙", text: String(TRAINABLE.peasant!.cost.gold) }] }} />
        <Slot icon="⚔️" hotkey="W" foot={hud.hasBarracks ? goldLumber(TRAINABLE.footman!.cost.gold, TRAINABLE.footman!.cost.lumber) : "🔒 Barracks"} tone={trainTone(hud, "footman")} setTip={setTip} onClick={() => commands.run("train.footman", {})}
          tip={{ title: "Train Footman", desc: "Sturdy frontline melee. Requires a Barracks.", chips: [{ icon: "🪙", text: String(TRAINABLE.footman!.cost.gold) }, { icon: "🪵", text: String(TRAINABLE.footman!.cost.lumber) }] }} />
        <Slot icon="🏹" hotkey="E" foot={hud.hasBarracks ? goldLumber(TRAINABLE.rifleman!.cost.gold, TRAINABLE.rifleman!.cost.lumber) : "🔒 Barracks"} tone={trainTone(hud, "rifleman")} setTip={setTip} onClick={() => commands.run("train.rifleman", {})}
          tip={{ title: "Train Rifleman", desc: "Ranged marksman — soft, but hits from afar. Requires a Barracks.", chips: [{ icon: "🪙", text: String(TRAINABLE.rifleman!.cost.gold) }, { icon: "🪵", text: String(TRAINABLE.rifleman!.cost.lumber) }] }} />
        <Slot icon="🎯" hotkey="R" tone={hud.phase === "playing" ? (hud.attackMoveArmed ? "active" : "ready") : "locked"} setTip={setTip} onClick={() => commands.run("unit.attackMove", {})}
          tip={{ title: "Attack-Move", desc: "Arm, then right-click a destination — the group fights anything it meets on the way.", chips: [{ icon: "⌨", text: "R" }] }} />

        <Slot icon="🏰" hotkey="A" foot={goldLumber(BUILDINGS.barracks!.cost.gold, BUILDINGS.barracks!.cost.lumber)} tone={buildTone(hud, "barracks")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "barracks" })}
          tip={{ title: "Build Barracks", desc: "Unlocks Footman & Rifleman and enables research.", chips: [{ icon: "🪙", text: String(BUILDINGS.barracks!.cost.gold) }, { icon: "🪵", text: String(BUILDINGS.barracks!.cost.lumber) }] }} />
        <Slot icon="🌾" hotkey="S" foot={goldLumber(BUILDINGS.farm!.cost.gold, BUILDINGS.farm!.cost.lumber)} tone={buildTone(hud, "farm")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "farm" })}
          tip={{ title: "Build Farm", desc: "Raises your food (supply) cap by 8.", chips: [{ icon: "🪙", text: String(BUILDINGS.farm!.cost.gold) }, { icon: "🪵", text: String(BUILDINGS.farm!.cost.lumber) }, { icon: "🍖", text: `+${BUILDINGS.farm!.supply}` }] }} />
        <Slot icon="🗼" hotkey="D" foot={goldLumber(BUILDINGS.guard_tower!.cost.gold, BUILDINGS.guard_tower!.cost.lumber)} tone={buildTone(hud, "guard_tower")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "guard_tower" })}
          tip={{ title: "Build Guard Tower", desc: "Auto-fires on Marauders that stray into range.", chips: [{ icon: "🪙", text: String(BUILDINGS.guard_tower!.cost.gold) }, { icon: "🪵", text: String(BUILDINGS.guard_tower!.cost.lumber) }] }} />
        <Slot icon="🚩" hotkey="F" tone="locked" setTip={setTip} tip={{ title: "Rally Point", desc: "Set where new recruits gather. Coming soon.", chips: [] }} />

        <Slot icon="🗡️" hotkey="Z" badge={hud.weaponsRank > 0 ? String(hud.weaponsRank) : undefined} foot={researchFoot(hud, "weapons")} tone={researchTone(hud, "weapons")} setTip={setTip} onClick={() => commands.run("research.weapons", {})}
          tip={{ title: `${UPGRADES.weapons!.label} — L${hud.weaponsRank}/${UPGRADES.weapons!.maxRank}`, desc: `+${WEAPON_DMG_PER_RANK} damage to your whole army per rank.`, chips: [{ icon: "🪙", text: String(UPGRADES.weapons!.cost(hud.weaponsRank).gold) }, { icon: "🪵", text: String(UPGRADES.weapons!.cost(hud.weaponsRank).lumber) }] }} />
        <Slot icon="🛡️" hotkey="X" badge={hud.armorRank > 0 ? String(hud.armorRank) : undefined} foot={researchFoot(hud, "armor")} tone={researchTone(hud, "armor")} setTip={setTip} onClick={() => commands.run("research.armor", {})}
          tip={{ title: `${UPGRADES.armor!.label} — L${hud.armorRank}/${UPGRADES.armor!.maxRank}`, desc: `−${ARMOR_REDUCE_PER_RANK} damage taken by your whole army per rank.`, chips: [{ icon: "🪙", text: String(UPGRADES.armor!.cost(hud.armorRank).gold) }, { icon: "🪵", text: String(UPGRADES.armor!.cost(hud.armorRank).lumber) }] }} />
        <Slot icon="⚡" hotkey="C" foot={hud.abilityReady ? "READY" : hud.abilityCd > 0 ? `${hud.abilityCd}s` : "no ⛁"} tone={hud.abilityReady ? "ready" : "locked"} setTip={setTip} onClick={() => commands.run("hero.ability", {})}
          tip={{ title: "Thunder Clap", desc: "Bram slams the ground, bursting every Marauder around him.", chips: [{ icon: "💧", text: String(THUNDERCLAP_COST) }, { icon: "⏱", text: `${THUNDERCLAP_COOLDOWN}s` }] }} />
        <Slot icon="✋" hotkey="V" tone="locked" setTip={setTip} tip={{ title: "Hold Position", desc: "Coming soon.", chips: [] }} />
      </div>
    </div>
  );
}

/** Framed hero portrait with level pip, HP/mana/XP bars, and a WC3 stat line (damage · armor · speed). */
function HeroPanel() {
  const hud = useHud();
  const hp = useEntityStat("hero", "health");
  const mana = useEntityStat("hero", "mana");
  const xp = useEntityStat("hero", "xp");
  const alive = hp !== null && hp.current > 0;
  const dmg = (COMBATANTS.hero?.damage ?? 24) + (hud.heroLevel - 1) * HERO_DMG_PER_LEVEL + hud.weaponsRank * WEAPON_DMG_PER_RANK;
  const armor = hud.armorRank * ARMOR_REDUCE_PER_RANK;
  return (
    <div className="flex items-center gap-3">
      <div className={"relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-md border-2 " + (alive ? "border-amber-500/80" : "border-slate-700 grayscale")}>
        <div className={"flex h-full w-full items-center justify-center " + (alive ? "bg-gradient-to-b from-amber-600/40 via-slate-800/70 to-slate-950/90" : "bg-slate-900/80")}>
          <span className="text-4xl drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]">{alive ? "🧔" : "💀"}</span>
        </div>
        <span className="absolute -bottom-px left-0 flex h-5 w-5 items-center justify-center rounded-tr-md border-r border-t border-amber-300/70 bg-slate-950/90 text-[11px] font-black text-amber-200 tabular-nums">{hud.heroLevel}</span>
      </div>
      <div className="flex w-40 flex-col gap-1">
        <span className="text-[13px] font-bold text-amber-200 [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">Bram the Bold</span>
        {hp !== null ? <Bar value={hp.current} max={hp.max} from="#5cd66a" to="#2c8f38" label={`${Math.round(hp.current)} / ${hp.max}`} /> : null}
        {mana !== null ? <Bar value={mana.current} max={mana.max} from="#5fa8ff" to="#2a5fc0" label={`${Math.round(mana.current)} / ${mana.max}`} /> : null}
        {xp !== null && alive ? <Bar value={xp.current} max={xp.max} from="#e0c04a" to="#a07818" h="h-1.5" /> : null}
        <div className="mt-0.5 flex gap-3 text-[11px] font-bold text-slate-200">
          <span title="damage">⚔️ {dmg - 3}-{dmg + 6}</span>
          <span title="armor">🛡️ {armor}</span>
          <span title="move speed">👢 1.0</span>
        </div>
      </div>
    </div>
  );
}

/** The army row: a live portrait per fielded unit with its health, capped with a +N overflow. */
function ArmyRow() {
  const hud = useHud();
  const shown = hud.army.slice(0, 10);
  const overflow = hud.army.length - shown.length;
  if (hud.army.length === 0) {
    return <div className="flex h-full items-center px-2 text-[11px] italic text-slate-500">No troops afield — train Footmen (W)</div>;
  }
  return (
    <div className="flex flex-wrap content-center gap-1">
      {shown.map((u: ArmyUnit) => (
        <div key={u.id} className="flex w-9 flex-col items-center gap-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-amber-700/60 bg-gradient-to-b from-slate-700/70 to-slate-950/90 text-lg">{UNIT_ICON[u.kind] ?? "⚔️"}</div>
          <Bar value={u.hp} max={u.max} from="#5cd66a" to="#2c8f38" h="h-1" />
        </div>
      ))}
      {overflow > 0 ? <div className="flex h-9 items-center px-1 text-[11px] font-bold text-amber-200">+{overflow}</div> : null}
    </div>
  );
}

/** A vertical strip of map glyphs beside the minimap — the WC3 map-controls column (display-only). */
function MapControls() {
  const glyphs = ["📜", "🧑‍🤝‍🧑", "◎", "⛰"];
  return (
    <div className="flex flex-col gap-1">
      {glyphs.map((g) => (
        <div key={g} className="flex h-6 w-6 items-center justify-center rounded border border-amber-800/60 bg-slate-900/70 text-xs text-amber-300/80">{g}</div>
      ))}
    </div>
  );
}

function ProductionLine() {
  const hud = useHud();
  const bits: string[] = [];
  if (hud.producing > 0) bits.push(`⚒ Training ×${hud.producing}`);
  if (hud.building > 0) bits.push(`🏗 Building ×${hud.building}`);
  if (hud.researching > 0) bits.push(`📖 Research ×${hud.researching}`);
  if (bits.length === 0) return null;
  return (
    <div className="flex items-center gap-3 text-[10px] font-semibold text-amber-200/90">
      {bits.map((b) => <span key={b}>{b}</span>)}
      {hud.producing > 0 ? (
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/60"><div className="h-full bg-amber-400" style={{ width: `${Math.round(hud.trainProgress * 100)}%` }} /></div>
      ) : null}
    </div>
  );
}

/** The full bottom console: minimap · hero + army · command grid · relic satchel. */
function Console() {
  const hud = useHud();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 px-2 pb-1 font-serif">
      {/* Minimap cluster */}
      <div className={"pointer-events-auto relative flex items-stretch gap-2 p-2 " + FRAME}>
        <Corners />
        <MapControls />
        <div className="relative rounded border border-amber-800/60 bg-black/50 p-1">
          <Minimap />
          <span className="pointer-events-none absolute right-1 top-1 text-[9px] font-bold text-amber-200/70">N</span>
        </div>
      </div>

      {/* Hero + army */}
      <div className={"pointer-events-auto relative flex flex-col gap-1.5 p-2.5 " + FRAME}>
        <Corners />
        <HeroPanel />
        <div className="h-px w-full bg-amber-800/40" />
        <div className="h-[46px] w-[19rem]"><ArmyRow /></div>
        <ProductionLine />
      </div>

      {/* Command grid */}
      <div className={"pointer-events-auto relative p-2.5 " + FRAME}>
        <Corners />
        <CommandGrid />
      </div>

      {/* Relic satchel (hero has no items yet — the frame is the promise) */}
      <div className={"pointer-events-auto relative flex flex-col justify-center gap-1 p-2 " + FRAME}>
        <Corners />
        <div className="mb-0.5 text-center text-[9px] font-bold uppercase tracking-widest text-amber-500/70">Relics</div>
        <div className="grid grid-cols-2 grid-rows-3 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-8 rounded border border-amber-900/60 bg-black/40 shadow-inner" />
          ))}
        </div>
      </div>

      {hud.buildArmed !== null ? (
        <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border-2 border-amber-400/70 bg-amber-500/95 px-3 py-1 text-xs font-bold text-slate-900 shadow-lg">
          Right-click your side of the field to place the {BUILD_LABELS[hud.buildArmed] ?? "building"}
        </div>
      ) : null}
    </div>
  );
}

function EndOverlay() {
  const hud = useHud();
  if (hud.phase === "playing") return null;
  const won = hud.phase === "won";
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className={"rounded-2xl border-2 px-12 py-8 text-center font-serif shadow-2xl backdrop-blur-sm " + (won ? "border-emerald-400/60 bg-emerald-800/85 text-white" : "border-rose-400/60 bg-rose-900/85 text-white")}>
        <div className="text-5xl font-black tracking-tight">{won ? "Victory" : "Defeat"}</div>
        <div className="mt-2 text-sm opacity-90">{won ? "The Marauder Warcamp lies in ruins." : "Ironhold Keep has fallen."}</div>
      </div>
    </div>
  );
}

export function RtsHud(): ReactNode {
  return (
    <>
      <TopBar />
      <ObjectivesPanel />
      <Console />
      <EndOverlay />
    </>
  );
}
