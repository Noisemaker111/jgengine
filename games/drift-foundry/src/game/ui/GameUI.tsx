import { useEffect, useLayoutEffect, useRef } from "react";
import "../../style.css";
import { SettingsTrigger, useBrowserSuspension } from "@jgengine/react";
import { useSettings } from "@jgengine/react/settings";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useGameFonts } from "@jgengine/react/gameFonts";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runSessionStore, type RunSession, type SessionSnapshot } from "../run/session";
import { ROW_SIX_TRACK, trackById } from "../tracks/catalog";
import { partById } from "../parts/catalog";
import { claimedChange } from "../parts/build";
import { driveInputStore } from "../run/store";
import { FoundryMenu } from "./menu/FoundryMenu";
import { RunResults } from "./components/RunResults";
import { launchCue } from "./launchCue";
import { BuildRack, CrusherBar, DashTab, GateSign, RouteRule, SalvageTag, TimingTower, Tach } from "./DashHud";
import { GAME_FONTS } from "../../art/fonts/fonts";

const toSnapshot = (session: RunSession | undefined): SessionSnapshot | null => session?.snapshot() ?? null;
function publishSession(ctx: GameContext, session: RunSession) {
  runSessionStore.write(ctx, session);
  const snapshot = session.snapshot();
  setGamePhase(ctx, snapshot.phase === "running" ? snapshot.paused ? "paused" : "playing" : snapshot.phase === "start" ? "menu" : "ended");
}

export function GameUI() {
  useGameFonts(GAME_FONTS);
  const snapshot = useStore(runSessionStore, toSnapshot);
  const session = useStore(runSessionStore);
  const drive = useStore(driveInputStore);
  const { commands } = useGame();
  const ctx = useGameStore(context => context);
  const settings = useSettings();
  const uiRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // The published shell listens on its focusable viewport. Removed menu/dialog
    // buttons otherwise leave focus on body, so keyboard driving never reaches it.
    if (snapshot?.phase === "running" && !snapshot.paused && !settings.isOpen && !document.hidden) {
      uiRef.current?.closest<HTMLElement>("[tabindex='0']")?.focus({ preventScroll: true });
    }
  }, [snapshot?.phase, snapshot?.paused, settings.isOpen]);
  useEffect(() => {
    drive?.refreshBindings();
    const suspend = () => {
      session?.suspend(settings.isOpen || document.hidden);
      if (settings.isOpen || document.hidden) drive?.reset();
      if (session) publishSession(ctx, session);
    };
    suspend();
    document.addEventListener("visibilitychange", suspend);
    return () => document.removeEventListener("visibilitychange", suspend);
  }, [ctx, session, settings.isOpen, drive]);
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
  if (!snapshot || !session) return null;
  const togglePause = () => { session.togglePause(); publishSession(ctx, session); drive?.reset(); };
  const returnToTitle = () => { session.returnToTitle(); publishSession(ctx, session); drive?.reset(); };
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
  const touch = (action: string, label: string, icon: GameIconName | null, kind: string) => <button type="button" className="fd-pad" data-kind={kind} aria-label={label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drive?.press(action); }} onPointerUp={() => drive?.release(action)} onPointerCancel={() => drive?.release(action)} onLostPointerCapture={() => drive?.release(action)}>{icon === null ? null : <GameIcon name={icon} size={kind === "steer" ? 30 : 20} />}{kind === "steer" ? null : <span>{label}</span>}</button>;
  const blocked = snapshot.pose.blockedByGate;
  const call = launchCue(snapshot) ?? (blocked ? snapshot.tuning.jumpPower > 0 && nextGate?.requirement === "jump" ? "JUMP TO CLEAR THE STACK" : "MISSING ROUTE PART" : jumpNow ? "JUMP NOW - SPACE" : nextGate?.requirement === "jump" ? "JUMP ON THE TEAL MARKS" : nextGate ? "KEEP THE PLOW POINTED FORWARD" : "BRING IT HOME");
  const signTone = jumpNow ? "launch" : blocked ? "stop" : !nextGate ? "home" : nextGate.requirement === "jump" ? "jump" : "plow";
  const speedDelta = offeredPart && replacing ? (claimedChange(offeredPart, "topSpeed") - claimedChange(replacing, "topSpeed")) * 3.6 : 0;
  return <>
    <FoundryMenu snapshot={snapshot} session={session} publish={() => publishSession(ctx, session)}/>
    <div className="fd-ui" ref={uiRef}>
    {snapshot.phase === "running" && <>
      <TimingTower race={snapshot.race} event={snapshot.event} ghost={snapshot.ghost}/>
      <GateSign eyebrow={`${nextGate ? `NEXT ${nextGate.requirement === "jump" ? "JUMP STACK" : "PLOW WALL"}` : "EXIT GATE"} / ${Math.ceil(Math.max(0, distance))}m`} call={call} sub={nextGate?.label ?? `${track.exitAt}m escape line`} tone={signTone}/>
      <nav className="fd-dash-rail" aria-label="Run">
        <DashTab icon="pause" label="Pause run" keyCap="P" onPress={togglePause}/>
        <SettingsTrigger className="fd-gear" label="Settings"><span className="fd-gear-face"><GameIcon name="gear" size={17} color="#f2c230"/></span></SettingsTrigger>
      </nav>
      <BuildRack installed={snapshot.installed}/>
      {deliberateSwap && offeredPart && replacing && decisionPickup && decisionPickup.at - run < 60 && <SalvageTag>
        <span className="fd-tag-head"><b>{Math.round(Math.max(0, decisionPickup.at - run))}m</b> {offeredPart.slot}</span>
        <strong>{offeredPart.label} or keep {replacing.label}?</strong>
        <p className="fd-tag-blurb">{offeredPart.blurb}</p>
        <p className="fd-tag-delta">Speed {speedDelta > 0 ? "+" : ""}{speedDelta.toFixed(0)} km/h · steering {(claimedChange(offeredPart, "turnRate") - claimedChange(replacing, "turnRate")).toFixed(1)}</p>
        {offeredPart.slot === "frame" && (offeredPart.grants?.armor ?? 0) > 0 && <p>{snapshot.armorSaveArmed ? "Crusher protection already armed: this swap adds no extra save." : "This swap restores protection against one crusher clip."}</p>}
        <b className="fd-tag-how"><kbd>E</kbd> hold to swap while passing · pass freely to keep</b>
      </SalvageTag>}
      <div className="fd-dash">
        <Tach kmh={snapshot.pose.speedKmh} redline={snapshot.tuning.topSpeed * 3.6} airborne={snapshot.pose.airborne} bent={snapshot.damage.some((zone) => zone.stage > 0)} armor={snapshot.armorSaveArmed}/>
      </div>
      <CrusherBar gap={snapshot.compactorGap} surge={snapshot.compactorSurge !== null}/>
      <RouteRule z={run} length={track.exitAt} gates={track.gates.filter(g => g.route === "main")} cleared={snapshot.clearedGateIds} atRisk={snapshot.salvageAtRisk} next={snapshot.hazards.length > 0 ? snapshot.hazards[0]!.label : nextPickup ? `NEXT SALVAGE · ${partById(nextPickup.partId)?.label} · ${Math.max(0, Math.round(nextPickup.at - run))}m` : "ALL SALVAGE PASSED · EXIT AHEAD"}/>
      <div className="fd-touch"><div className="fd-touch-steer">{touch("steerLeft", "Steer left", "arrowLeft", "steer")}{touch("steerRight", "Steer right", "arrowRight", "steer")}</div><div className="fd-touch-act">{touch("jumpHop", "JUMP", "jump", "act")}{touch("salvageSwap", "SWAP", "swap", "act")}{touch("plowBrace", "BRACE", "shield", "act")}{touch("brake", "BRAKE", null, "brake")}{touch("throttle", "GO", null, "go")}</div></div>
    </>}
    {(snapshot.phase === "won" || snapshot.phase === "crushed") && <RunResults snapshot={snapshot} onRestart={() => commands.run("restart", {})} onTitle={returnToTitle}/>}
    </div>
  </>;
}
