import { JoinGate } from "@jgengine/shell/JoinGate";
import { WorldChat } from "@/multiplayer/components/WorldChat";
import PlacementController from "./PlacementController";
import { GameConnectionErrorScreen } from "./GameConnectionErrorScreen";
import { useEffect, useMemo, useState } from "react";

import GameOverlay from "@/runtime/components/GameOverlay";
import type { Movement } from "@/movement/useMovement";
import { engineActions, useGameEngineState } from "@/runtime/gameEngine";
import { TabletNavProvider } from "@/tablet/components/tabletNav";
import {
  createTabletPreviewBuild,
  createTabletPreviewRackHardware,
  createTabletPreviewTutorial,
  usePreviewTabletNav,
  usePreviewWorldState,
} from "@/tablet/tabletPreviewFixtures";
import type { TabletAppId, TabletNavState } from "@/tablet/tablet";
import { TABLET_APPS } from "@/tablet/tablet";
import { cn } from "@/components/ui/cn";
import { WORLD_CHAT_PREVIEW_MESSAGES } from "@/multiplayer/worldChatPreviewFixtures";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";

function PreviewControlButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-brand-teal text-zinc-950 shadow-sm"
          : "bg-white/8 text-zinc-300 hover:bg-white/14 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function TabletControls({
  label,
  nav,
}: {
  label: string;
  nav: TabletNavState;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <PreviewControlButton onClick={() => nav.openTabletHome()}>Open home</PreviewControlButton>
        <PreviewControlButton onClick={() => nav.closeMenu()}>Close</PreviewControlButton>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-white/55">Start app</span>
        <select
          value={nav.activeTabletApp ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            const app = next.length > 0 ? (next as TabletAppId) : null;
            if (app === null) nav.openTabletHome();
            else nav.openTabletApp(app);
          }}
          className="rounded border border-white/15 bg-zinc-900 px-2 py-1.5 text-white"
        >
          <option value="">Home grid</option>
          {TABLET_APPS.map((app) => (
            <option key={app.id} value={app.id}>
              {app.id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function EconomyControls({
  adjustMoney,
  adjustTokens,
  setServingIncomeRate,
  servingIncomeRate,
}: {
  adjustMoney: (delta: number) => void;
  adjustTokens: (delta: number) => void;
  setServingIncomeRate: (rate: number) => void;
  servingIncomeRate: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Economy HUD</p>
      <p className="text-[11px] leading-relaxed text-white/45">
        Triggers cash/token delta flashes on both desktop and mobile resource panels.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <PreviewControlButton onClick={() => adjustMoney(250)}>+$250 cash</PreviewControlButton>
        <PreviewControlButton onClick={() => adjustMoney(-180)}>-$180 cash</PreviewControlButton>
        <PreviewControlButton onClick={() => adjustTokens(120)}>+120 tokens</PreviewControlButton>
        <PreviewControlButton onClick={() => adjustTokens(-75)}>-75 tokens</PreviewControlButton>
      </div>
      <label className="flex items-center justify-between gap-2 rounded border border-white/10 bg-white/5 px-2.5 py-2">
        <span className="text-xs text-white/70">Serving income / hr</span>
        <input
          type="checkbox"
          checked={servingIncomeRate > 0}
          onChange={(event) => setServingIncomeRate(event.currentTarget.checked ? 18.5 : 0)}
          className="h-4 w-4 accent-brand-teal"
        />
      </label>
    </div>
  );
}

function PreviewScene({
  label,
  nav,
  world,
  build,
  rackHardware,
  tutorial,
  movement,
  framed = false,
}: {
  label: string;
  nav: TabletNavState;
  world: ReadyWorldViewModel;
  build: ReturnType<typeof createTabletPreviewBuild>;
  rackHardware: ReturnType<typeof createTabletPreviewRackHardware>;
  tutorial: ReturnType<typeof createTabletPreviewTutorial>;
  movement: Movement;
  framed?: boolean;
}) {
  const scene = (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-[#2b4a44] via-[#1d3531] to-[#0c1614]">
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-black/40" />
      <TabletNavProvider value={nav}>
        <GameOverlay
          embedded
          world={world}
          build={build}
          rackHardware={rackHardware}
          tutorial={tutorial}
          movement={movement}
          chatFixtureMessages={WORLD_CHAT_PREVIEW_MESSAGES}
        />
      </TabletNavProvider>
    </div>
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{label}</h2>
      {framed ? (
        <div className="relative mx-auto flex min-h-0 w-full max-w-[390px] flex-1 items-end justify-center">
          <div className="relative flex h-full max-h-[720px] w-full flex-col overflow-hidden rounded-[2rem] border-4 border-zinc-800 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[200] flex justify-center pt-2">
              <div className="h-5 w-24 rounded-full bg-black/80" aria-hidden />
            </div>
            {scene}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center">
          <div className="relative flex min-h-0 w-full max-w-[760px] flex-1 flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-t-xl border-[10px] border-b-0 border-zinc-800 bg-zinc-900 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
              {scene}
            </div>
            <div className="mx-auto h-5 w-24 rounded-b-md bg-zinc-800" />
            <div className="mx-auto mt-1 h-2 w-40 rounded-full bg-zinc-700" />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Dev HUD workbench — desktop monitor + mobile phone side by side with shared economy
 * fixtures, tablet controls, and real GameOverlay / GameTablet chrome.
 */
function HudWorkbench() {
  const preview = usePreviewWorldState();
  const desktopNav = usePreviewTabletNav({ initialOpen: false });
  const mobileNav = usePreviewTabletNav({ initialOpen: false });
  const build = useMemo(() => createTabletPreviewBuild(), []);
  const rackHardware = useMemo(() => createTabletPreviewRackHardware(), []);
  const tutorial = useMemo(() => createTabletPreviewTutorial(), []);

  const desktopKeys = useGameEngineState(preview.world.engine, (state) => state.player.keysDown);
  const mobileKeys = desktopKeys;

  const desktopMovement = useMemo<Movement>(
    () => ({
      isTouch: false,
      controls: {
        isTouch: false,
        setMovementKey: (key, pressed) =>
          preview.world.engine.dispatch(engineActions.setMovementKey(key, pressed)),
        onSessionMouseDown: () => undefined,
      },
      onSessionMouseDown: () => undefined,
      sceneBindings: {
        movementKeys: desktopKeys,
        playerSpeed: 2,
        canMove: true,
        playInputTouch: false,
        onStepPlayer: () => undefined,
      },
    }),
    [desktopKeys, preview.world.engine],
  );

  const mobileMovement = useMemo<Movement>(
    () => ({
      isTouch: true,
      controls: {
        isTouch: true,
        setMovementKey: (key, pressed) =>
          preview.world.engine.dispatch(engineActions.setMovementKey(key, pressed)),
        onSessionMouseDown: () => undefined,
      },
      onSessionMouseDown: () => undefined,
      sceneBindings: {
        movementKeys: mobileKeys,
        playerSpeed: 2,
        canMove: true,
        playInputTouch: true,
        onStepPlayer: () => undefined,
      },
    }),
    [mobileKeys, preview.world.engine],
  );

  useEffect(() => {
    preview.world.engine.dispatch(engineActions.setPlaying(true, Date.now()));
  }, [preview.world.engine]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#0b0f0e] text-white">
      <aside className="flex w-[min(17rem,32vw)] shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/10 bg-zinc-950 p-4 text-sm">
        <div>
          <p className="font-game text-xs uppercase tracking-[0.2em] text-brand-teal/80">HUD lab</p>
          <h1 className="mt-1 font-game text-lg font-bold">Desktop + mobile</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            Monitor on the left, phone on the right. Tablet slides up inside each frame like in-game.
          </p>
        </div>

        <EconomyControls
          adjustMoney={preview.adjustMoney}
          adjustTokens={preview.adjustTokens}
          setServingIncomeRate={preview.setServingIncomeRate}
          servingIncomeRate={preview.servingIncomeRate}
        />

        <TabletControls label="Desktop tablet" nav={desktopNav.nav} />
        <TabletControls label="Mobile tablet" nav={mobileNav.nav} />
      </aside>

      <main className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <PreviewScene
          label="Desktop monitor"
          nav={desktopNav.nav}
          world={preview.world}
          build={build}
          rackHardware={rackHardware}
          tutorial={tutorial}
          movement={desktopMovement}
        />
        <PreviewScene
          label="Mobile"
          framed
          nav={mobileNav.nav}
          world={preview.world}
          build={build}
          rackHardware={rackHardware}
          tutorial={tutorial}
          movement={mobileMovement}
        />
      </main>
    </div>
  );
}

function SharedFeedbackPreview({ kind }: { kind: string }) {
  const nav = usePreviewTabletNav({ initialOpen: false });
  const preview = usePreviewWorldState();
  const [chatOpen, setChatOpen] = useState(kind === "chat-expanded");
  useEffect(() => {
    document.documentElement.dataset.jgCapture = "ready";
    return () => { delete document.documentElement.dataset.jgCapture; };
  }, [kind]);
  if (kind === "join") return <JoinGate status="failed" failureReason="The world is temporarily unavailable. Try joining again." retry={() => {}}
    renderFailure={(reason, retry) => <GameConnectionErrorScreen message={reason ?? "Could not join"} onRetry={retry} kind="connection" />} />;
  return <TabletNavProvider value={nav.nav}>
    <div className="flex min-h-screen items-center justify-center gap-8 bg-[#16201e] p-8 text-brand-cream">
      {kind.startsWith("chat") ? <WorldChat world={preview.world} placing={false} open={chatOpen} setOpen={setChatOpen} fixtureMessages={WORLD_CHAT_PREVIEW_MESSAGES} /> : <PlacementController onRotate={() => {}} onPlace={() => {}} canPlace={false} facingLabel="North" claimHint={{ cells: [{ key: "0,0", x: 0, z: 0, status: "claimable" }], cost: 75, affordable: false }} />}
    </div>
  </TabletNavProvider>;
}

export function HudDevPreview() {
  const feedback = new URLSearchParams(window.location.search).get("feedback");
  return feedback === null ? <HudWorkbench /> : <SharedFeedbackPreview kind={feedback} />;
}
