/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { compassBearing, headingToBearing, relativeBearing } from "@jgengine/core/map/minimap";
import { formatSpeed } from "@jgengine/core/format/speed";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { actionGlyph, useInputDevice } from "@jgengine/core/input/inputDevice.view";
import { useUiCue } from "@jgengine/core/ui/uiCues.view";
import { useGame, useGameStore, usePlayer } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { city } from "../city";
import { cityOf } from "../cityRuntime";
import { frontViews } from "../city/fronts";
import { RACE_ENTRY_FEE, SAFEHOUSE_PRICE, slotStore } from "../commands";
import { drivingStore, MAX_HEAT, MAX_STARS, raceStore, streetPlayOf, wantedStore, type VehicleTelemetry, type WantedSnapshot } from "../streetPlay";
import { cargoStore } from "../items/cargoHaul";
import { bountyPayout, bountyStore } from "../jobs/bounties";
import { courierDeadline, courierObjectiveStore, courierStore, DELIVERY_ROUTES, DISPATCH, RUSH_BOND, THIEF } from "../jobs/courier";
import { GIG_RACE_STAKE, gigStore, spotLabel } from "../jobs/gigs";
import { prompts, systemPromptLabel } from "../prompts";
import { radioStore } from "../radio/runtime";
import { BOUNTY_SPOTS, RACE_ROUTES } from "../world/districts";
import { vehicleById } from "../entities/vehicles/catalog";
import { ITEM_LABELS } from "../content";
import { AMMO_STAT_IDS, weaponById } from "../items/weapons/catalog";
import { deadlineStage, formatCountdown, KeyCap, Label, Lcd, LcdText, money, Row, Text, useIdleFade, useRoom, useVersioned } from "./kit";
import { DISPLAY, HH } from "./theme";

type XZ = readonly [number, number];
type Pt = readonly [number, number];
const xz = (p: readonly number[]): XZ => [p[0]!, p[2]!];

/** `points` turned by `radians` about (cx, cy), for a bound native polygon. */
export function turned(points: readonly Pt[], radians: number, cx: number, cy: number): Pt[] {
  const c = Math.cos(radians), s = Math.sin(radians);
  return points.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

/** A five-point star in a 24 box. */
const STAR: Pt[] = Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, r = i % 2 === 0 ? 11 : 4.6; return [12 + Math.cos(a) * r, 12.5 + Math.sin(a) * r]; });
export function Star({ size, fill }: { size: number; fill: string }) {
  return <RuneView width={size} height={size} fill={fill} shape={{ points: STAR, viewBox: [24, 24] }} />;
}

/** The glyph a slot or prompt shows for `action` on this device; touch has its own buttons. */
function useGlyph(action: string, fallback?: string): string | undefined {
  const keybinds = useActionBindings();
  const device = useInputDevice();
  if (device === "touch") return undefined;
  return actionGlyph(keybinds, action, device) ?? fallback;
}

// --- The pager ---------------------------------------------------------------------------------

/** The longest each job timer has shown, so its countdown has a total to warn against. */
const timerTotals = new Map<string, number>();

interface Goal {
  key: string;
  eyebrow?: string | undefined;
  title: string;
  target?: XZ | undefined;
  deadline?: { remaining: number; total: number } | undefined;
  hint?: string | undefined;
  rush?: string | undefined;
  /** An open gig offer the pager can take with one tap. */
  offer?: { id: string; label: string };
}

/** The gig in hand (fare, flower run, street race), else a waiting fare or a paged race. */
function gigGoal(ctx: GameContext): Goal | null {
  const gigs = gigStore.read(ctx);
  const view = gigs.view;
  if (view !== null && view.target !== null) {
    const target: XZ = [view.target.x, view.target.z];
    const deadline = view.timeLeft === null ? undefined : { remaining: view.timeLeft, total: Math.max(timerTotals.get(view.jobId + view.phase) ?? 0, view.timeLeft) };
    if (deadline !== undefined) timerTotals.set(view.jobId + view.phase, deadline.total);
    const key = `gig:job:${view.jobId}:${view.phase}:${view.leg}`;
    if (view.kindId === "street") {
      if (view.phase === "pickup") return { key, eyebrow: `${view.label} · ${view.stake} staked`, title: "Get to the start line", target, deadline, hint: "Stop on the line and the race goes." };
      return { key, eyebrow: `${view.label} · ${view.place === 1 ? "leading" : view.place === null ? "racing" : `P${view.place} of 3`}`, title: view.targetRole === "finish" ? "Finish line" : `Gate ${view.leg} of ${view.legs}`, target, deadline, hint: "Drive through each gate in order. First pays triple the stake." };
    }
    if (view.kindId === "flowers") {
      if (view.phase === "pickup") return { key, eyebrow: "Boardwalk Blooms", title: "Load the bouquets", target, deadline };
      return { key, eyebrow: `Flowers · ${view.comfort}% fresh · ${view.fareSoFar}`, title: `Drop ${view.leg} of ${view.legs} · ${spotLabel(view.target.id)}`, target, deadline, hint: "Stay under 60 km/h and miss the kerbs: knocks crush the bouquets." };
    }
    if (view.phase === "pickup") return { key, eyebrow: `Fare · ${view.fare}`, title: `Pick up at ${spotLabel(view.target.id)}`, target, deadline, hint: "Pull up beside them and stop." };
    const streak = view.streak > 0 ? ` · streak ${view.streak}` : "";
    return { key, eyebrow: `Fare · ${view.fareSoFar} · tip ${view.comfort}%${streak}`, title: `Drop at ${spotLabel(view.target.id)}`, target, deadline, hint: "Crashes and cop chases cut the tip. Stop at the kerb to let them out." };
  }
  const race = gigs.offers.find((offer) => offer.kindId === "street");
  if (race !== undefined) return { key: `gig:offer:${race.id}`, eyebrow: `Street race page · ${GIG_RACE_STAKE} stake`, title: `${race.label} — winner takes ${GIG_RACE_STAKE * 3}`, target: [race.pickup.x, race.pickup.z], offer: { id: race.id, label: `Race ${race.label} · ${race.stake}` } };
  const hail = gigs.duty ? gigs.offers.find((offer) => offer.kindId === "taxi") : undefined;
  if (hail !== undefined) return { key: `gig:offer:${hail.id}`, eyebrow: `On duty · fare hailing · ${hail.fare}`, title: `Pick up at ${spotLabel(hail.pickup.id)}`, target: [hail.pickup.x, hail.pickup.z], hint: "Pull up beside the waving fare and stop." };
  if (gigs.duty) return { key: "gig:duty", eyebrow: gigs.streak > 0 ? `On duty · streak ${gigs.streak}` : "On duty", title: "Cruise for a fare", hint: "Fares hail from the kerbs. Press Y to switch the taxi light off." };
  return null;
}

/** The one thing to do now, most urgent first: a race, a parcel in hand, the live job, a bounty, the next job, then the booth. */
export function goalOf(ctx: GameContext, at: XZ): Goal {
  const race = raceStore.read(ctx);
  const circuit = race?.active === true ? RACE_ROUTES.find((r) => r.id === race.routeId) : undefined;
  if (race !== undefined && circuit !== undefined) {
    return { key: `race:${circuit.id}`, eyebrow: `${race.label} · ${race.position === 1 ? "leading" : "second"}`, title: `Gate ${Math.min(race.checkpoint + 1, race.total)} of ${race.total}`, target: circuit.checkpoints[Math.min(race.checkpoint, circuit.checkpoints.length - 1)], hint: `Drive through each gate in order. Racing ${race.rival}; leaving the car forfeits.` };
  }
  const gig = gigGoal(ctx);
  if (gig !== null && gig.key.startsWith("gig:job")) return gig;
  const courier = courierStore.read(ctx);
  if (courier.phase === "running") {
    const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
    const step = courierObjectiveStore.read(ctx);
    if (step?.step === 2) {
      const runner = ctx.scene.entity.get(THIEF);
      return { key: "runner", eyebrow: `Parcel snatched · ${Math.round(courier.condition ?? 100)}% intact`, title: "Catch the runner", target: runner === null ? undefined : xz(runner.position), deadline: step.remaining === null ? undefined : { remaining: step.remaining, total: 60 }, hint: "Get within 3 m. Keep them alive or the parcel burns. It takes a knock every second they have it." };
    }
    const rush = courier.service === "rush";
    const crates = cargoStore.read(ctx).carried;
    const intact = `${Math.round(courier.condition ?? 100)}% intact`;
    const load = rush ? `Fragile parcel · ${intact}` : crates > 0 ? `Parcel + ${crates} crates · ${intact}` : `Parcel · ${intact}`;
    return { key: `parcel:${courier.route}`, eyebrow: load, title: `Deliver to ${route.recipient}`, target: route.position, deadline: { remaining: courier.remaining, total: courierDeadline(route.seconds, rush) }, hint: rush ? "Stay under 35 km/h and avoid hits: damage spoils the cargo." : `${route.hint} Stop beside it to hand over. Knocks cost you a damage claim.` };
  }
  if (gig !== null) return gig;
  const raid = frontViews(ctx).find((front) => front.status === "raid");
  if (raid !== undefined) {
    return { key: `raid:${raid.slot}`, eyebrow: "Carmine raid", title: `Defend ${raid.label}`, target: raid.position, deadline: { remaining: raid.raidSeconds, total: 60 }, hint: "Drop every raider before the clock runs out, or they wreck it and empty the safe." };
  }
  const atBooth = Math.hypot(at[0] - DISPATCH[0], at[1] - DISPATCH[1]) < 9;
  const world = cityOf(ctx);
  const live = world.missionView();
  const next = world.next();
  if (live !== null) {
    const key = `job:${live.missionId}:${live.objectiveId}`;
    const total = live.remaining === null ? 0 : Math.max(timerTotals.get(key) ?? 0, live.remaining);
    if (live.remaining !== null) timerTotals.set(key, total);
    const step = live.steps > 1 ? ` · step ${live.step} of ${live.steps}` : "";
    return { key, eyebrow: `${live.title}${step}`, title: live.count > 1 ? `${live.label} · ${live.counted}/${live.count}` : live.label, target: next?.target ?? undefined, deadline: live.remaining === null ? undefined : { remaining: live.remaining, total } };
  }
  const bounty = bountyStore.read(ctx);
  const spot = BOUNTY_SPOTS.find((s) => s.id === bounty?.spotId);
  if (bounty?.targetId != null && spot !== undefined && !atBooth) {
    return { key: `bounty:${spot.id}`, eyebrow: `Bounty · $${bountyPayout(bounty.completed)}`, title: `Take down the mark at ${spot.label}`, target: xz(spot.position) };
  }
  if (next !== null && !atBooth) {
    return { key: `next:${next.jobId}`, eyebrow: "Next job", title: next.text, target: next.target ?? undefined, hint: "Talk to them in person, or open the phone." };
  }
  const offer = DELIVERY_ROUTES[courier.delivered % DELIVERY_ROUTES.length]!;
  return {
    key: "dispatch",
    eyebrow: `${offer.label} · $${offer.payout}`,
    title: atBooth ? "Take a parcel" : "Go to the dispatch booth",
    target: atBooth ? undefined : DISPATCH,
    hint: atBooth ? undefined : "The teal booth stands on the shore path. Follow the arrow.",
    rush: atBooth && courier.delivered > 0 ? `Fragile rush · ${courierDeadline(offer.seconds, true)} s · $${RUSH_BOND} bond` : undefined,
  };
}

function promptLabel(id: string): string {
  if (id.startsWith("enter:")) return "Get in";
  if (id.startsWith("race:")) return `Race ${RACE_ROUTES.find((r) => `race:${r.id}` === id)?.label ?? "the streets"} · $${RACE_ENTRY_FEE}`;
  const labels: Record<string, string> = { "shop:ammunation": "Browse Ammu-Isle", "garage:dealer": "Browse Sunset Motors", "safehouse:buy": `Buy Palmview Bungalow · $${SAFEHOUSE_PRICE.toLocaleString()}`, "safehouse:rest": "Step inside the bungalow", "courier:accept": "Take standard parcel", "courier:deliver": "Hand over the parcel" };
  if (id.startsWith("talk:")) return `Talk to ${city.people?.[id.slice(5)]?.name ?? "them"}`;
  if (id.startsWith("job:")) return `Start ${city.jobs?.[id.slice(4)]?.title ?? "the job"}`;
  return labels[id] ?? "Talk";
}

/** Where the courier is and which way they face: the car when driving, else on foot. */
function bodyOf(ctx: GameContext) {
  const player = ctx.scene.entity.get(ctx.player.userId);
  const body = ctx.scene.entity.get(drivingStore.read(ctx) ?? ctx.player.userId) ?? player;
  return body === null || player === null ? null : { player, body };
}

/** What the pager says, which changes at discrete moments; the distance, arrow and clock are bound leaves. */
function objectiveView(ctx: GameContext) {
  const found = bodyOf(ctx);
  if (found === null) return null;
  const { player, body } = found;
  const { target, deadline, ...goal } = goalOf(ctx, xz(body.position));
  const active = resolveActivePrompt({ x: player.position[0], z: player.position[2] }, prompts(ctx));
  return {
    ...goal,
    hasTarget: target !== undefined,
    stage: deadline === undefined ? null : deadlineStage(deadline),
    prompt: active?.prompt.invoke == null ? null : { id: active.id, label: systemPromptLabel(ctx, active.id), name: active.prompt.invoke.name, input: active.prompt.invoke.input },
  };
}

const sameView = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** This frame's distance, arrow and clock. */
function livePager(ctx: GameContext) {
  const found = bodyOf(ctx);
  if (found === null) return null;
  const at = xz(found.body.position);
  const goal = goalOf(ctx, at);
  const target = goal.target;
  return {
    key: goal.key,
    distance: target === undefined ? null : Math.round(Math.hypot(target[0] - at[0], target[1] - at[1])),
    bearing: target === undefined ? 0 : relativeBearing(compassBearing(at, target), headingToBearing(found.body.rotationY)),
    clock: goal.deadline === undefined ? "" : formatCountdown(goal.deadline.remaining),
    lit: goal.deadline === undefined || goal.deadline.total <= 0 ? 0 : Math.ceil((Math.max(0, goal.deadline.remaining) / goal.deadline.total) * 16),
  };
}

const ARROW: Pt[] = [[12, 2], [20.5, 12], [15, 12], [15, 22], [9, 22], [9, 12], [3.5, 12]];
const FUSE = Array.from({ length: 16 }, (_, i) => i);

/**
 * The courier's pager, clipped to the top-left: the job on an amber LCD, the arrow and distance to it,
 * the parcel clock (the backlight turns coral near the end), and a hint that scrolls in after twelve
 * seconds without getting closer. Below it hangs the dispatch ticket for whatever is in reach.
 */
export function Objective() {
  const { commands } = useGame();
  const cue = useUiCue();
  const room = useRoom();
  const compact = room !== "wide";
  const glyph = useGlyph("interact", "E") ?? "Tap";
  const view = useGameStore(objectiveView, sameView);
  const live = useVersioned(livePager);
  // The idle hint waits on real progress: getting closer, not just moving.
  const stuck = useMemo(() => {
    let key = "", best = Infinity, since = performance.now();
    return () => {
      const now = live();
      if (now === null) return false;
      if (now.key !== key) { key = now.key; best = Infinity; since = performance.now(); }
      if (now.distance !== null && now.distance < best - 3) { best = now.distance; since = performance.now(); }
      return performance.now() - since > 12_000;
    };
  }, [live]);
  const stage = view?.stage ?? "calm";
  const lastStage = useRef(stage);
  useEffect(() => {
    if (stage !== lastStage.current && stage !== "calm") cue(stage === "urgent" ? "deny" : "notify");
    lastStage.current = stage;
  }, [stage, cue]);
  // The hint scrolling in chirps once, as the pager did before.
  const hinted = view?.hint !== undefined;
  useEffect(() => {
    if (!hinted) return;
    let was = false;
    const timer = setInterval(() => { const now = stuck(); if (now && !was) cue("notify"); was = now; }, 500);
    return () => clearInterval(timer);
  }, [hinted, stuck, cue]);
  if (view === null) return null;
  const prompt = view.prompt;
  return (
    <RuneView width={room === "stacked" ? 214 : compact ? 236 : 330} gap={6}>
      <RuneView padding={[6, 8, 8, 8]} gap={4} fill="#1d2b30" radius={10} border={{ width: 2, color: "#0b1114" }} shadow={{ x: 4, y: 5, blur: 0, color: "#00000066" }}>
        <Text family={DISPLAY} size={11} tracking={2} color="#9fb3b8" text="MAINSAIL page" />
        <Lcd alarm={stage === "urgent"} gap={3}>
          <Row justify="between">
            <LcdText size={compact ? 11 : 12} grow={1} shrink text={view.eyebrow ?? "Dispatch"} />
            {view.stage === null ? null : <LcdText weight={800} size={compact ? 14 : 16} text={bind(() => live()?.clock ?? "")} />}
          </Row>
          <Row justify="between" gap={8}>
            <Text family={DISPLAY} size={compact ? 17 : 22} color={HH.lcdInk} grow={1} shrink text={view.title} />
            {view.hasTarget ? (
              <Row gap={4}>
                <RuneView width={18} height={18} fill={HH.lcdInk} shape={bind(() => ({ points: turned(ARROW, live()?.bearing ?? 0, 12, 12), viewBox: [24, 24] as const }))} />
                <LcdText weight={800} text={bind(() => { const d = live()?.distance; return d == null ? "" : `${d} m`; })} />
              </Row>
            ) : null}
          </Row>
          {view.stage === null ? null : (
            <Row gap={2}>{FUSE.map((i) => <RuneView key={i} grow={1} height={6} fill={bind(() => (i < (live()?.lit ?? 0) ? HH.lcdInk : "#2a170428"))} />)}</Row>
          )}
          {view.hint === undefined ? null : <LcdText size={12} hidden={bind(() => !stuck())} text={view.hint} />}
        </Lcd>
      </RuneView>
      {prompt === null ? null : (
        <RuneAction label={prompt.label ?? promptLabel(prompt.id)} command={{ name: prompt.name, input: prompt.input }} layout="row" gap={8} items="center" padding={[6, 10, 6, 6]}
          fill={HH.cream} border={{ width: 2, color: HH.night }} radius={3} hover="#ffffff" press="#e9dcc0" shadow={{ x: 3, y: 3, blur: 0, color: "#071d25cc" }}>
          <KeyCap>{glyph}</KeyCap><Text weight={700} color={HH.night} text={prompt.label ?? promptLabel(prompt.id)} />
        </RuneAction>
      )}
      {view.offer === undefined ? null : (
        <RuneAction label={view.offer.label} run={() => commands.run("gigs.accept", { id: view.offer!.id })} layout="row" gap={8} padding={[6, 10, 6, 10]} fill={HH.coral} border={{ width: 2, color: HH.night }} radius={3} hover="#ffffff30">
          <Text family={DISPLAY} size={16} color={HH.night} text={`⚑ ${view.offer.label}`} />
        </RuneAction>
      )}
      {view.rush === undefined ? null : (
        <RuneAction label={view.rush} run={() => commands.run("courier.accept", { service: "rush" })} layout="row" gap={8} padding={[6, 10, 6, 10]} fill={HH.coral} border={{ width: 2, color: HH.night }} radius={3} hover="#ffffff30">
          <Text family={DISPLAY} size={16} color={HH.night} text={`⧗ ${view.rush}`} />
        </RuneAction>
      )}
    </RuneView>
  );
}

// --- Wallet, scanner, belt, keys -----------------------------------------------------------------

/** A thin bar cut into ticks, like the charge strip on a phone; its fill is bound. */
function Strip({ label, read, max, color }: { label: string; read: () => number; max: number; color: () => string }) {
  return (
    <Row gap={6}>
      <Label width={46} text={label} />
      <RuneView grow={1} height={7} fill="#0b1114" border={{ width: 1, color: "#76d4c344" }} radius={2}>
        <RuneView height={5} radius={1} width={bind(() => ({ fraction: max <= 0 ? 0 : Math.max(0, Math.min(1, read() / max)) }))} fill={bind(color)} />
      </RuneView>
    </Row>
  );
}

/**
 * Cash in hand, painted big like a boulevard billboard price, street cred on a stamped tab and slim
 * health and armor strips. It dims when nothing changes and stays lit while you bleed.
 */
export function StatusPanel() {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const compact = useRoom() !== "wide";
  const stat = (id: string) => ctx.scene.entity.stats.get(userId, id);
  const cash = () => ctx.game.economy.balance(userId, "cash");
  const hp = () => stat("health")?.current ?? 0;
  const max = () => stat("health")?.max ?? 100;
  const armor = () => stat("armor")?.current ?? 0;
  const low = () => hp() < max() * 0.3;
  const fade = useIdleFade(() => `${cash()}:${stat("level")?.current}:${Math.round(hp())}:${Math.round(armor())}`, 6000, 0.72, low);
  return (
    <RuneView width={compact ? 170 : 220} gap={5} padding={[8, 10, 8, 10]} fill="#102e3bd8" radius={6} border={{ width: 2, color: "#76d4c355" }} opacity={fade}>
      <Row justify="between">
        <Text family={DISPLAY} size={compact ? 24 : 32} color={HH.cash} text={bind(() => money(cash()))} />
        <RuneView padding={[1, 6, 0, 6]} fill={HH.amber} radius={2}><Text family={DISPLAY} size={14} color={HH.night} text={bind(() => `Cred ${stat("level")?.current ?? 1}`)} /></RuneView>
      </Row>
      <Strip label="Health" read={hp} max={100} color={() => (low() ? HH.coral : "#3fbf5a")} />
      <RuneView hidden={bind(() => armor() <= 0)}><Strip label="Armor" read={armor} max={100} color={() => HH.hhpd} /></RuneView>
    </RuneView>
  );
}

/** HHPD's own words for what it is doing, so the stars read as a search rather than a score. */
function heatLine(wanted: Pick<WantedSnapshot, "response" | "stars">): string {
  if (wanted.response === "roadblock") return "HHPD has the causeway";
  if (wanted.response === "pursue") return "HHPD is hunting you";
  return wanted.stars >= 2 ? "HHPD is asking around" : "Someone called it in";
}

const SEGMENTS = Array.from({ length: 20 }, (_, i) => i);

/**
 * The police scanner on the dash, only on while HHPD wants you: a red-and-blue light bar that strobes
 * once they are hunting, a row of star badges, and red LED lines for dispatch, heat and the search circle.
 */
export function WantedStars() {
  const ctx = useGameContext();
  const room = useRoom();
  const compact = room !== "wide";
  const stacked = room === "stacked";
  const wanted = useStore(wantedStore, (state) => state === undefined ? undefined : { stars: state.stars, response: state.response, searching: state.search != null });
  if (wanted === undefined || wanted.stars === 0) return null;
  const hunting = wanted.response === "pursue" || wanted.response === "roadblock";
  const heat = () => { const w = wantedStore.read(ctx); return w === undefined ? 0 : Math.round((Math.min(w.heat, MAX_HEAT) / MAX_HEAT) * SEGMENTS.length); };
  const strobe = (on: string, off: string, phase: number) => hunting ? bind(() => (Math.floor(performance.now() / 160 + phase) % 2 === 0 ? on : off)) : on;
  return (
    <RuneView items="center" gap={0} label={`${wanted.stars} of ${MAX_STARS} stars`}>
      <Row gap={0} radius={4} clip>
        <RuneView width={34} height={8} fill={strobe(HH.siren, "#5a1418", 0)} />
        <RuneView width={34} height={8} fill={strobe("#1f3f86", HH.hhpd, 0)} />
        <RuneView width={34} height={8} fill={strobe(HH.siren, "#5a1418", 1)} />
        <RuneView width={34} height={8} fill={strobe("#1f3f86", HH.hhpd, 1)} />
      </Row>
      <RuneView padding={[6, 12, 8, 12]} gap={4} fill="#120d0ee8" radius={6} border={{ width: 2, color: "#3a2a2c" }} items="center">
        <Row gap={4}>{Array.from({ length: MAX_STARS }, (_, i) => <Star key={i} size={stacked ? 18 : compact ? 20 : 26} fill={i < wanted.stars ? HH.amber : "#ffffff22"} />)}</Row>
        <Text mono size={stacked ? 11 : 12} weight={700} color="#ff4d3d" text={heatLine(wanted)} />
        <Row gap={2}>{SEGMENTS.map((i) => <RuneView key={i} width={stacked ? 4 : compact ? 6 : 8} height={5} fill={bind(() => (i < heat() ? "#ff4d3d" : "#ff4d3d22"))} />)}</Row>
        {wanted.searching ? <Text mono size={11} color="#ff8a7d" {...(stacked ? { maxWidth: 140 } : {})} text={bind(() => `Search ${Math.round(wantedStore.read(ctx)?.search?.radius ?? 0)} m · lose them outside it`)} /> : null}
      </RuneView>
    </RuneView>
  );
}

/** Small item marks for the belt: guns, a grenade, a medkit, armor; drawn as native shapes. */
const MARKS: Record<string, Pt[]> = {
  gun: [[2, 8], [20, 8], [20, 12], [10, 12], [9, 19], [5, 19], [6, 12], [2, 12]],
  long: [[1, 9], [23, 9], [23, 12], [12, 12], [10, 17], [6, 17], [7, 12], [1, 12]],
  grenade: [[9, 3], [15, 3], [15, 6], [19, 9], [20, 15], [17, 20], [7, 20], [4, 15], [5, 9], [9, 6]],
  medkit: [[9, 3], [15, 3], [15, 9], [21, 9], [21, 15], [15, 15], [15, 21], [9, 21], [9, 15], [3, 15], [3, 9], [9, 9]],
  vest: [[6, 3], [9, 3], [12, 6], [15, 3], [18, 3], [21, 8], [19, 21], [5, 21], [3, 8]],
};
function markOf(itemId: string): Pt[] {
  if (itemId.includes("grenade")) return MARKS["grenade"]!;
  if (itemId.includes("med")) return MARKS["medkit"]!;
  if (itemId.includes("armor") || itemId.includes("vest")) return MARKS["vest"]!;
  if (itemId.includes("shotgun") || itemId.includes("rifle") || itemId.includes("smg")) return MARKS["long"]!;
  return MARKS["gun"]!;
}

/**
 * What you carry, as the pouches of a courier's belt: each filled slot with its item mark, the rounds
 * left on an amber tab and the key that draws it. The held one sits up and glows; the belt dims while
 * nothing changes. Tappable on touch.
 */
export function BeltHotbar() {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const keybinds = useActionBindings();
  const device = useInputDevice();
  const slots = useGameStore((c) => c.player.inventory.state("hotbar").slots.slice(0, 4).map((slot) => slot?.itemId ?? null), sameView);
  const selected = useStore(slotStore, (v) => v ?? 0);
  const rounds = (stat: string) => ctx.scene.entity.stats.get(userId, stat)?.current ?? 0;
  const fade = useIdleFade(() => `${slotStore.read(ctx) ?? 0}:${rounds("ammo_9mm")}:${rounds("ammo_shell")}`, 5000, 0.62);
  const filled = slots.map((itemId, index) => ({ itemId, index })).filter((slot): slot is { itemId: string; index: number } => slot.itemId !== null);
  if (filled.length === 0) return null;
  return (
    <Row gap={6} opacity={fade} items="end">
      {filled.map(({ itemId, index }) => {
        const weapon = weaponById(itemId);
        const ammo = weapon === undefined || weapon.ammo === "none" ? undefined : AMMO_STAT_IDS[weapon.ammo];
        const action = `selectSlot${index + 1}`;
        const glyph = device === "touch" ? null : actionGlyph(keybinds, action, device);
        const label = ITEM_LABELS[itemId] ?? itemId;
        const held = index === selected;
        return (
          <RuneAction key={index} label={label} command={{ name: action }} width={66} height={held ? 66 : 58} padding={[6, 4, 4, 4]} gap={2} items="center"
            fill={held ? "#2b4a52" : "#1b2a2e"} border={{ width: 2, color: held ? HH.amber : "#0b1114" }} radius={6} hover="#ffffff18" motion={{ duration: 120, bounce: 0 }}>
            <RuneView width={26} height={26} fill={held ? HH.amber : "#c9d6d9"} shape={{ points: markOf(itemId), viewBox: [24, 24] }} />
            <Text size={10} weight={600} color={HH.cream} text={label} />
            {glyph === null ? null : <RuneView pin={[3, 3, null, null]}><Text mono size={10} color="#9fb3b8" text={glyph} /></RuneView>}
            {ammo === undefined ? null : (
              <RuneView pin={[null, 3, 3, null]} padding={[0, 4, 0, 4]} fill={HH.amber} radius={2}><Text family={DISPLAY} size={12} color={HH.night} text={bind(() => String(rounds(ammo)))} /></RuneView>
            )}
          </RuneAction>
        );
      })}
    </Row>
  );
}

/** A little rubber key on the HUD's top edge: an icon mark, the printed name and the bound key. */
function HudKey({ label, action, run }: { label: string; action: string; run: () => void }) {
  const glyph = useGlyph(action);
  return (
    <RuneAction label={label} run={run} layout="row" gap={6} items="center" padding={[5, 10, 5, 10]} fill="#1d2b30" border={{ width: 2, color: "#0b1114" }} radius={14}
      hover="#2b3f46" press="#0b1114" color={HH.cream} shadow={{ x: 2, y: 3, blur: 0, color: "#00000066" }}>
      <Text family={DISPLAY} size={15} tracking={0.8} color={HH.cream} text={label} />
      {glyph === undefined ? null : <KeyCap>{glyph}</KeyCap>}
    </RuneAction>
  );
}

export function HudKeys() {
  const { commands } = useGame();
  return (
    <Row gap={6}>
      <HudKey label="Phone" action="phone" run={() => commands.run("phone", {})} />
      <HudKey label="Pause" action="pause" run={() => commands.run("session.pause", { paused: true })} />
    </Row>
  );
}

// --- The dash: stereo and speedo -----------------------------------------------------------------

/**
 * Only while driving: the car stereo's faceplate with the dial position, the station, what is on and
 * the DJ's line. A news bulletin lights it coral. Tapping the faceplate or the tune key changes station.
 */
export function RadioReadout() {
  const view = useGameStore((ctx) => radioStore.read(ctx), sameView);
  const glyph = useGlyph("radio", "R");
  const room = useRoom();
  const compact = room !== "wide";
  if (view === null) return null;
  const credit = view.artist === null ? view.title : `${view.title} · ${view.artist}`;
  return (
    <RuneAction label={`Radio: ${view.station}. Change station`} command={{ name: "radio" }} width={compact ? 200 : 260} padding={6} gap={4} fill="#1a1f22" border={{ width: 2, color: "#0b1114" }} radius={6} hover="#262d31">
      <RuneView variant="lcd" fill={view.bulletin ? HH.lcdAlarm : "#7fd6c0"} gap={2}>
        <Row justify="between"><LcdText weight={800} text={view.frequency} /><LcdText size={12} text={view.bulletin ? "News flash" : view.station} /></Row>
        <LcdText size={12} weight={700} text={credit} />
        {room === "stacked" ? null : <LcdText size={11} text={view.line ?? (view.kind === "music" ? "♪ ♪ ♪" : "")} />}
      </RuneView>
      {room === "stacked" ? null : <Row gap={6} justify="end"><Label text="Tune" />{glyph === undefined ? null : <KeyCap>{glyph}</KeyCap>}</Row>}
    </RuneAction>
  );
}

/** Label steps a dial face can count in; the face shows six of them, so every number is round. */
const STEPS = [10, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200];

/** The dial's full scale for a vehicle: its top speed with a little headroom, in round numbers. */
export function dialTop(topKmh: number): number {
  const need = (Math.max(60, topKmh) * 1.08) / 6;
  return (STEPS.find((step) => step >= need) ?? Math.ceil(need / 50) * 50) * 6;
}

function topKmhOf(name: string | undefined): number {
  const def = name === undefined ? undefined : vehicleById(name);
  if (def === undefined) return 220;
  return (def.dynamics.type === "ground" ? def.dynamics.tuning.engine.topSpeed : def.dynamics.topSpeed) * 3.6;
}

/** What the dash is: re-rendered only when you change vehicle, mode or stall. Speed, gear and revs are bound. */
function dashOf(ctx: GameContext) {
  const id = drivingStore.read(ctx);
  if (id == null) return null;
  const t = streetPlayOf(ctx).telemetry();
  const name = ctx.scene.entity.get(id)?.name;
  const def = name === undefined ? undefined : vehicleById(name);
  const redline = def?.dynamics.type === "ground" ? def.dynamics.tuning.engine.gearbox?.redlineRpm ?? 7600 : 0;
  const aircraft = t.mode === "aircraft";
  return { label: def?.label ?? "Vehicle", top: dialTop(topKmhOf(name)), redline: aircraft ? 0 : redline, stalled: t.stalled, aircraft, vtol: aircraft && t.vtol };
}

const kmhOf = (t: VehicleTelemetry): number => Number(formatSpeed(t.speedMs, { unit: "kmh", decimals: 0, showUnit: false })) || 0;

/** The dial sweeps 240 degrees, from 0 at lower left to the top speed at lower right. */
const SWEEP = 240;
const START = -120;
const TICKS = Array.from({ length: 13 }, (_, i) => i);
const LAMPS = Array.from({ length: 10 }, (_, i) => i);
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Polar point on a 140 face, angle in degrees clockwise from straight up. */
function at(angle: number, radius: number): Pt {
  return [70 + Math.sin(rad(angle)) * radius, 70 - Math.cos(rad(angle)) * radius];
}
/** A thick arc band between two radii, as a polygon. */
function band(from: number, to: number, inner: number, outer: number): Pt[] {
  const n = 24, out: Pt[] = [], back: Pt[] = [];
  for (let i = 0; i <= n; i += 1) { const a = from + ((to - from) * i) / n; out.push(at(a, outer)); back.push(at(a, inner)); }
  return [...out, ...back.reverse()];
}
const NEEDLE: Pt[] = [[67.5, 78], [70, 14], [72.5, 78]];
const RED_BAND = band(START + SWEEP * 0.78, START + SWEEP, 49, 55);

function Dial({ telemetry, top, size }: { telemetry: () => VehicleTelemetry; top: number; size: number }) {
  const k = size / 140;
  return (
    <RuneView width={size} height={size}>
      <RuneView pin={[0, 0, null, null]} width={size} height={size} radius={size / 2} fill="#1b2326" />
      <RuneView pin={[6 * k, 6 * k, null, null]} width={128 * k} height={128 * k} radius={64 * k} fill={HH.cream} border={{ width: 2, color: "#3a2a18" }} />
      <RuneView pin={[0, 0, null, null]} width={size} height={size} fill={HH.coral} shape={{ points: RED_BAND, viewBox: [140, 140] }} />
      {TICKS.map((i) => {
        const angle = START + (SWEEP / 12) * i;
        const w = i % 2 === 0 ? 2 : 1;
        const inner = i % 2 === 0 ? 46 : 50;
        const points: Pt[] = [...band(angle - w, angle + w, inner, 56)];
        return <RuneView key={i} pin={[0, 0, null, null]} width={size} height={size} fill={HH.night} shape={{ points, viewBox: [140, 140] }} />;
      })}
      {TICKS.filter((i) => i % 2 === 0).map((i) => {
        const [x, y] = at(START + (SWEEP / 12) * i, 34);
        return <RuneView key={`n${i}`} pin={[(x - 14) * k, (y - 7) * k, null, null]} width={28 * k} items="center"><Text family={DISPLAY} size={Math.max(9, 12 * k)} color={HH.night} text={String(Math.round((top / 12) * i))} /></RuneView>;
      })}
      <RuneView pin={[0, 0, null, null]} width={size} height={size} fill={HH.coral}
        shape={bind(() => ({ points: turned(NEEDLE, rad(START + (Math.min(kmhOf(telemetry()), top) / top) * SWEEP), 70, 70), viewBox: [140, 140] as const }))} />
      <RuneView pin={[63 * k, 63 * k, null, null]} width={14 * k} height={14 * k} radius={7 * k} fill={HH.night} />
    </RuneView>
  );
}

/**
 * Only while driving: the car's own dash dial (cream face, coral needle), km/h and gear on a little
 * LCD, rev lamps, the badge of what you are driving, an altitude lamp in the air, and how to get out.
 */
export function Speedo() {
  const ctx = useGameContext();
  const room = useRoom();
  const compact = room !== "wide";
  const dash = useGameStore(dashOf, sameView);
  const exit = useGlyph("exitVehicle");
  const vector = useGlyph("flightVectorToggle");
  // One telemetry read per store version, shared by every bound part of the dash.
  const telemetry = useMemo(() => {
    let version = -1;
    let latest: VehicleTelemetry | null = null;
    return (): VehicleTelemetry => {
      const now = ctx.version();
      if (latest === null || now !== version) { version = now; latest = streetPlayOf(ctx).telemetry(); }
      return latest;
    };
  }, [ctx]);
  if (dash === null) return null;
  const size = room === "stacked" ? 100 : compact ? 112 : 150;
  return (
    <RuneView items="end" gap={6}>
      <Row gap={8} items="end">
        <RuneView gap={6} items="end">
          <RuneView padding={[2, 8, 2, 8]} fill={HH.night} border={{ width: 1, color: "#76d4c366" }} radius={3}><Text family={DISPLAY} size={14} tracking={1} color={HH.cream} text={dash.label} /></RuneView>
          <Lcd layout="row" gap={6} items="end" padding={[4, 8, 4, 8]}>
            {dash.aircraft ? null : <LcdText size={18} weight={800} color={bind(() => (telemetry().gear < 0 ? "#b0201a" : HH.lcdInk))} text={bind(() => { const g = telemetry().gear; return g < 0 ? "R" : g === 0 ? "N" : String(g); })} />}
            <Text family={DISPLAY} size={compact ? 26 : 32} color={HH.lcdInk} text={bind(() => String(kmhOf(telemetry())))} />
            <LcdText size={11} text="km/h" />
          </Lcd>
          {dash.redline <= 0 ? null : (
            <Row gap={2}>{LAMPS.map((i) => <RuneView key={i} width={7} height={10} radius={2} fill={bind(() => (i < Math.min(10, Math.round((telemetry().rpm / dash.redline) * 10)) ? (i >= 8 ? HH.siren : HH.amber) : "#2a2a2a"))} />)}</Row>
          )}
          {dash.aircraft ? (
            <RuneView padding={[2, 8, 2, 8]} radius={3} fill={bind(() => (telemetry().stalled ? HH.siren : "#1b2326"))}>
              <Text mono size={12} weight={700} color={HH.cream} text={bind(() => { const t = telemetry(); return t.stalled ? "Stall" : `${Math.round(t.altitude)} m up`; })} />
            </RuneView>
          ) : null}
        </RuneView>
        <Dial telemetry={telemetry} top={dash.top} size={size} />
      </Row>
      {dash.vtol && vector !== undefined ? <Row gap={6}><KeyCap>{vector}</KeyCap><Label color={HH.cream} text="Switch to wings" /></Row> : null}
      {exit === undefined ? null : <Row gap={6}><KeyCap>{exit}</KeyCap><Label color={HH.cream} text="Get out" /></Row>}
    </RuneView>
  );
}
