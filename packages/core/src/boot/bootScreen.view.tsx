/** @jsxImportSource @jgengine/core/ui/jsx */
import { Suspense, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "@jgengine/core/ui/jsx";

import { pageBoot, type BootStep } from "@jgengine/core/boot/bootSequence";
import { showLoadingCover } from "@jgengine/core/boot/loadingCover";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import { RuneLabel, RuneRoot, RuneView } from "@jgengine/core/ui/rune/primitives.view";

/** The boot screen showing now, re-rendered as the page's boot moves. */
export function useBootStep(): BootStep {
  return useSyncExternalStore(pageBoot.subscribe, pageBoot.step, pageBoot.step);
}

const LOADING_THEME = {
  colors: { backdrop: "#0f172a", track: "#1e293b", bar: "#38bdf8" },
  text: { body: { size: 14, color: "#e2e8f0" }, detail: { size: 11, color: "#94a3b8" } },
  variants: {},
  motion: { duration: 120, distance: 0, bounce: 0 },
} satisfies RuneTheme;

/** Stacking: under a game's own UI (40) so a menu draws over it, or over everything once Play is pressed. */
const UNDER_GAME_UI = 30;
const OVER_GAME_UI = 200;

/**
 * The jgengine loading screen: the only loading screen a game shows, drawn on Rune like every screen.
 * Every loading surface draws this same screen, so handing over from one to the next never flashes.
 * It sits under the game's own UI (a menu) unless `over` lifts it above everything, as the entering
 * screen after Play does. While it shows, the page carries `window.__jg.loading`.
 * @internal
 */
export function BootLoadingScreen({ label = "Loading", progress = null, detail, over = false }: { label?: string | undefined; progress?: number | null | undefined; detail?: string | undefined; over?: boolean | undefined }) {
  const share = progress === null ? 0.05 : Math.max(0.05, Math.min(1, progress));
  const cover = useRef<ReturnType<typeof showLoadingCover> | null>(null);
  useLayoutEffect(() => {
    const shown = showLoadingCover({ label, progress });
    cover.current = shown;
    return () => {
      shown.hide();
      cover.current = null;
    };
  }, []);
  cover.current?.update({ label, progress });
  return (
    <RuneRoot theme={LOADING_THEME} layer={over ? OVER_GAME_UI : UNDER_GAME_UI}>
      <RuneView anchor="fill" fill={LOADING_THEME.colors.backdrop} />
      <RuneView anchor="center" gap={10} items="center">
        <RuneLabel value={label} />
        <RuneView width={160} height={3} radius={2} fill={LOADING_THEME.colors.track}>
          <RuneView height={3} radius={2} width={{ fraction: share }} fill={LOADING_THEME.colors.bar} />
        </RuneView>
        {detail === undefined ? null : <RuneLabel textStyle="detail" value={detail} />}
      </RuneView>
    </RuneRoot>
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
