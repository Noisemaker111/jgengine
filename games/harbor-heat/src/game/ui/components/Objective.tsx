import { useEffect, useRef } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { compassBearing, headingToBearing, relativeBearing } from "@jgengine/core/world/minimap";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useHudAwake } from "@jgengine/react/hudFade";
import { useInputDevice } from "@jgengine/react/inputDevice";
import { deadlineStage, formatCountdown } from "@jgengine/react/kitFlow";
import { useUiCue } from "@jgengine/react/uiCues";
import { useActionGlyph } from "@jgengine/react/uiKitRoot";
import { city } from "../../city";
import { cityOf } from "../../cityRuntime";
import { frontViews } from "../../city/fronts";
import { RACE_ENTRY_FEE, SAFEHOUSE_PRICE } from "../../commands";
import { drivingStore, raceStore } from "../../handroll";
import { cargoStore } from "../../items/cargoHaul";
import { bountyPayout, bountyStore } from "../../jobs/bounties";
import { courierDeadline, courierObjectiveStore, courierStore, DELIVERY_ROUTES, DISPATCH, RUSH_BOND, THIEF } from "../../jobs/courier";
import { GIG_RACE_STAKE, gigStore, spotLabel } from "../../jobs/gigs";
import { prompts, systemPromptLabel } from "../../prompts";
import { BOUNTY_SPOTS, RACE_ROUTES } from "../../world/districts";
import { KeyCap, Lcd } from "../fiction/kit";

type XZ = readonly [number, number];
const xz = (p: readonly number[]): XZ => [p[0]!, p[2]!];

/** The longest each job timer has shown, so its countdown has a total to warn against. */
const timerTotals = new Map<string, number>();

interface Goal {
  key: string;
  eyebrow?: string;
  title: string;
  target?: XZ;
  deadline?: { remaining: number; total: number };
  hint?: string;
  rush?: string;
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
function goalOf(ctx: GameContext, at: XZ): Goal {
  const race = raceStore.read(ctx);
  const circuit = race?.active === true ? RACE_ROUTES.find((r) => r.id === race.routeId) : undefined;
  if (race !== undefined && circuit !== undefined) {
    return { key: `race:${circuit.id}`, eyebrow: `${race.label} · ${race.position === 1 ? "leading" : "second"}`, title: `Gate ${Math.min(race.checkpoint + 1, race.total)} of ${race.total}`, target: circuit.checkpoints[Math.min(race.checkpoint, circuit.checkpoints.length - 1)], hint: "Drive through each gate in order." };
  }
  const gig = gigGoal(ctx);
  if (gig !== null && gig.key.startsWith("gig:job")) return gig;
  const courier = courierStore.read(ctx);
  if (courier.phase === "running") {
    const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
    const step = courierObjectiveStore.read(ctx);
    if (step?.step === 2) {
      const runner = ctx.scene.entity.get(THIEF);
      return { key: "runner", eyebrow: "Parcel snatched", title: "Catch the runner", target: runner === null ? undefined : xz(runner.position), deadline: step.remaining === null ? undefined : { remaining: step.remaining, total: 60 }, hint: "Get within 3 m. Keep them alive or the parcel burns." };
    }
    const rush = courier.service === "rush";
    const crates = cargoStore.read(ctx).carried;
    const load = rush ? `Fragile parcel · ${Math.round(courier.condition ?? 100)}% intact` : crates > 0 ? `Parcel + ${crates} crates` : "Parcel aboard";
    return { key: `parcel:${courier.route}`, eyebrow: load, title: `Deliver to ${route.recipient}`, target: route.position, deadline: { remaining: courier.remaining, total: courierDeadline(route.seconds, rush) }, hint: rush ? "Stay under 35 km/h and avoid hits: damage spoils the cargo." : `${route.hint} Stop beside it to hand over.` };
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

/** The goal plus where it is from here: rounded so the card redraws a few times a second, not every frame. */
function objectiveView(ctx: GameContext) {
  const player = ctx.scene.entity.get(ctx.player.userId);
  const body = ctx.scene.entity.get(drivingStore.read(ctx) ?? ctx.player.userId) ?? player;
  if (body === null || player === null) return null;
  const at = xz(body.position);
  const goal = goalOf(ctx, at);
  const active = resolveActivePrompt({ x: player.position[0], z: player.position[2] }, prompts(ctx));
  const target = goal.target;
  return {
    ...goal,
    distance: target === undefined ? undefined : Math.round(Math.hypot(target[0] - at[0], target[1] - at[1])),
    bearing: target === undefined ? undefined : Math.round(relativeBearing(compassBearing(at, target), headingToBearing(body.rotationY)) * 20) / 20,
    deadline: goal.deadline === undefined ? undefined : { remaining: Math.ceil(goal.deadline.remaining * 4) / 4, total: goal.deadline.total },
    prompt: active?.prompt.invoke == null ? null : { id: active.id, label: systemPromptLabel(ctx, active.id), name: active.prompt.invoke.name, input: active.prompt.invoke.input },
  };
}

const sameView = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The pointer on the pager: which way to go from where the courier faces. */
function Bearing({ radians }: { radians: number }) {
  return (
    <svg className="hh-pager-arrow" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${radians}rad)` }}>
      <path d="M12 2 L20.5 12 L15 12 L15 22 L9 22 L9 12 L3.5 12 Z" />
    </svg>
  );
}

/** The parcel clock as LCD segments draining left to right. */
function Fuse({ remaining, total }: { remaining: number; total: number }) {
  const lit = total <= 0 ? 0 : Math.ceil((Math.max(0, remaining) / total) * 16);
  return (
    <span className="hh-pager-fuse" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => <i key={i} data-lit={i < lit ? "" : undefined} />)}
    </span>
  );
}

/**
 * The courier's pager, clipped to the top-left of the screen: the job on an amber LCD, the arrow and
 * distance to it, the parcel clock (the backlight turns coral when it is nearly out), and a hint that
 * scrolls in only after twelve seconds without getting closer. Below it hangs the dispatch ticket for
 * whatever is in reach: the key to press (or TAP) and what it does.
 */
export function Objective() {
  const { commands } = useGame();
  const device = useInputDevice();
  const bound = useActionGlyph("interact", "E");
  const cue = useUiCue();
  const view = useGameStore(objectiveView, sameView);
  // The idle hint waits on real progress: getting closer, not just moving.
  const best = useRef({ key: "", distance: Infinity });
  const stage = view?.deadline === undefined || view === null ? "calm" : deadlineStage(view.deadline);
  const lastStage = useRef(stage);
  useEffect(() => {
    if (stage !== lastStage.current && stage !== "calm") cue(stage === "urgent" ? "deny" : "notify");
    lastStage.current = stage;
  }, [stage, cue]);
  if (view !== null && best.current.key !== view.key) best.current = { key: view.key, distance: Infinity };
  if (view?.distance !== undefined && view.distance < best.current.distance - 3) best.current.distance = view.distance;
  const progressKey = view === null ? "" : `${view.key}:${best.current.distance}`;
  const hasHint = view?.hint !== undefined;
  const moving = useHudAwake([progressKey], 12_000, !hasHint);
  const stuck = hasHint && !moving;
  useEffect(() => {
    if (stuck) cue("notify");
  }, [stuck, cue]);
  if (view === null) return null;
  const prompt = view.prompt;
  const glyph = device === "touch" ? "Tap" : (bound ?? "E");
  return (
    <div className="hh-obj">
      <div className="hh-pager" data-stage={stage} aria-live="polite">
        <span className="hh-pager-clip" aria-hidden="true" />
        <span className="hh-pager-brand" aria-hidden="true">Mainsail<b>page</b></span>
        <Lcd className="hh-pager-lcd" alarm={stage === "urgent"}>
          <span className="hh-pager-top">
            <small>{view.eyebrow ?? "Dispatch"}</small>
            {view.deadline === undefined ? null : <b className="hh-pager-clock">{formatCountdown(view.deadline.remaining)}</b>}
          </span>
          <span className="hh-pager-main">
            <b className="hh-pager-title">{view.title}</b>
            {view.distance === undefined ? null : (
              <span className="hh-pager-way">
                {view.bearing === undefined ? null : <Bearing radians={view.bearing} />}
                <span>{view.distance} m</span>
              </span>
            )}
          </span>
          {view.deadline === undefined ? null : <Fuse remaining={view.deadline.remaining} total={view.deadline.total} />}
          {stuck && view.hint !== undefined ? <span className="hh-pager-hint">{view.hint}</span> : null}
        </Lcd>
      </div>
      {prompt === null ? null : (
        <button type="button" className="hh-act" onClick={() => commands.run(prompt.name, prompt.input)}>
          <KeyCap wide={glyph.length > 2}>{glyph}</KeyCap>
          <span>{prompt.label ?? promptLabel(prompt.id)}</span>
        </button>
      )}
      {view.offer === undefined ? null : (
        <button type="button" className="hh-act rush" onClick={() => commands.run("gigs.accept", { id: view.offer!.id })}>
          <GameIcon name="flag" size={16} />
          <span>{view.offer.label}</span>
        </button>
      )}
      {view.rush === undefined ? null : (
        <button type="button" className="hh-act rush" onClick={() => commands.run("courier.accept", { service: "rush" })}>
          <GameIcon name="hourglass" size={16} />
          <span>{view.rush}</span>
        </button>
      )}
    </div>
  );
}
