import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import "../../style.css";
import { SettingsTrigger, useBrowserSuspension } from "@jgengine/react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/core/hud/hudLayout.view";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { GameIcon, type GameIconName } from "@jgengine/core/ui/icons/gameIcons.view";
import { useGameFonts } from "@jgengine/core/ui/fonts.view";
import { useRegisterLayoutRegion } from "@jgengine/core/ui/viewport.view";
import { useActionBindings } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runSessionStore, type RunSession, type SessionSnapshot } from "../run/session";
import { ROW_SIX_TRACK, trackById } from "../tracks/catalog";
import { PART_SLOTS, partById } from "../parts/catalog";
import { claimedChange } from "../parts/build";
import { driveInputStore } from "../run/store";
import type { DriveInput } from "../vehicle/input";
import { FoundryMenu } from "./menu/FoundryMenu";
import { RunResults } from "./components/RunResults";
import { launchCue } from "./launchCue";
import { BuildRack, CrusherBar, DashTab, GateSign, RouteRule, SalvageTag, TimingTower, Tach } from "./DashHud";
import { GAME_FONTS } from "../../art/fonts/fonts";

const toSnapshot = (session: RunSession | undefined): SessionSnapshot | null => session?.snapshot() ?? null;

// The HUD re-renders every tick for the live dials; the parts that only change between ticks of a
// different kind skip those renders.
const racing = (snapshot: SessionSnapshot) => snapshot.phase === "running" && !snapshot.paused;
/** The title and pause menus are closed while racing: nothing in them moves with the kart. */
const RunMenus = memo(FoundryMenu, (before, after) => before.session === after.session && racing(before.snapshot) && racing(after.snapshot));

const RunRail = memo(function RunRail({ onPause }: { onPause: () => void }) {
  return (
    <nav className="fd-dash-rail" aria-label="Run">
      <DashTab icon="pause" label="Pause run" keyCap="P" onPress={onPause}/>
      <SettingsTrigger className="fd-gear" label="Settings"><span className="fd-gear-face"><GameIcon name="gear" size={17} color="#f2c230"/></span></SettingsTrigger>
    </nav>
  );
});

// Each panel re-renders only when something it shows changes, not on every tick of the run.
type TachProps = Parameters<typeof Tach>[0];
const DashPanel = memo(function DashPanel(props: TachProps) {
  return <HudPanel id="dash" anchor="bottom-left" priority="critical" interactive={false}><div className="fd-dash"><Tach {...props}/></div></HudPanel>;
}, (a, b) => Math.round(a.kmh) === Math.round(b.kmh) && Math.round(a.redline) === Math.round(b.redline) && a.airborne === b.airborne && a.bent === b.bent && a.armor === b.armor);

/** What the crusher bar draws: metres, the jaw to a tenth of a percent, and its fade bucket. */
const crusherShown = (gap: number) => `${Math.round(gap)}|${Math.round((1 - Math.min(60, Math.max(0, gap)) / 60) * 1000)}|${Math.round(gap / 6)}|${gap < 22}`;
const CrusherPanel = memo(function CrusherPanel({ gap, surge }: { gap: number; surge: boolean }) {
  return <HudPanel id="crusher" anchor="bottom" priority="critical" interactive={false}><CrusherBar gap={gap} surge={surge}/></HudPanel>;
}, (a, b) => a.surge === b.surge && crusherShown(a.gap) === crusherShown(b.gap));

type Track = typeof ROW_SIX_TRACK;
const mainGateLists = new WeakMap<Track, Track["gates"]>();
/** The main-line barriers of a track, one list per track so the route panel can tell nothing changed. */
function mainGates(track: Track): Track["gates"] {
  const known = mainGateLists.get(track);
  if (known !== undefined) return known;
  const gates = track.gates.filter((gate) => gate.route === "main");
  mainGateLists.set(track, gates);
  return gates;
}
type RouteProps = Required<Pick<Parameters<typeof RouteRule>[0], "length" | "gates">> & Omit<Parameters<typeof RouteRule>[0], "length" | "gates"> & { clearedCount: number };
const routeAlong = (props: Pick<RouteProps, "z" | "length">) => Math.round((Math.min(props.length, Math.max(0, props.z)) / props.length) * 1000);
const RoutePanel = memo(function RoutePanel({ clearedCount: _clearedCount, ...props }: RouteProps) {
  return <HudPanel id="route" anchor="bottom-right" chip="route" interactive={false}><RouteRule {...props}/></HudPanel>;
}, (a, b) => a.cleared === b.cleared && a.clearedCount === b.clearedCount && a.next === b.next && a.atRisk === b.atRisk && a.gates === b.gates && a.length === b.length && routeAlong(a) === routeAlong(b));

type TowerProps = Parameters<typeof TimingTower>[0];
/** Everything the timing tower prints, as one string: the lap clock to a tenth, the field, the event and ghost. */
const towerShown = ({ race, event, ghost }: TowerProps) => JSON.stringify([
  race.place, race.total, race.lap, race.laps, race.lapTime.toFixed(1), race.standings.map((entry) => [entry.id, entry.place, entry.name]),
  event ?? null, ghost == null ? null : [ghost.best.toFixed(1), ghost.aheadMetres],
]);
const TowerPanel = memo(function TowerPanel(props: TowerProps) {
  return <HudPanel id="tower" anchor="top-left" chip="standings" interactive={false}><TimingTower {...props}/></HudPanel>;
}, (a, b) => towerShown(a) === towerShown(b));

const SignPanel = memo(function SignPanel(props: Parameters<typeof GateSign>[0]) {
  return <HudPanel id="sign" anchor="top" priority="critical" interactive={false}><GateSign {...props}/></HudPanel>;
});
const RailPanel = memo(function RailPanel({ onPause }: { onPause: () => void }) {
  return <HudPanel id="rail" anchor="top-right" priority="critical"><RunRail onPause={onPause}/></HudPanel>;
});
const RackPanel = memo(function RackPanel(props: Parameters<typeof BuildRack>[0]) {
  return <HudPanel id="rack" anchor="top-right" order={1} chip="build" interactive={false}><BuildRack {...props}/></HudPanel>;
}, (before, after) => PART_SLOTS.every((slot) => before.installed[slot] === after.installed[slot]));

type PartDef = NonNullable<ReturnType<typeof partById>>;
const TagPanel = memo(function TagPanel({ metres, offered, replacing, armed }: { metres: number; offered: PartDef; replacing: PartDef; armed: boolean }) {
  const speedDelta = (claimedChange(offered, "topSpeed") - claimedChange(replacing, "topSpeed")) * 3.6;
  return <HudPanel id="tag" anchor="right" priority="critical" interactive={false}><SalvageTag>
    <span className="fd-tag-head"><b>{metres}m</b> {offered.slot}</span>
    <strong>{offered.label} or keep {replacing.label}?</strong>
    <p className="fd-tag-blurb">{offered.blurb}</p>
    <p className="fd-tag-delta">Speed {speedDelta > 0 ? "+" : ""}{speedDelta.toFixed(0)} km/h · steering {(claimedChange(offered, "turnRate") - claimedChange(replacing, "turnRate")).toFixed(1)}</p>
    {offered.slot === "frame" && (offered.grants?.armor ?? 0) > 0 && <p>{armed ? "Crusher protection already armed: this swap adds no extra save." : "This swap restores protection against one crusher clip."}</p>}
    <b className="fd-tag-how"><kbd>E</kbd> hold to swap while passing · pass freely to keep</b>
  </SalvageTag></HudPanel>;
});

/** Every race panel's props, from one snapshot. */
function raceHud(snapshot: SessionSnapshot) {
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
  const tone: Parameters<typeof GateSign>[0]["tone"] = jumpNow ? "launch" : advice !== null ? "stop" : !nextGate ? "home" : nextGate.requirement === "jump" ? "jump" : "plow";
  return {
    tower: { race: snapshot.race, event: snapshot.event, ghost: snapshot.ghost },
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
    crusher: { gap: snapshot.compactorGap, surge: snapshot.compactorSurge !== null },
    route: {
      z: run,
      length: track.exitAt,
      gates: mainGates(track),
      cleared: snapshot.clearedGateIds,
      clearedCount: snapshot.clearedGateIds.size,
      atRisk: snapshot.salvageAtRisk,
      next: snapshot.hazards.length > 0 ? snapshot.hazards[0]!.label : nextPickup ? `NEXT SALVAGE · ${partById(nextPickup.partId)?.label} · ${Math.max(0, Math.round(nextPickup.at - run))}m` : "ALL SALVAGE PASSED · EXIT AHEAD",
    },
  };
}

const shownCache = new WeakMap<SessionSnapshot, string>();
/** What the race HUD draws from a snapshot, as one string: two snapshots that read the same draw the same. */
function raceHudShown(snapshot: SessionSnapshot): string {
  const cached = shownCache.get(snapshot);
  if (cached !== undefined) return cached;
  const { tower, sign, installed, tag, dash, crusher, route } = raceHud(snapshot);
  const shown = JSON.stringify([
    snapshot.track.id, towerShown(tower), sign, PART_SLOTS.map((slot) => installed[slot]?.id ?? null),
    tag === null ? null : [tag.metres, tag.offered.id, tag.replacing.id, tag.armed],
    Math.round(dash.kmh), Math.round(dash.redline), dash.airborne, dash.bent, dash.armor,
    crusherShown(crusher.gap), crusher.surge,
    routeAlong(route), route.length, route.cleared.size, route.atRisk, route.next,
  ]);
  shownCache.set(snapshot, shown);
  return shown;
}

/**
 * While racing, the HUD re-renders only when something it draws changes; the run ticks far more often
 * than the dials move. Off the road (menus, pause, results) every snapshot renders.
 */
const sameRaceScreen = (before: SessionSnapshot | null, after: SessionSnapshot | null) =>
  before !== null && after !== null && racing(before) && racing(after) && raceHudShown(before) === raceHudShown(after);

/** Touch pedals stay full size outside the scaled HUD; as control regions they keep HUD panels off them. */
const TouchControls = memo(function TouchControls({ drive }: { drive: DriveInput | undefined }) {
  const touch = (action: string, label: string, icon: GameIconName | null, kind: string) => <button type="button" className="fd-pad" data-kind={kind} aria-label={label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drive?.press(action); }} onPointerUp={() => drive?.release(action)} onPointerCancel={() => drive?.release(action)} onLostPointerCapture={() => drive?.release(action)}>{icon === null ? null : <GameIcon name={icon} size={kind === "steer" ? 30 : 20} />}{kind === "steer" ? null : <span>{label}</span>}</button>;
  return (
    <div className="fd-touch">
      <TouchPads id="control:steer" className="fd-touch-steer">{touch("steerLeft", "Steer left", "arrowLeft", "steer")}{touch("steerRight", "Steer right", "arrowRight", "steer")}</TouchPads>
      <TouchPads id="control:pedals" className="fd-touch-act">{touch("jumpHop", "JUMP", "jump", "act")}{touch("salvageSwap", "SWAP", "swap", "act")}{touch("plowBrace", "BRACE", "shield", "act")}{touch("brake", "BRAKE", null, "brake")}{touch("throttle", "GO", null, "go")}</TouchPads>
    </div>
  );
});
function publishSession(ctx: GameContext, session: RunSession) {
  runSessionStore.write(ctx, session);
  const snapshot = session.snapshot();
  setGamePhase(ctx, snapshot.phase === "running" ? snapshot.paused ? "paused" : "playing" : snapshot.phase === "start" ? "menu" : "ended");
}

export function GameUI() {
  useGameFonts(GAME_FONTS);
  const snapshot = useStore(runSessionStore, toSnapshot, sameRaceScreen);
  const session = useStore(runSessionStore);
  const drive = useStore(driveInputStore);
  const { commands } = useGame();
  const ctx = useGameStore(context => context);
  const settings = useSettings();
  const bindings = useActionBindings();
  const uiRef = useRef<HTMLDivElement>(null);
  const layout = useHudLayout({ storageKey: "drift-foundry" });
  useLayoutEffect(() => {
    // The published shell listens on its focusable viewport. Removed menu/dialog
    // buttons otherwise leave focus on body, so keyboard driving never reaches it.
    if (snapshot?.phase === "running" && !snapshot.paused && !settings.isOpen && !document.hidden) {
      uiRef.current?.closest<HTMLElement>("[tabindex='0']")?.focus({ preventScroll: true });
    }
  }, [snapshot?.phase, snapshot?.paused, settings.isOpen]);
  useEffect(() => {
    drive?.refreshBindings(bindings);
    const suspend = () => {
      session?.suspend(settings.isOpen || document.hidden);
      if (settings.isOpen || document.hidden) drive?.reset();
      if (session) publishSession(ctx, session);
    };
    suspend();
    document.addEventListener("visibilitychange", suspend);
    return () => document.removeEventListener("visibilitychange", suspend);
  }, [ctx, session, settings.isOpen, drive, bindings]);
  useBrowserSuspension(() => drive?.reset(), { hidden: false, pointerLockLost: false });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || settings.isOpen || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]"))) return;
      const phase = session?.snapshot().phase;
      const action = phase === "running" ? drive?.keyDown(event.code) : null;
      if (event.code === "KeyR" && (phase === "won" || phase === "crushed")) commands.run("restart", {});
      if (action === "pauseRun" && phase === "running") { session?.togglePause(); drive?.reset(); if (session) publishSession(ctx, session); }
    };
    window.addEventListener("keydown", key);
    const release = (event: KeyboardEvent) => drive?.keyUp(event.code);
    window.addEventListener("keyup", release);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", release); };
  }, [ctx, session, commands, settings.isOpen, drive]);
  const togglePause = useCallback(() => {
    if (!session) return;
    session.togglePause();
    publishSession(ctx, session);
    drive?.reset();
  }, [ctx, session, drive]);
  if (!snapshot || !session) return null;
  const returnToTitle = () => { session.returnToTitle(); publishSession(ctx, session); drive?.reset(); };
  const hud = snapshot.phase === "running" ? raceHud(snapshot) : null;
  return <>
    <RunMenus snapshot={snapshot} session={session} publish={() => publishSession(ctx, session)}/>
    <div className="fd-ui" ref={uiRef}>
    {hud !== null && <><HudCanvas layout={layout} editChord={false}>
      <TowerPanel {...hud.tower}/>
      <SignPanel {...hud.sign}/>
      <RailPanel onPause={togglePause}/>
      <RackPanel installed={hud.installed}/>
      {hud.tag === null ? null : <TagPanel {...hud.tag}/>}
      <DashPanel {...hud.dash}/>
      <CrusherPanel {...hud.crusher}/>
      <RoutePanel {...hud.route}/>
    </HudCanvas>
    <TouchControls drive={drive}/></>}
    {(snapshot.phase === "won" || snapshot.phase === "crushed") && <RunResults snapshot={snapshot} onRestart={() => commands.run("restart", {})} onTitle={returnToTitle}/>}
    </div>
  </>;
}

function TouchPads({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useRegisterLayoutRegion(useMemo(() => ({ id, kind: "control", collisionPolicy: "forbid" }) as const, [id]), ref);
  return <div ref={ref} className={className}>{children}</div>;
}
