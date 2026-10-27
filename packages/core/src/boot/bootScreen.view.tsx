import { Suspense, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { pageBoot, type BootStep } from "@jgengine/core/boot/bootSequence";

/** The boot screen showing now, re-rendered as the page's boot moves. */
export function useBootStep(): BootStep {
  return useSyncExternalStore(pageBoot.subscribe, pageBoot.step, pageBoot.step);
}

/**
 * The jgengine loading screen: the only loading screen a game shows. Every loading surface draws
 * this same screen, so handing over from one to the next never flashes. It sits under the game's
 * own UI (a menu, the editor's panels) unless `over` lifts it above everything, as the entering
 * screen after Play does.
 * @internal
 */
export function BootLoadingScreen({ label = "Loading", progress = null, detail, over = false }: { label?: string; progress?: number | null; detail?: string; over?: boolean }) {
  const share = progress === null ? 0.05 : Math.max(0.05, Math.min(1, progress));
  return (
    <div
      data-shell-code-loading
      data-jg-boot-screen
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        ...(over ? { zIndex: 200 } : {}),
        display: "grid",
        placeItems: "center",
        minHeight: 160,
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "grid", gap: 10, justifyItems: "center", fontSize: 14 }}>
        <span>{label}</span>
        <div data-shell-warmup-bar aria-hidden="true" style={{ width: 160, height: 3, borderRadius: 2, background: "#1e293b", overflow: "hidden" }}>
          <div style={{ width: `${Math.round(share * 100)}%`, height: "100%", background: "#38bdf8", transition: "width 120ms linear" }} />
        </div>
        {detail === undefined ? null : <span style={{ fontSize: 11, color: "#94a3b8" }}>{detail}</span>}
      </div>
    </div>
  );
}

/**
 * A loading surface that asks the page's boot for its one loading screen. Before the first game
 * screen it shows the loading screen; after it (a stray reload of game code, a world piece that
 * suspends) the boot refuses and records it, and nothing is drawn over the game.
 * @internal
 */
export function BootLoading({ reason, label, progress }: { reason: string; label?: string; progress?: number | null }) {
  const step = useBootStep();
  useLayoutEffect(() => {
    pageBoot.enter("loading", reason);
  }, [reason]);
  return step === "open" || step === "loading" ? <BootLoadingScreen label={label} progress={progress} /> : null;
}

const loadingAreas = new Set<string>();

/** How many world pieces are still loading; Play waits on the entering screen until none are. */
export function bootLoadingAreas(): number {
  return loadingAreas.size;
}

function SuspendedDuringBoot({ area, shown }: { area: string; shown: { current: boolean } }) {
  useLayoutEffect(() => {
    loadingAreas.add(area);
    // Behind the loading screen or the menu a first load is hidden; a piece that vanishes once shown, or in play, is seen.
    if (shown.current || pageBoot.step() === "playing") pageBoot.fault(`${area} hid while it loaded`);
    return () => {
      loadingAreas.delete(area);
    };
  }, [area, shown]);
  return null;
}

function Shown({ shown }: { shown: { current: boolean } }) {
  useLayoutEffect(() => {
    shown.current = true;
  }, [shown]);
  return null;
}

/**
 * Keeps a world piece that is still loading inside the world, so it can never pull the whole game
 * back to a loading screen, and holds Play on the entering screen until it is in. A piece that hides
 * after it showed, or during play, is recorded on the boot as a fault, which the load check fails
 * on: such a loader belongs in its own boundary.
 * @internal
 */
export function BootSuspenseGuard({ area, children }: { area: string; children: ReactNode }) {
  const shown = useRef(false);
  return (
    <Suspense fallback={<SuspendedDuringBoot area={area} shown={shown} />}>
      {children}
      <Shown shown={shown} />
    </Suspense>
  );
}
