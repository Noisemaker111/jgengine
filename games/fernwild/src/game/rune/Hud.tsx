/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import { libraryIconUrl } from "@jgengine/assets/library/libraryIcons";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { subscribeFrameBind } from "@jgengine/core/ui/liveBind.view";
import { useMarkers } from "@jgengine/core/map/map.view";
import type { MarkerView } from "@jgengine/core/map/markers";
import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import { RuneAction, RuneGlyph, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, type RuneSource } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { baseView } from "../base";
import { HOTBAR } from "../bags";
import { broodView } from "../broodmother";
import { bodyView } from "../deathBody";
import { dossierView } from "../dossier";
import { itemLabel } from "../data/items";
import { PORTAL_RANGE } from "../data/bosses";
import { VITAL_ICON } from "../data/itemIcons";
import { ISLAND_MARKS, islandBake, islandMarks } from "../islandMap";
import { pickupFeed } from "../pickupFeed";
import { extendedHud, openScreen } from "../screens";
import { cardShape, CreatureReadout } from "./Creature";
import { glyphArtwork, ItemIcon } from "./ItemIcon";
import { BAD, CYAN, FULL, GOLD, GOOD, GREEN, INK, PURPLE, Panel, Row, Small, Tag, Text } from "./kit";
import { imageUrl, liveCreatures, liveSurvivor, same } from "./live";

/** The thermometer's span: empty at -10 °C, full at 45 °C. */
const COLDEST = -10;
const HOTTEST = 45;
const WEATHER_WORD: Record<string, string> = { rain: "Rain", snow: "Snow", mixed: "Sleet", dust: "Dust" };

/** Vital icon artwork, loaded once per page from the shipped game-icons.net files. */
function useVitalArt(): Record<string, string | null> {
  const ctx = useGameContext();
  const art = useGameStore(() => vitalArt.value);
  useEffect(() => {
    if (vitalArt.started || typeof location === "undefined") return;
    vitalArt.started = true;
    void Promise.all(
      Object.entries(VITAL_ICON).map(([id, key]) =>
        fetch(resolveAssetBaseUrl(libraryIconUrl(key)))
          .then((response) => (response.ok ? response.text() : ""))
          .then((svg) => [id, glyphArtwork(svg)] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((entries) => {
      vitalArt.value = Object.fromEntries(entries);
      ctx.touch();
    });
  }, [ctx]);
  return art;
}
const vitalArt: { started: boolean; value: Record<string, string | null> } = { started: false, value: {} };

type VitalId = keyof typeof VITAL_ICON;
interface Vital {
  id: VitalId;
  label: (ctx: GameContext) => string;
  value: (ctx: GameContext) => number;
  max: (ctx: GameContext) => number;
  warn: (ctx: GameContext) => boolean;
  text?: (ctx: GameContext) => string;
  color?: string;
}
const s = liveSurvivor;
const VITALS: Record<VitalId, Vital> = {
  temperature: {
    id: "temperature",
    label: (ctx) => { const v = s(ctx); return `${v.weather === "clear" ? "Temperature" : WEATHER_WORD[v.weather]}${v.indoors ? " (indoors)" : v.sheltered && v.weather !== "clear" ? " (sheltered)" : ""}`; },
    value: (ctx) => s(ctx).temperature - COLDEST,
    max: () => HOTTEST - COLDEST,
    warn: (ctx) => s(ctx).comfort !== "comfortable",
    text: (ctx) => `${s(ctx).temperature}°C`,
  },
  xp: { id: "xp", label: (ctx) => `Level ${s(ctx).level}`, value: (ctx) => s(ctx).xp - s(ctx).xpFrom, max: (ctx) => Math.max(1, s(ctx).xpNext - s(ctx).xpFrom), warn: () => false, color: "#8fdc6a" },
  weight: { id: "weight", label: () => "Weight", value: (ctx) => s(ctx).weight.value, max: (ctx) => s(ctx).weight.max, warn: (ctx) => s(ctx).encumbered },
  water: { id: "water", label: () => "Water", value: (ctx) => s(ctx).water.value, max: (ctx) => s(ctx).water.max, warn: (ctx) => s(ctx).flags.includes("thirsty") },
  food: { id: "food", label: () => "Food", value: (ctx) => s(ctx).food.value, max: (ctx) => s(ctx).food.max, warn: (ctx) => s(ctx).flags.includes("hungry") },
  stamina: { id: "stamina", label: () => "Stamina", value: (ctx) => s(ctx).stamina.value, max: (ctx) => s(ctx).stamina.max, warn: () => false },
  oxygen: { id: "oxygen", label: () => "Oxygen", value: (ctx) => s(ctx).oxygen.value, max: (ctx) => s(ctx).oxygen.max, warn: (ctx) => s(ctx).oxygen.value <= s(ctx).oxygen.max * 0.25 },
  torpor: { id: "torpor", label: () => "Torpor", value: (ctx) => s(ctx).torpor.value, max: (ctx) => s(ctx).torpor.max, warn: () => false, color: PURPLE },
  health: { id: "health", label: () => "Health", value: (ctx) => s(ctx).health.value, max: (ctx) => s(ctx).health.max, warn: (ctx) => s(ctx).health.value <= 30 },
};

/** One pool: a glyph over a tile that fills from the bottom, red while it needs you; H prints the numbers under it. */
function VitalTile({ vital, art, size, detail }: { vital: Vital; art: string | null; size: number; detail: boolean }): ReactNode {
  const ctx = useGameContext();
  const share = () => Math.max(0, Math.min(1, vital.value(ctx) / Math.max(1e-6, vital.max(ctx))));
  const color = () => (vital.warn(ctx) ? BAD : (vital.color ?? CYAN));
  return (
    <RuneView items="center" gap={2} label={vital.id}>
      <RuneView width={size} height={size} radius={size / 2} fill="#0b1418cc" border={{ width: 1, color: "#ffffff22" }} clip tooltip={vital.id}>
        <RuneView pin={[0, null, 0, 0]} height={bind(() => size * share())} fill={bind(() => `${color()}66`)} />
        <RuneView pin={[0, 0, 0, 0]} justify="center" items="center">
          {art === null ? <Small color={bind(color)} text={vital.id.slice(0, 2).toUpperCase()} /> : <RuneGlyph artwork={art} size={size * 0.62} color={bind(color)} />}
        </RuneView>
      </RuneView>
      {detail ? <Small size={10} color={INK} text={bind(() => (vital.text?.(ctx) ?? `${Math.floor(vital.value(ctx))}/${Math.round(vital.max(ctx))}`))} /> : null}
      {detail ? <Small size={9} text={bind(() => vital.label(ctx))} /> : null}
    </RuneView>
  );
}

/** ARK's right-edge column: health at the foot and weight near the top; breath only once it runs out, torpor only while drugged. */
function Vitals(): ReactNode {
  const { width } = useRuneViewport();
  const phone = width < 600;
  const art = useVitalArt();
  const detail = useGameStore(extendedHud);
  const shown = useGameStore((ctx) => {
    const v = s(ctx);
    return { oxygen: v.underwater || v.oxygen.value < v.oxygen.max, torpor: v.torpor.value > 0, levelUp: v.statPoints > 0, hazards: v.hazards.join(" · ") };
  }, same);
  const order: VitalId[] = ["temperature", "xp", "weight", "water", "food", "stamina", ...(shown.oxygen ? (["oxygen"] as const) : []), ...(shown.torpor ? (["torpor"] as const) : []), "health"];
  const size = phone ? 26 : 34;
  return (
    <RuneView items="end" gap={6}>
      {shown.levelUp ? <Text weight={700} size={13} color={GOOD} fill="#0b141899" radius={4} padding={[2, 6, 2, 6]} text="▲ Level up — press I" /> : null}
      {shown.hazards === "" ? null : <Text weight={700} size={13} color="#ff8a6a" fill="#0b141899" radius={4} padding={[2, 6, 2, 6]} text={shown.hazards} />}
      <RuneView gap={detail ? 4 : 6} items="end">
        {order.map((id) => <VitalTile key={id} vital={VITALS[id]} art={art[id] ?? null} size={size} detail={detail} />)}
      </RuneView>
    </RuneView>
  );
}

/** The hotbar: ten slots with their number keys, the held one lit. */
function Hotbar(): ReactNode {
  const ctx = useGameContext();
  const { width } = useRuneViewport();
  const slots = useGameStore((c) => c.player.inventory.state(HOTBAR).slots);
  const size = width < 600 ? 32 : 48;
  return (
    <Row gap={4}>
      {slots.map((slot, index) => (
        <RuneView key={index} width={size} height={size} variant="cell" label={slot === null ? `Hotbar ${index + 1} empty` : `Hotbar ${index + 1} ${itemLabel(slot.itemId)}`}
          border={bind(() => (s(ctx).activeSlot === index ? { width: 2, color: GOLD } : { width: 1, color: "#6fb7c944" }))}>
          {slot === null ? null : <ItemIcon itemId={slot.itemId} size={size - 8} />}
          <RuneView pin={[3, 1, null, null]}><Small size={10} color={INK} text={String((index + 1) % 10)} /></RuneView>
          {slot === null || slot.count <= 1 ? null : <RuneView pin={[null, null, 3, 1]}><Small size={10} weight={700} color={INK} text={String(slot.count)} /></RuneView>}
        </RuneView>
      ))}
    </Row>
  );
}

const NO_MARKS: readonly MarkerView[] = [];

/** A small map of the island round the survivor: the ground from above, the first-day goal starred, unread notes, obelisks, cave mouths and your tames. */
function MapCorner(): ReactNode {
  const ctx = useGameContext();
  const { width } = useRuneViewport();
  const onboarding = onboardingOf(ctx);
  const goal = useMarkers(onboarding?.markers ?? NO_MARKS);
  const marks = useGameStore(islandMarks, same);
  const bake = useMemo(() => islandBake(ctx), [ctx]);
  const markers = useMemo(() => [...goal, ...marks], [goal, marks]);
  const size = width < 600 ? 112 : 170;
  const radius = 180;
  const span = bake.mapBounds.maxX - bake.mapBounds.minX;
  const image = (size * span) / (radius * 2);
  const me = () => ctx.scene.entity.get(ctx.player.userId);
  const toMap = (x: number, z: number) => {
    const at = me()?.position ?? [0, 0, 0];
    return [size / 2 + ((x - at[0]) / (radius * 2)) * size, size / 2 + ((z - at[2]) / (radius * 2)) * size] as const;
  };
  return (
    <RuneView gap={3} items="end" label="Island map">
      <RuneView width={size} height={size} radius={6} clip border={{ width: 1, color: "#6fb7c977" }} fill="#0b1418">
        <RuneView pin={[0, 0, null, null]} width={image} height={image} maxWidth={image} image={imageUrl(bake.background)} fit="cover"
          x={bind(() => size / 2 - (((me()?.position[0] ?? 0) - bake.mapBounds.minX) / span) * image)}
          y={bind(() => size / 2 - (((me()?.position[2] ?? 0) - bake.mapBounds.minZ) / span) * image)} />
        {markers.map((marker) => {
          const style = ISLAND_MARKS[marker.kind ?? "location"] ?? ISLAND_MARKS["location"];
          const at = () => toMap(marker.position[0], marker.position[2]);
          const inside = () => { const [x, y] = at(); return x >= 4 && y >= 4 && x <= size - 4 && y <= size - 4; };
          return (
            <RuneView key={marker.id} pin={[0, 0, null, null]} width={14} height={14} justify="center" items="center" x={bind(() => at()[0] - 7)} y={bind(() => at()[1] - 7)} opacity={bind(() => (inside() ? 1 : 0))}>
              <Text size={12} weight={700} color={style?.color ?? INK} text={style?.glyph ?? "●"} />
            </RuneView>
          );
        })}
        <RuneView pin={[size / 2 - 6, size / 2 - 6, null, null]} width={12} height={12} fill="#4ade80"
          shape={bind(() => { const yaw = me()?.rotationY ?? 0; const point = (a: number, r: number) => [6 + Math.sin(yaw + a) * r, 6 + Math.cos(yaw + a) * r] as const; return { viewBox: [12, 12] as const, points: [point(0, 6), point(2.5, 5), point(Math.PI, 2), point(-2.5, 5)] }; })} />
      </RuneView>
      <Tag size={10} text="Island" />
    </RuneView>
  );
}

/** ARK's item lines under the top edge: "ADDED: 3x Thatch" in cyan, "CONSUMED" in yellow, fading out. */
function PickupLines(): ReactNode {
  const ctx = useGameContext();
  const ticker = pickupFeed(ctx);
  const LINE_MS = 4000;
  const source = useMemo(() => {
    let list: { id: string; expiresAt: number; kind: string; text: string; icon: string | undefined }[] = [];
    let stale = true;
    const listeners = new Set<() => void>();
    const changed = () => { stale = true; for (const listener of listeners) listener(); };
    const unsubscribe = ticker.subscribe(changed);
    return {
      read: () => {
        if (stale) {
          stale = false;
          list = ticker.recent().slice().reverse().map((entry) => ({ id: String(entry.id), expiresAt: entry.at + LINE_MS, kind: entry.kind, text: entry.text, icon: entry.icon }));
        }
        return list;
      },
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      expire: changed,
      dispose: unsubscribe,
    };
  }, [ticker]);
  useEffect(() => source.dispose, [source]);
  const now = () => ctx.time.now() * 1000;
  return (
    <RuneView items="center" gap={2}>
      <RuneTransient source={source} expire={source.expire} now={now}>
        {(entry) => (
          <Row gap={6} fill="#0b141888" radius={4} padding={[2, 8, 2, 4]} opacity={bind(() => Math.max(0, Math.min(1, (entry.expiresAt - now()) / 1000)))}>
            {entry.icon === undefined ? null : <ItemIcon itemId={entry.icon} size={22} />}
            <Text size={15} weight={700} tracking={0.8} color={entry.kind === "consumed" ? "#f2d54b" : "#74e4ef"} text={entry.text} />
          </Row>
        )}
      </RuneTransient>
    </RuneView>
  );
}

/** The step-done banner ("Gather stone" / "Next: Craft a Stone Pick"), advanced each frame while the HUD shows. */
function Banner(): ReactNode {
  const ctx = useGameContext();
  const banner = onboardingOf(ctx)?.banner ?? null;
  useEffect(() => (banner === null ? undefined : subscribeFrameBind(() => banner.advance())), [banner]);
  if (banner === null) return null;
  const view = () => banner.current();
  const shown = () => { const v = view(); if (v === null) return 0; return v.phase === "in" ? v.progress : v.phase === "out" ? 1 - v.progress : 1; };
  return (
    <RuneView items="center" gap={2} opacity={bind(shown)} y={bind(() => (1 - shown()) * -10)}>
      <Text size={28} weight={600} family="Oswald" color={GOLD} text={bind(() => view()?.title ?? "")} />
      <Text size={15} color={INK} text={bind(() => view()?.subtitle ?? "")} />
    </RuneView>
  );
}

/** ARK's boss bar across the top: her name and health, the phase tell, and the portal and return clocks. */
function BossBar(): ReactNode {
  const ctx = useGameContext();
  const phase = useGameStore((c) => { const v = broodView(c); return { phase: v.phase, inside: v.inside, tier: v.tier }; }, same);
  if (phase.phase === "idle") return null;
  const view = () => broodView(ctx);
  const seconds = () => Math.ceil(view().secondsLeft ?? 0);
  if (phase.phase === "portal") {
    return (
      <Panel items="center" gap={4} fill="#0c0f0dcc" padding={[8, 14, 8, 14]}>
        <Text weight={700} color={GREEN} text={`${phase.tier} Broodmother summoned`} />
        <Small color={INK} text={bind(() => `The portal opens in ${seconds()} s · stand within ${PORTAL_RANGE} m of the Green Obelisk with your tames`)} />
      </Panel>
    );
  }
  if (!phase.inside) return null;
  const health = () => view().boss?.health ?? 0;
  return (
    <Panel items="center" gap={4} fill="#0c0f0dcc" padding={[8, 14, 8, 14]} width={448} responsive={{ phone: { width: 340 } }}>
      <Text weight={700} size={16} text={`${phase.tier} Broodmother Lysrix`} />
      <RuneView width={FULL} height={12} fill="#000000aa" radius={3} clip>
        <RuneView height={12} width={bind(() => ({ fraction: health() }))} gradient={{ angle: 180, stops: [[0, "#d84a3a"], [1, "#8a1f18"]] }} />
      </RuneView>
      <Small color={INK} text={bind(() => (view().phase === "victory" ? `Victory! Back to the obelisk in ${seconds()} s` : `${Math.ceil(health() * 100)}% · ${view().brood} Araneo`))} />
      <Text weight={700} size={18} color="#ffb04a" text={bind(() => (view().phase === "fight" ? (view().tell ?? "") : ""))} />
    </Panel>
  );
}

/**
 * A press on a HUD button focuses the native UI canvas, and the world reads keys from the play surface; outside a
 * modal nothing hands focus back, so a HUD button does it after its command.
 */
export function playFocus(): void {
  if (typeof document === "undefined") return;
  queueMicrotask(() => document.querySelector<HTMLElement>("[data-jg-play-surface]")?.focus({ preventScroll: true }));
}

/** The survivor's path: the current step and the next, Next for a step the player acknowledges, and Skip. */
function Onboarding(): ReactNode {
  const ctx = useGameContext();
  const runtime = onboardingOf(ctx);
  const view = useGameStore((c) => {
    const run = onboardingOf(c)?.run();
    if (run === undefined || run.isFinished()) return null;
    const quest = run.tracked();
    const current = run.current();
    const at = quest.objectives.findIndex((objective) => objective.id === current?.step.id);
    return {
      title: at < 0 ? quest.title : `${quest.title} · ${at + 1} of ${quest.objectives.length}`,
      steps: (at < 0 ? quest.objectives : quest.objectives.slice(at, at + 2)).map((o) => ({ id: o.id, label: o.label, complete: o.complete, progress: o.progress, count: o.count })),
      detail: current?.step.detail,
      next: current !== null && "next" in current.step.done,
    };
  }, same);
  if (runtime === null || view === null) return null;
  return (
    <RuneView gap={5} maxWidth={280} fill="#0b141899" radius={6} padding={10} responsive={{ phone: { maxWidth: 200, padding: 8 } }} label="Survivor's path">
      <Tag color={GOLD} text={view.title} />
      {view.steps.map((step) => (
        <Row key={step.id} gap={6} items="start">
          <Text size={13} color={step.complete ? GOOD : GOLD} text={step.complete ? "✓" : "○"} />
          <Text size={13} weight={600} color={INK} grow={1} shrink text={step.count > 1 ? `${step.label} ${Math.min(step.progress, step.count)}/${step.count}` : step.label} />
        </Row>
      ))}
      {view.detail === undefined ? null : <Small color="#e2e8f0" text={view.detail} />}
      <Row gap={6}>
        {view.next ? <RuneAction variant="action" padding={[3, 10, 3, 10]} minHeight={24} command={{ name: "onboarding.next" }} run={playFocus}><Small color={INK} weight={700} text="Next" /></RuneAction> : null}
        {runtime.config.skippable === false ? null : <RuneAction variant="action" padding={[3, 10, 3, 10]} minHeight={24} command={{ name: "onboarding.skip" }} run={playFocus}><Small color={INK} weight={700} text="Skip tutorial" /></RuneAction>}
      </Row>
    </RuneView>
  );
}

/** Where your body lies after a death: how far, and how long before it falls apart with your things. */
function BodyLine(): ReactNode {
  const ctx = useGameContext();
  const has = useGameStore((c) => bodyView(c) !== null);
  if (!has) return null;
  return <Text size={13} weight={700} color="#cfe8ff" align="right" fill="#0b141899" radius={4} padding={[3, 8, 3, 8]} text={bind(() => { const v = bodyView(ctx); return v === null ? "" : `Your body: ${Math.round(v.distance)} m · ${Math.ceil(v.secondsLeft / 60)} min left`; })} />;
}

/** Riding: the mount's readout and how to get off. */
function Mount(): ReactNode {
  const ctx = useGameContext();
  const riding = useGameStore((c) => { const r = liveCreatures(c).riding; return r === null ? null : cardShape(r); }, same);
  if (riding === null) return null;
  return (
    <Panel gap={4} padding={10}>
      <CreatureReadout card={riding} read={() => liveCreatures(ctx).riding} />
      <Small color={INK} text="Click to bite · E to dismount" />
    </Panel>
  );
}

/** Under the crosshair: what you would hit and what E does; a creature's readout; or the build ghost or piece in front. */
function Prompt(): ReactNode {
  const ctx = useGameContext();
  const look = useGameStore((c) => {
    const creatures = liveCreatures(c);
    if (creatures.riding !== null) return { kind: "none" as const };
    const aimed = creatures.aimed;
    if (aimed !== null) {
      const use = aimed.dead ? (aimed.inventory.some((slot) => slot !== null) ? "E · Access inventory · Hit to carve" : "Hit to carve meat and hide") : aimed.tamed ? (aimed.saddled ? "E · Ride" : "E · Access inventory") : aimed.taming?.unconscious === true ? "E · Access inventory" : null;
      return { kind: "creature" as const, card: cardShape(aimed), use };
    }
    const base = baseView(c);
    if (base.ghost !== null) return { kind: "ghost" as const, valid: base.ghost.valid, line: base.ghost.valid ? `Place ${base.ghost.piece}` : (base.ghost.why ?? "") };
    if (base.aimed !== null) return { kind: "piece" as const, line: `${base.aimed.label} ${base.aimed.health}/${base.aimed.max}`, use: `${base.aimed.door ? `E · ${base.aimed.open ? "Close" : "Open"} · ` : ""}G · Demolish` };
    const aim = s(c).aim;
    if (aim.strike === null && aim.pick === null && !aim.water) return { kind: "none" as const };
    return { kind: "aim" as const, strike: aim.strike, use: aim.pick !== null ? `E · Harvest ${aim.pick}` : aim.water ? "E · Drink" : null };
  }, same);
  if (look.kind === "none") return null;
  return (
    <RuneView anchor="center" padding={[64, 0, 0, 0]}>
      <RuneView items="center" gap={3} fill="#0b141899" radius={5} padding={[6, 10, 6, 10]}>
      {look.kind === "creature" ? (
        <>
          <CreatureReadout card={look.card} read={() => liveCreatures(ctx).aimed} />
          {look.use === null ? null : <Text size={13} weight={700} color="#f4efe2" text={look.use} />}
        </>
      ) : look.kind === "ghost" ? (
        <>
          <Text size={13} weight={700} color={look.valid ? GOOD : BAD} text={look.line} />
          <Small color="#f4efe2" text="Click to place · R to turn" />
        </>
      ) : look.kind === "piece" ? (
        <>
          <Text size={13} weight={700} color="#f4efe2" text={look.line} />
          <Small color="#f4efe2" text={look.use} />
        </>
      ) : (
        <>
          {look.strike === null ? null : <Text size={13} weight={700} color="#f4efe2" text={look.strike} />}
          {look.use === null ? null : <Text size={13} weight={700} color="#f4efe2" text={look.use} />}
        </>
      )}
      </RuneView>
    </RuneView>
  );
}

/** A note just read: ARK's explorer note open over the world for a while; the dossier (I) keeps it. */
function NoteReader(): ReactNode {
  const reading = useGameStore((ctx) => dossierView(ctx).reading, same);
  const { width, height } = useRuneViewport();
  if (reading === null) return null;
  return (
    <RuneView anchor="top-right" safe inset={16} padding={[width < 600 ? 150 : 210, 0, 0, 0]}>
      <RuneView width={Math.min(380, width - 32)} maxHeight={height * 0.5} scroll fill="#f1e6c8f2" radius={4} padding={[14, 18, 14, 18]} gap={6} label="Explorer note">
        <Text size={15} weight={700} color="#3a2c18" text={reading.title} />
        <Text size={13} color="#3a2c18" text={reading.text} />
        <Text size={11} color="#3a2c18aa" text="Kept in your dossier (I · Dossier)" />
      </RuneView>
    </RuneView>
  );
}

/** ARK's layout: pools on the right, hotbar bottom-centre, item lines top-centre, the first-day steps top-left, the map top-right. */
export function Hud({ notices }: { notices: RuneSource<{ id: string; expiresAt: number; text: string; tone?: string }> & { expire: () => void } }): ReactNode {
  const screen = useGameStore(openScreen);
  const { width } = useRuneViewport();
  const phone = width < 600;
  return (
    <>
      <RuneView anchor="center" width={6} height={6} radius={3} fill="#ffffff" border={{ width: 1, color: "#00000088" }} />
      <RuneView anchor="top-left" safe inset={14}><Onboarding /></RuneView>
      <RuneView anchor="top" safe inset={14} items="center" gap={6} maxWidth={phone ? 220 : 520} padding={phone ? [96, 0, 0, 0] : 0}>
        <BossBar />
        <Banner />
        <PickupLines />
        <RuneTransient source={notices} expire={notices.expire}>
          {(notice) => <Panel padding={[6, 12, 6, 12]}><Text size={13} weight={600} color={notice.tone === "deny" ? BAD : notice.tone === "success" ? GOOD : INK} text={notice.text} /></Panel>}
        </RuneTransient>
      </RuneView>
      <RuneView anchor="top-right" safe inset={14} items="end" gap={8}>
        <MapCorner />
        <BodyLine />
      </RuneView>
      <RuneView anchor="bottom-left" safe inset={14} padding={phone ? [0, 0, 190, 0] : 0}><Mount /></RuneView>
      <RuneView anchor="bottom" safe inset={phone ? 10 : 16} padding={phone ? [0, 0, 150, 0] : 0}><Hotbar /></RuneView>
      <RuneView anchor={phone ? "right" : "bottom-right"} safe inset={phone ? 8 : 16}><Vitals /></RuneView>
      {screen === null ? <Prompt /> : null}
      {screen === null ? <NoteReader /> : null}
    </>
  );
}
