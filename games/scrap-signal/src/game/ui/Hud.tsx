/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, useRef } from "@jgengine/core/ui/jsx";
import { RuneGlyph, RuneLabel, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, runePulse } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { lootDropsOf } from "@jgengine/core/game/events";
import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import { usePlayerFov } from "@jgengine/core/camera/PlayerFov.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useEntityStat, useFeed, useGame, useGameStore, useInventory, useQuestJournal } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { AMMO_LABELS, AMMO_STAT_IDS } from "../ammo";
import { CHARACTERS } from "../characters";
import { activePerkBuffs } from "../combat/gunPerks";
import { itemNameById } from "../content";
import { lastHit, lastHurtAtMs } from "../feel";
import { handlingView } from "../handling";
import { gunById, isReloading, magLoaded, perkLines, type PerkLine } from "../handroll";
import { mastReadoutStore } from "../mast";
import { ELEMENT_COLORS, RARITY_COLORS } from "../palette";
import { NPCS, objectiveLabel, scrapQuestById } from "../quests/catalog";
import { characterIdStore, currentZoneStore, lastPickupStore, reactorOpenStore, reserveStore, selectedSlotStore, speechStore } from "../stores";
import { useCompact, C, FULL, Hull, Icon, idleFade, Label, Pips, Plate, Row, Small, Stamp, Text, Tube, Button } from "./kit";

const PIPS = 12;
const stat = (ctx: GameContext, id: string) => ctx.scene.entity.stats.get(ctx.player.userId, id);
const gameMs = (ctx: GameContext) => ctx.time.now() * 1000;
/** True while `atMs` is within `windowMs` of game time. */
const within = (ctx: GameContext, atMs: number | undefined, windowMs: number) => { if (atMs === undefined) return false; const age = gameMs(ctx) - atMs; return age >= 0 && age <= windowMs; };

/**
 * The reclaimer's wrist unit: level and chassis tag on the housing, shield and health as lit pip rows
 * on the tube, experience as a thin trace under them. It dims out of a fight and holds full strength
 * while hostiles are near, the shield is recharging or health is low.
 */
export function VitalsPlate({ combat }: { combat: () => boolean }) {
  const ctx = useGameContext();
  const level = Math.round(useEntityStat(ctx.player.userId, "level")?.current ?? 1);
  const points = Math.round(useEntityStat(ctx.player.userId, "skillPoints")?.current ?? 0);
  const character = CHARACTERS.find(c => c.id === useStore(characterIdStore));
  const hp = () => stat(ctx, "health")?.current ?? 0, hpMax = () => stat(ctx, "health")?.max ?? 1;
  const sh = () => stat(ctx, "shield")?.current ?? 0, shMax = () => stat(ctx, "shield")?.max ?? 1;
  const low = () => hp() / Math.max(1, hpMax()) < 0.3;
  const fade = useMemo(() => idleFade(() => `${litFor(sh(), shMax())}:${litFor(hp(), hpMax())}:${level}:${points}`, () => combat() || low() || sh() < shMax(), 0.5, 5000), [ctx, level, points]);
  const { compact } = useCompact();
  return <Plate opacity={fade} width={compact ? 220 : 250} gap={compact ? 4 : 6} padding={compact ? 7 : 10} border={bind(() => ({ width: 2, color: low() ? C.red : "#4a3b29" }))}>
    <Row>
      <RuneView width={30} height={30} fill={character?.color ?? C.amber} justify="center" items="center"><Text family="Russo One" size={16} color="#0c0a09">{String(level)}</Text></RuneView>
      <RuneView grow={1} gap={0}><Text family="Russo One" size={14}>{(character?.name ?? "Reclaimer").toUpperCase()}</Text><Small size={10}>{character?.className ?? "Reclaimer"}</Small></RuneView>
      {points > 0 ? <Stamp tone="phosphor">{`K · +${points} pts`}</Stamp> : null}
    </Row>
    <Tube gap={5}>
      <Gauge label="SHD" value={sh} max={shMax} color={() => C.shield} />
      <Gauge label="HP" value={hp} max={hpMax} color={() => low() ? (Math.floor(performance.now() / 300) % 2 === 0 ? C.red : "#7a1d16") : C.red} />
      <RuneView height={3} width={FULL} fill={C.off}><RuneView height={3} fill={C.xp} width={bind(() => { const xp = stat(ctx, "xp"); return { fraction: xp === null || xp.max <= 0 ? 0 : Math.max(0, Math.min(1, xp.current / xp.max)) }; })} /></RuneView>
    </Tube>
  </Plate>;
}
const litFor = (value: number, max: number) => Math.ceil((value / Math.max(1, max)) * PIPS);
function Gauge({ label, value, max, color }: { label: string; value: () => number; max: () => number; color: () => string }) {
  return <Row gap={6}><Label width={26} color={C.phosphor}>{label}</Label><Pips value={value} max={max} count={PIPS} color={color} /><RuneLabel value={bind(value)} format={n => String(Math.ceil(n))} size={13} color={C.phosphor} /></Row>;
}

/** Magazine, reserve and grenades for the held gun; numbers bound at their leaves. */
export function AmmoPlate({ combat }: { combat: () => boolean }) {
  const ctx = useGameContext();
  const selected = useStore(selectedSlotStore);
  const slots = useInventory("hotbar");
  const gun = gunById(slots[selected]?.itemId ?? "");
  const fade = useMemo(() => idleFade(() => gun === undefined ? "" : `${gun.id}:${magLoaded(ctx, gun)}:${isReloading(ctx, gun)}:${stat(ctx, AMMO_STAT_IDS[gun.ammo])?.current}:${stat(ctx, "grenades")?.current}`,
    () => combat() || (gun !== undefined && (isReloading(ctx, gun) || magLoaded(ctx, gun) === 0)), 0.5, 5000), [ctx, gun]);
  const { compact } = useCompact();
  if (gun === undefined) return <Plate padding={[4, 8, 4, 8]}><Label color={C.dim}>No weapon · find a gun</Label></Plate>;
  const loaded = () => magLoaded(ctx, gun), reloading = () => isReloading(ctx, gun);
  return <Hull opacity={fade} width={compact ? 240 : 260} gap={compact ? 4 : 6} padding={compact ? 7 : 10} border={{ width: 2, color: RARITY_COLORS[gun.rarity] }}>
    <RuneView gap={1}>
      <Text family="Russo One" size={compact ? 13 : 15} color={RARITY_COLORS[gun.rarity]}>{gun.name}</Text>
      {compact ? null : <Small size={11}>{`${gun.manufacturer} ${gun.family} · lv${gun.level} · ${gun.weapon.damage} dmg`}</Small>}
      {compact || gun.element === "none" ? null : <Small size={11} color={ELEMENT_COLORS[gun.element]}>{gun.element}</Small>}
    </RuneView>
    <Row>
      <Tube layout="row" items="end" gap={6} grow={1}>
        <Text family="Russo One" size={compact ? 22 : 30} color={bind(() => reloading() ? C.dim : loaded() === 0 ? C.red : C.phosphor)} text={bind(() => reloading() ? "--" : String(loaded()).padStart(2, "0"))} />
        <Text size={14} color={C.phosphorDim} text={bind(() => `/ ${Math.round(stat(ctx, AMMO_STAT_IDS[gun.ammo])?.current ?? 0)}`)} />
      </Tube>
      <RuneView gap={4} items="end">
        <Row gap={4}><Icon name="bomb" color={C.amber} /><Text size={14} text={bind(() => String(Math.round(stat(ctx, "grenades")?.current ?? 0)))} /></Row>
        <Small size={10}>{AMMO_LABELS[gun.ammo].toUpperCase()}</Small>
      </RuneView>
    </Row>
    <Pips value={() => reloading() ? 0 : loaded()} max={() => gun.magSize} count={Math.min(gun.magSize, 24)} color={C.amber} width={Math.max(4, Math.floor((compact ? 222 : 236) / Math.min(gun.magSize, 24)) - 2)} height={compact ? 4 : 6} />
    <Text size={12} color={C.red} text={bind(() => activePerkBuffs(ctx, gun).map(b => `${b.label}${b.stacks > 1 ? ` x${b.stacks}` : ""} · ${Math.ceil(b.leftMs / 1000)}s`).join("   ").toUpperCase())} />
    {compact ? null : <Small size={11} text={bind(() => reloading() ? "Reloading…" : loaded() === 0 ? "Empty · R to reload" : "R reload · G grenade")} />}
  </Hull>;
}

/** The weapon cartridges slotted into the forearm rig; the live one rides up and lights. */
export function WeaponHotbar({ combat }: { combat: () => boolean }) {
  const ctx = useGameContext();
  const selected = useStore(selectedSlotStore);
  const slots = useInventory("hotbar");
  const ids = [0, 1, 2, 3].map(i => slots[i]?.itemId ?? "");
  const fade = useMemo(() => idleFade(() => `${selected}:${ids.join()}`, combat, 0.4, 4000), [ctx, selected, ids.join()]);
  const { compact } = useCompact();
  return <Row opacity={fade} gap={4} items="end">{ids.map((id, index) => {
    const gun = gunById(id), active = index === selected;
    return <RuneView key={index} width={compact ? 64 : 84} height={compact ? 36 : 42} clip padding={[3, 6, 3, 6]} gap={1} y={active ? -4 : 0} fill={active ? "#2a2118f2" : "#110e0bcc"} border={{ width: active ? 2 : 1, color: gun === undefined ? "#3b3f44" : RARITY_COLORS[gun.rarity] }}>
      <Label color={active ? C.amber : C.dim}>{String(index + 1)}</Label>
      <Text size={10} color={gun === undefined ? C.faint : C.ink}>{gun === undefined ? "empty" : gun.family.toUpperCase()}</Text>
    </RuneView>;
  })}</Row>;
}

/** The pickup scan: the new gun's numbers on a tube for five seconds after it is picked up. */
export function ItemCard() {
  const ctx = useGameContext();
  const pickup = useStore(lastPickupStore);
  const gun = pickup === null ? undefined : gunById(pickup.gunId);
  if (pickup === null || gun === undefined) return null;
  const rows: [string, string, string?][] = [["Damage", `${gun.weapon.damage}${gun.weapon.pellets !== undefined ? ` ×${gun.weapon.pellets}` : ""}`], ["Fire rate", `${(1000 / gun.weapon.fireIntervalMs).toFixed(1)}/s`], ["Magazine", String(gun.magSize)], ["Crit", `${Math.round(gun.weapon.critChance * 100)}% ×${gun.weapon.critMult}`]];
  if (gun.element !== "none") rows.push(["Element", gun.element, ELEMENT_COLORS[gun.element]]);
  return <Hull width={250} hidden={bind(() => !within(ctx, pickup.atMs, 5000))} border={{ width: 2, color: RARITY_COLORS[gun.rarity] }}>
    <Stamp tone="phosphor">Pickup scan</Stamp>
    <Text family="Russo One" size={16} color={RARITY_COLORS[gun.rarity]}>{gun.name}</Text>
    <Small>{`${gun.rarity} ${gun.manufacturer} ${gun.family} · level ${gun.level}`}</Small>
    <Tube layout="grid" columns={2} gap={3}>{rows.flatMap(([k, v, color]) => [<Small key={`${k}k`} color={color ?? C.phosphorDim}>{k}</Small>, <Text key={`${k}v`} size={13} color={color ?? C.phosphor}>{v}</Text>])}</Tube>
    <PerkList perks={perkLines(gun)} />
  </Hull>;
}

/**
 * A gun's perks: a named legendary's signature in red text with its flavor line and the boss that
 * farms it, rolled perks as stamped steel chips with their one-line read.
 */
export function PerkList({ perks }: { perks: readonly PerkLine[] | undefined }) {
  if (perks === undefined || perks.length === 0) return null;
  return <RuneView gap={4}>{perks.map(perk => perk.signature
    ? <RuneView key={perk.id} gap={1}><Small color="#ff8a7a">{`"${perk.flavor}"`}</Small><Text size={13} color={C.red}>{perk.name}</Text><Small>{perk.text}</Small>{perk.dropsFrom === undefined ? null : <Stamp tone="dim">{`Drops from ${perk.dropsFrom}`}</Stamp>}</RuneView>
    : <RuneView key={perk.id} padding={[3, 6, 3, 6]} fill="#2b3036" border={{ width: 1, color: "#1b1f25" }} gap={1}><Text size={12}>{perk.name}</Text><Small size={11}>{perk.text}</Small></RuneView>)}
  </RuneView>;
}

/** The tracker splits its column: one full card for the current objective, a title line per other quest. */
export function splitTrackedQuests<T>(active: readonly T[]): { primary: T | undefined; others: readonly T[] } {
  return { primary: active[0], others: active.slice(1) };
}

/** The Mast Watch contract's live objective, timer and outcome, as the first entry on the log. */
function MastCard() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const mast = useStore(mastReadoutStore, m => m === null ? null : { title: m.title, status: m.status, label: m.label, step: m.step, steps: m.steps, outcome: m.outcome, reason: m.reason, count: m.count });
  if (mast === null) return null;
  const active = mast.status === "active";
  return <RuneView gap={3} padding={[0, 0, 6, 0]}>
    <Row justify="between"><Text size={13} color={C.amber}>{mast.title.toUpperCase()}</Text><Small>{`${mast.step}/${mast.steps}`}</Small></Row>
    <Small color={C.ink}>{active ? mast.label : mast.outcome === "done" ? "Mast held. $450 + 2 cores paid." : (mast.reason ?? "Contract failed.")}</Small>
    {active ? <Row justify="between">
      <Small color={C.phosphor} text={bind(() => { const m = mastReadoutStore.read(ctx); return m !== null && m.count > 0 ? `${m.counted} / ${m.count}` : "signal"; })} />
      <Small color={C.phosphor} text={bind(() => { const r = mastReadoutStore.read(ctx)?.remaining; return r === null || r === undefined ? "" : `${Math.ceil(r)}s`; })} />
    </Row> : <Button onPress={() => commands.run("mast.dismiss", {})}>Dismiss contract</Button>}
  </RuneView>;
}

/** The mission log hung top-left: the contract card, the current objective and other active quests. */
export function MissionTracker() {
  const journal = useQuestJournal();
  const active = journal.filter(entry => entry.status === "active");
  const progress = active.map(entry => `${entry.questId}:${entry.objectives.map(o => o.progress).join(",")}`).join("|");
  const fade = useMemo(() => idleFade(() => progress, () => false, 0.5, 9000), [progress]);
  const { compact } = useCompact();
  const { primary, others } = splitTrackedQuests(active);
  const def = primary === undefined ? undefined : scrapQuestById(primary.questId);
  const finished = primary !== undefined && primary.objectives.every(o => o.progress >= o.count);
  const returnTo = def === undefined || def.turnIn === "radio" ? null : NPCS[def.turnIn].name;
  return <Plate opacity={fade} width={compact ? 200 : 260} gap={compact ? 3 : 5} padding={compact ? 7 : 10}>
    <Stamp>Mission log</Stamp>
    <MastCard />
    {active.length === 0 ? <Small color={C.ink}>No mission · find someone with a "Talk" prompt [E]</Small> : null}
    {primary === undefined || def === undefined ? null : <RuneView gap={3}>
      <Text size={13} color={C.amber}>{def.title.toUpperCase()}</Text>
      {primary.objectives.map(objective => {
        const done = objective.progress >= objective.count, goal = def.objectives.find(c => c.id === objective.id);
        return <Row key={objective.id} justify="between" items="start"><Small grow={1} shrink color={done ? C.xp : C.ink}>{`${done ? "✓" : "▸"} ${goal === undefined ? objective.id : objectiveLabel(goal)}`}</Small><Small color={C.phosphor}>{`${Math.min(objective.progress, objective.count)} / ${objective.count}`}</Small></Row>;
      })}
      {finished && returnTo !== null ? <Small color={C.ink}>{`▸ Return to ${returnTo}`}</Small> : null}
    </RuneView>}
    {others.map(entry => { const d = scrapQuestById(entry.questId); return d === undefined ? null : <Small key={entry.questId}>{`+ ${d.title}`}</Small>; })}
  </Plate>;
}

/** Bolt's field notes: the onboarding's current step, with Next and Hide. */
export function FieldNotes() {
  const { commands } = useGame();
  const view = useGameStore(c => {
    const runtime = onboardingOf(c), run = runtime?.run();
    if (runtime === null || run === undefined || run.isFinished()) return null;
    const current = run.current(), tracked = run.tracked();
    return { title: runtime.config.title ?? tracked.title, skippable: runtime.config.skippable !== false, next: current !== null && "next" in current.step.done, detail: current?.step.detail,
      steps: tracked.objectives.map(o => ({ id: o.id, label: o.label, done: o.progress >= o.count, current: o.id === current?.step.id })) };
  }, (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const { compact } = useCompact();
  if (view === null) return null;
  const at = Math.max(0, view.steps.findIndex(s => s.current));
  return <Plate width={compact ? 200 : 260} gap={compact ? 3 : 4} padding={compact ? 7 : 10}>
    <Stamp tone="phosphor">{`${view.title} · ${at + 1} of ${view.steps.length}`}</Stamp>
    {view.steps.slice(at, compact ? at + 1 : at + 2).map(s => <Small key={s.id} color={s.current ? C.ink : C.dim}>{`${s.done ? "✓" : "▸"} ${s.label}`}</Small>)}
    {view.detail === undefined || compact ? null : <Small>{view.detail}</Small>}
    <Row gap={6}>
      {view.next ? <Button onPress={() => void commands.run("onboarding.next", {})}>Next</Button> : null}
      {view.skippable ? <Button minHeight={compact ? 28 : 40} onPress={() => void commands.run("onboarding.skip", {})}>Hide notes</Button> : null}
    </Row>
  </Plate>;
}

/** A small carbon counter with an odometer window, for the cash and cores readouts. */
export function Counter({ icon, color, label, read }: { icon: "coin" | "gem"; color: string; label: string; read: (ctx: GameContext) => number }) {
  const ctx = useGameContext();
  const fade = useMemo(() => idleFade(() => String(read(ctx)), () => false, 0.5, 6000), [ctx]);
  return <Plate layout="row" items="center" gap={6} padding={[4, 8, 4, 8]} opacity={fade} label={label}>
    <Icon name={icon} color={color} /><Text family="Russo One" size={15} color={C.phosphor} text={bind(() => String(read(ctx)).padStart(4, "0"))} />
  </Plate>;
}
export const cashOf = (ctx: GameContext) => ctx.game.economy.balance(ctx.player.userId, "cash");
export const coresOf = (ctx: GameContext) => ctx.game.economy.balance(ctx.player.userId, "cores");

/** The newest loot lines, beside the wallet. */
export function LootToasts() {
  const entries = useFeed({ action: "loot.granted", limit: 4 });
  return <RuneView gap={3} items="end">{[...entries].reverse().map((entry, index) => {
    const text = lootDropsOf(entry.data).map(d => `+${d.count} ${d.item !== undefined ? itemNameById(d.item) : "$"}`).join("   ");
    return text === "" ? null : <RuneView key={`${entry.at}-${index}`} padding={[2, 8, 2, 8]} fill="#0c0a09cc" border={{ width: 1, color: "#8ee43e66" }}><Text size={12} color={C.xp}>{text}</Text></RuneView>;
  })}</RuneView>;
}

/** The new zone's name across the top for four seconds. */
export function ZoneBanner() {
  const ctx = useGameContext();
  const zone = useStore(currentZoneStore);
  if (zone === null) return null;
  const phone = useCompact().compact;
  return <RuneView items="center" gap={2} hidden={bind(() => !within(ctx, zone.atMs, 4000))} opacity={bind(() => { const age = gameMs(ctx) - zone.atMs; return Math.max(0, Math.min(1, age / 300, (4000 - age) / 500)); })}>
    <Text family="Russo One" size={phone ? 20 : 28} tracking={3} color={C.amber}>{zone.name.toUpperCase()}</Text>
    <Label color={C.ink}>{`Recommended level ${zone.level}`}</Label>
  </RuneView>;
}

/** An incoming transmission from a crewmate, on the rig's radio strip. */
export function EchoBox() {
  const ctx = useGameContext();
  const { compact } = useCompact();
  const line = useStore(speechStore);
  if (line === null) return null;
  return <Plate maxWidth={compact ? 280 : 460} gap={3} padding={compact ? 7 : 10} border={{ width: 2, color: "#2c4d4a" }} hidden={bind(() => !within(ctx, line.atMs, 12000))}>
    <Row gap={6}><RuneView width={7} height={7} radius={4} fill={C.xp} /><Label color={C.phosphor}>{`ECHO — ${line.speaker}`}</Label></Row>
    <Text size={compact ? 12 : 14}>{line.line}</Text>
  </Plate>;
}

/** The emergency reserve: the rig's tube flashes a reboot countdown across the middle of the view. */
export function ReserveOverlay() {
  const ctx = useGameContext();
  const { width, height } = useRuneViewport();
  const downed = useStore(reserveStore, r => r.phase === "downed");
  if (!downed) return null;
  const left = () => reserveStore.read(ctx).secondsLeft;
  return <RuneView anchor="fill" role="alert" radial={{ center: [0.5, 0.5], radius: [width * 0.75, height * 0.75], stops: [[0.45, "#00000000"], [1, "#b4180ccc"]] }}>
    <RuneView anchor="center" items="center" gap={8}>
      <Text family="Russo One" size={36} tracking={3} color={C.red}>REBOOT WINDOW!</Text>
      <Pips value={left} max={() => 12} count={12} color={C.red} width={14} height={12} />
      <Text size={14} text={bind(() => `Get a kill for a Power Surge — ${left().toFixed(1)}s`)} />
    </RuneView>
  </RuneView>;
}

/** Screen pixels from the centre to the edge of a cone `spread` rad wide, at a vertical FOV in degrees. */
export function spreadRadiusPx(spread: number, fovDeg: number, viewportHeight: number): number {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  return half <= 0 ? 0 : (Math.tan(Math.max(0, spread)) / half) * (viewportHeight / 2);
}

/**
 * The crosshair is the held gun's cone: its ticks sit where a round can land, so they open while the
 * gun blooms, while you move, and close as you aim or brace.
 */
export function SpreadReticle() {
  const ctx = useGameContext();
  const { fov } = usePlayerFov();
  const fovRef = useRef(fov);
  fovRef.current = fov;
  const { height } = useRuneViewport();
  const gap = () => {
    const view = handlingView(ctx);
    if (view === null) return 5;
    const zoom = 1 + ((view.presentation?.adsZoom ?? 1) - 1) * view.handling.adsProgress;
    return Math.round(Math.max(3, Math.min(90, spreadRadiusPx(view.handling.spread, fovRef.current * zoom, height))));
  };
  const opacity = () => 1 - (handlingView(ctx)?.handling.adsProgress ?? 0) * 0.35;
  const L = 10, T = 3, S = 200, M = S / 2;
  // The top tick carries an id so proof flows can read the drawn gap from the native tree.
  const tick = (vertical: boolean, sign: -1 | 1) => <RuneView {...(vertical && sign < 0 ? { id: "scrap-reticle-gap" } : {})} pin={[vertical ? M - T / 2 : M + (sign < 0 ? -L : 0), vertical ? M + (sign < 0 ? -L : 0) : M - T / 2, null, null]}
    width={vertical ? T : L} height={vertical ? L : T} fill="#fff4e2" border={{ width: 1, color: "#000000aa" }}
    {...(vertical ? { y: bind(() => sign * gap()) } : { x: bind(() => sign * gap()) })} />;
  return <RuneView anchor="center" width={S} height={S} opacity={bind(opacity)}>
    {tick(true, -1)}{tick(true, 1)}{tick(false, -1)}{tick(false, 1)}
    <RuneView pin={[M - 1.5, M - 1.5, null, null]} width={3} height={3} fill="#fff4e2" />
  </RuneView>;
}

const HIT_ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4 L9 9 M20 4 L15 9 M4 20 L9 15 M20 20 L15 15" stroke="#ffffff" stroke-width="2.6" stroke-linecap="square"/></svg>`;
/** The hit marker: a cross that pops and fades over 220 ms, red on a kill, amber on a crit. */
export function HitMarker() {
  const ctx = useGameContext();
  const age = () => gameMs(ctx) - lastHit().atMs;
  const shown = () => { const a = age(); return a >= 0 && a <= 220; };
  return <RuneView anchor="center" items="center" gap={30} opacity={bind(() => shown() ? 1 - Math.max(0, age() - 150) / 70 : 0)} scale={bind(() => shown() ? 1.6 - 0.6 * Math.min(1, age() / 150) : 1)}>
    <RuneGlyph artwork={HIT_ART} size={26} color={bind(() => lastHit().kill ? "#e23c2e" : lastHit().crit ? C.amber : "#f5f0e6")} />
    <Label color="#fb7185" hidden={bind(() => !lastHit().kill)}>Kill confirmed</Label>
  </RuneView>;
}

/** The red edge on a hurt: fades over 450 ms. */
export function DamageVignette() {
  const ctx = useGameContext();
  const { width, height } = useRuneViewport();
  return <RuneView anchor="fill" radial={{ center: [0.5, 0.5], radius: [width * 0.75, height * 0.75], stops: [[0.6, "#be1e1000"], [1, "#be1e10cc"]] }}
    opacity={bind(() => Math.max(0, Math.min(1, 1 - (gameMs(ctx) - lastHurtAtMs()) / 450)))} />;
}

/** Level up: a ring and the new level, pulsed by the level stat itself. */
export function LevelUpBurst() {
  const ctx = useGameContext();
  const level = () => stat(ctx, "level")?.current ?? 1;
  const pulse = useMemo(() => runePulse(level, 2200), [ctx]);
  return <RuneView anchor="center" items="center" gap={4} opacity={bind(() => Math.min(1, pulse.get() * 3))} scale={bind(() => 0.9 + 0.1 * Math.min(1, (1 - pulse.get()) * 6))}>
    <RuneView width={90} height={90} radius={45} border={{ width: 4, color: C.amber }} scale={bind(() => 0.6 + (1 - pulse.get()) * 1.2)} opacity={bind(() => pulse.get())} />
    <Text family="Russo One" size={36} tracking={4} color="#fcd34d">LEVEL UP!</Text>
    <Label color={C.ink} text={bind(() => `Level ${Math.round(level())} · +1 skill point`)} />
  </RuneView>;
}

/** The reactor's fall: a sixteen-second ending card. */
export function ReactorEnding() {
  const ctx = useGameContext();
  const reactor = useStore(reactorOpenStore);
  const { width, height } = useRuneViewport(), phone = width < 600;
  if (reactor === null) return null;
  return <RuneView anchor="fill" justify="center" items="center" gap={10} padding={24} hidden={bind(() => !within(ctx, reactor.atMs, 16000))}
    radial={{ center: [0.5, 0.5], radius: [width * 0.8, height * 0.8], stops: [[0.4, "#ffb40000"], [1, "#ffb40044"]] }}>
    <Text family="Russo One" size={phone ? 28 : 44} tracking={4} align="center" color="#fcd34d">THE COLOSSUS FALLS</Text>
    <Text size={14} align="center" maxWidth={480}>The Reactor opens. Legendary loot rains onto Ember Gate — Ferralon is yours to keep farming, Reclaimer.</Text>
  </RuneView>;
}

