/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useEffect, useMemo } from "@jgengine/core/ui/jsx";
import { RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useBrowserSuspension } from "@jgengine/core/runtime/browserLifecycle.view";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { Notice } from "@jgengine/core/notifications/notices";
import { runSessionStore, type RunSession } from "../run/session";
import { driveInputStore } from "../run/store";
import { GAME_FONTS } from "../../art/fonts/fonts";
import { PitMenu, PitSettings } from "./PitMenu";
import { RaceHud } from "./RaceHud";
import { Results } from "./Results";
import { liveRace, raceHud, screenKey } from "./hudModel";
import { RED, Sheet, Stamp, TEAL, Text, YELLOW, pitTheme } from "./pit";

for (const face of [GAME_FONTS.display, GAME_FONTS.body]) registerNativeRuneFont(resolveAssetBaseUrl(face.src));

function publishSession(ctx: GameContext, session: RunSession) {
  runSessionStore.write(ctx, session);
  const snapshot = session.snapshot();
  setGamePhase(ctx, snapshot.phase === "running" ? snapshot.paused ? "paused" : "playing" : snapshot.phase === "start" ? "menu" : "ended");
}

/** Touch pads show on a coarse pointer or a phone-width screen. */
const coarsePointer = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export function GameUI() {
  const ctx = useGameContext();
  const session = useStore(runSessionStore);
  // The tree recomposes only when what it draws changes; per-frame values are bound at their leaves.
  useStore(runSessionStore, (value) => value === undefined ? "" : screenKey(value.snapshot()));
  const drive = useStore(driveInputStore);
  const settings = useSettings();
  const bindings = useActionBindings();
  const { width } = useRuneViewport();
  const live = useMemo(() => session === undefined ? null : liveRace(ctx, session), [ctx, session]);
  const notices = useMemo(() => {
    // One salvage call at a time: the newest notice, as a stable slice until the feed changes.
    let list: readonly Notice[] | undefined, last: readonly Notice[] = [];
    return { read: () => { const next = ctx.game.notices.list(); if (next !== list) { list = next; last = next.slice(-1); } return last; }, subscribe: ctx.game.notices.subscribe };
  }, [ctx]);
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
      if (event.repeat || settings.isOpen || event.ctrlKey || event.metaKey || event.altKey) return;
      const phase = session?.snapshot().phase;
      const action = phase === "running" ? drive?.keyDown(event.code) : null;
      if (event.code === "KeyR" && (phase === "won" || phase === "crushed")) ctx.game.commands.run("restart", {});
      if (action === "pauseRun" && phase === "running") { session?.togglePause(); drive?.reset(); if (session) publishSession(ctx, session); }
    };
    const release = (event: KeyboardEvent) => drive?.keyUp(event.code);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", release);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", release); };
  }, [ctx, session, settings.isOpen, drive]);
  const togglePause = useCallback(() => {
    if (!session) return;
    session.togglePause();
    publishSession(ctx, session);
    drive?.reset();
  }, [ctx, session, drive]);
  if (session === undefined || live === null) return null;
  const snapshot = session.snapshot();
  const publish = () => publishSession(ctx, session);
  const returnToTitle = () => { session.returnToTitle(); publish(); drive?.reset(); };
  const racing = snapshot.phase === "running" && !snapshot.paused;
  const menu = snapshot.phase === "start" || (snapshot.phase === "running" && snapshot.paused && !settings.isOpen);
  return <RuneRoot context={ctx} theme={pitTheme}>
    {racing ? <RaceHud live={live} hud={raceHud(snapshot)} onPause={togglePause} onSettings={settings.open} drive={drive} touch={width < 600 || coarsePointer()} /> : null}
    {snapshot.phase === "won" || snapshot.phase === "crushed" ? <Results snapshot={snapshot} onRestart={() => ctx.game.commands.run("restart", {})} onTitle={returnToTitle} /> : null}
    {menu ? <PitMenu key={snapshot.phase} snapshot={snapshot} session={session} publish={publish} /> : null}
    {settings.isOpen ? <Sheet label="Settings" back={settings.close}><PitSettings /><Stamp label="Close settings" onPress={settings.close}>CLOSE</Stamp></Sheet> : null}
    <RuneView anchor="bottom" safe inset={racing ? width < 600 ? 300 : 150 : 24} gap={6}>
      <RuneTransient source={notices} expire={ctx.game.notices.prune}>{notice => <RuneView variant="hud" border={{ width: 2, color: notice.tone === "deny" ? RED : notice.tone === "success" ? TEAL : YELLOW }} maxWidth={Math.min(520, width - 32)}>
        <Text align="center">{notice.text}</Text>
      </RuneView>}</RuneTransient>
    </RuneView>
  </RuneRoot>;
}
