import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RunSession, SessionSnapshot } from "../run/session";
import { ROW_SIX_TRACK, trackById } from "../tracks/catalog";
import { PART_SLOTS, partById } from "../parts/catalog";
import { launchCue } from "./launchCue";

type Track = typeof ROW_SIX_TRACK;
export type SignTone = "plow" | "jump" | "launch" | "stop" | "home";

const mainGateLists = new WeakMap<Track, Track["gates"]>();
/** The main-line barriers of a track, one stable list per track. */
function mainGates(track: Track): Track["gates"] {
  const known = mainGateLists.get(track);
  if (known !== undefined) return known;
  const gates = track.gates.filter((gate) => gate.route === "main");
  mainGateLists.set(track, gates);
  return gates;
}

/** Everything the race HUD shows, read from one snapshot. */
export function raceHud(snapshot: SessionSnapshot) {
  const track = trackById(snapshot.track.id) ?? ROW_SIX_TRACK;
  const run = snapshot.run;
  // Only what is on the road ahead counts: a shortcut's wall is not in the way of a kart on the main line.
  const shortcut = track.def.branches.find(branch => branch.id === snapshot.route);
  const onMyRoad = (route: string, at: number) => route === snapshot.route || (route === "main" && (shortcut === undefined || at > shortcut.to));
  const nextGate = track.gates.find(g => !snapshot.clearedGateIds.has(g.id) && g.atZ >= run - 1 && onMyRoad(g.route, g.atZ));
  const distance = nextGate ? Math.max(0, nextGate.atZ - run) : track.exitAt - run;
  const jumpNow = nextGate?.requirement === "jump" && distance <= Math.max(5, snapshot.pose.speedKmh / 3.6 * .5);
  const nextPickup = track.pickups.find(p => !snapshot.collectedIds.has(p.id) && p.at >= run - 3 && onMyRoad(p.route, p.at));
  const decisionPickup = track.pickups.find(p => {
    const part = partById(p.partId);
    return !snapshot.collectedIds.has(p.id) && p.at >= run - 3 && onMyRoad(p.route, p.at) && part !== null && (part.slot === "engine" || part.slot === "frame") && snapshot.installed[part.slot] !== null;
  });
  const offeredPart = decisionPickup ? partById(decisionPickup.partId) : null;
  const replacing = offeredPart ? snapshot.installed[offeredPart.slot] : null;
  const deliberateSwap = offeredPart !== null && replacing !== null && (offeredPart.slot === "engine" || offeredPart.slot === "frame");
  const advice = snapshot.gateAdvice;
  const call = launchCue(snapshot) ?? (advice !== null ? advice.call : jumpNow ? "JUMP NOW - SPACE" : nextGate?.requirement === "jump" ? "JUMP ON THE TEAL MARKS" : nextGate ? "KEEP THE PLOW POINTED FORWARD" : "BRING IT HOME");
  const tone: SignTone = jumpNow ? "launch" : advice !== null ? "stop" : !nextGate ? "home" : nextGate.requirement === "jump" ? "jump" : "plow";
  const gates = mainGates(track);
  return {
    race: snapshot.race,
    event: snapshot.event,
    ghost: snapshot.ghost,
    sign: {
      eyebrow: `${nextGate ? `NEXT ${nextGate.requirement === "jump" ? "JUMP STACK" : "PLOW WALL"}` : "EXIT GATE"} / ${Math.ceil(Math.max(0, distance))}m`,
      call,
      sub: advice?.sub ?? nextGate?.label ?? `${track.exitAt}m escape line`,
      tone,
    },
    installed: snapshot.installed,
    tag: deliberateSwap && offeredPart && replacing && decisionPickup && decisionPickup.at - run < 60
      ? { metres: Math.round(Math.max(0, decisionPickup.at - run)), offered: offeredPart, replacing, armed: snapshot.armorSaveArmed }
      : null,
    dash: { kmh: snapshot.pose.speedKmh, redline: snapshot.tuning.topSpeed * 3.6, airborne: snapshot.pose.airborne, bent: snapshot.damage.some((zone) => zone.stage > 0), armor: snapshot.armorSaveArmed },
    crusher: { gap: snapshot.compactorGap, surge: snapshot.compactorSurge !== null, danger: snapshot.compactorGap < 22 },
    route: {
      z: run,
      length: track.exitAt,
      gates,
      cleared: gates.filter((gate) => snapshot.clearedGateIds.has(gate.id)).length,
      clearedIds: snapshot.clearedGateIds,
      atRisk: snapshot.salvageAtRisk,
      next: snapshot.hazards.length > 0 ? snapshot.hazards[0]!.label : nextPickup ? `NEXT SALVAGE · ${partById(nextPickup.partId)?.label} · ${Math.max(0, Math.round(nextPickup.at - run))}m` : "ALL SALVAGE PASSED · EXIT AHEAD",
    },
  };
}
export type RaceHud = ReturnType<typeof raceHud>;

/** A label with its metre count taken out: the count is bound live, the rest changes at a moment. */
const withoutMetres = (text: string) => text.replace(/\d+ ?m\b/g, "");

/**
 * What the composed screen depends on, as one string. Two snapshots with the same key draw the same
 * tree; everything else (speed, distances, clocks, the jaw, the ghost gap) is bound at its leaf.
 */
export function screenKey(snapshot: SessionSnapshot): string {
  const base = [snapshot.phase, snapshot.paused];
  if (snapshot.phase === "running" && !snapshot.paused) {
    const hud = raceHud(snapshot);
    return JSON.stringify([...base, snapshot.track.id, hud.race.place, hud.race.total, hud.race.lap, hud.race.laps, hud.race.standings.map((entry) => [entry.id, entry.place, entry.name]),
      hud.event.label, hud.event.next, hud.ghost === null, hud.sign.call, hud.sign.sub, hud.sign.tone, withoutMetres(hud.sign.eyebrow),
      PART_SLOTS.map((slot) => hud.installed[slot]?.id ?? null), hud.tag === null ? null : [hud.tag.offered.id, hud.tag.replacing.id, hud.tag.armed],
      Math.round(hud.dash.redline), hud.dash.airborne, hud.dash.bent, hud.dash.armor, hud.crusher.danger, hud.crusher.surge,
      hud.route.length, hud.route.cleared, hud.route.atRisk]);
  }
  // Off the road nothing moves with the kart: the pit, the pause board and the results read whole.
  return JSON.stringify([...base, snapshot.track.id, snapshot.event.id, snapshot.career, snapshot.calendar.points, snapshot.calendar.tiers.map((tier) => tier.events.map((entry) => [entry.event.id, entry.selected, entry.medal, entry.best])),
    snapshot.parkedRun?.runTime ?? null, snapshot.records, snapshot.recordsSaved, snapshot.runsPlayed, snapshot.outcome?.time ?? null, snapshot.outcome?.kind ?? null,
    snapshot.shift?.id ?? null, Math.floor(snapshot.run), snapshot.runTime.toFixed(1), snapshot.pose.speedKmh > 1, snapshot.pose.airborne, snapshot.salvageAtRisk, snapshot.zone.label,
    PART_SLOTS.map((slot) => snapshot.installed[slot]?.id ?? null)]);
}

/** One snapshot per store write, shared by every bound leaf in a frame. */
export function liveRace(ctx: GameContext, session: RunSession) {
  let version = -1, snapshot: SessionSnapshot | undefined, hud: RaceHud | null | undefined;
  const read = (): SessionSnapshot => {
    const now = ctx.version();
    if (snapshot === undefined || now !== version) { version = now; snapshot = session.snapshot(); hud = undefined; }
    return snapshot;
  };
  return {
    read,
    /** The race HUD this frame, or `null` off the road. */
    hud(): RaceHud | null {
      const current = read();
      if (hud === undefined) hud = current.phase === "running" ? raceHud(current) : null;
      return hud;
    },
  };
}
export type LiveRace = ReturnType<typeof liveRace>;
