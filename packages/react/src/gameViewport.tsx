/**
 * Shared mobile-composition runtime. `GameViewportProvider` allocates the live
 * game viewport once — tracking `visualViewport`, safe-area insets, orientation
 * and layout mode — and hosts a registry every UI subsystem publishes its
 * occupied rectangle to. HUD panels, touch-control zones, and system chrome all
 * register here so the engine can detect forbidden overlaps instead of each
 * subsystem independently claiming an edge.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  computeGameplayRect,
  detectLayoutCollisions,
  formatLayoutCollisions,
  resolveLayoutMode,
  orientationOf,
  type GameLayoutMode,
  type GameViewportLayout,
  type Insets,
  type LayoutCollision,
  type LayoutRect,
  type LayoutRegion,
} from "@jgengine/core/ui/gameLayout";
import type { LayoutOrientation } from "@jgengine/core/ui/orientation";
import type { HudPlatform } from "@jgengine/core/ui/hudScale";
import { useDisplayProfile } from "./display";

/** A region registration: the full `LayoutRegion` plus the live element (dev outlining), rect measured by the shell/react side. */
export interface RegionRecord extends LayoutRegion {
  element?: HTMLElement | null;
}

/** A region descriptor without its measured rectangle — the caller supplies geometry through `useRegisterLayoutRegion`. */
export type LayoutRegionSpec = Omit<LayoutRegion, "rect">;

interface RegionRegistry {
  set(region: RegionRecord): void;
  remove(id: string): void;
  list(): RegionRecord[];
  subscribe(listener: () => void): () => void;
}

function sameRect(a: LayoutRect, b: LayoutRect): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

function sameRegion(a: RegionRecord, b: RegionRecord): boolean {
  return (
    a.kind === b.kind &&
    a.collisionPolicy === b.collisionPolicy &&
    a.priority === b.priority &&
    a.collisionGroup === b.collisionGroup &&
    a.element === b.element &&
    (a.allowOverlapWith ?? []).join("+") === (b.allowOverlapWith ?? []).join("+") &&
    sameRect(a.rect, b.rect)
  );
}

const EMPTY_REGIONS: RegionRecord[] = [];

function createRegionRegistry(): RegionRegistry {
  const records = new Map<string, RegionRecord>();
  const listeners = new Set<() => void>();
  let snapshot: RegionRecord[] = EMPTY_REGIONS;
  let frame = 0;
  const flush = () => {
    frame = 0;
    for (const listener of [...listeners]) listener();
  };
  const emit = () => {
    snapshot = [...records.values()];
    if (typeof requestAnimationFrame !== "function") {
      for (const listener of [...listeners]) listener();
      return;
    }
    if (frame !== 0) return;
    frame = requestAnimationFrame(flush);
  };
  return {
    set(region) {
      const prev = records.get(region.id);
      if (prev !== undefined && sameRegion(prev, region)) return;
      records.set(region.id, region);
      emit();
    },
    remove(id) {
      if (records.delete(id)) emit();
    },
    list: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const RegionRegistryContext = createContext<RegionRegistry | null>(null);
const GameLayoutContext = createContext<GameViewportLayout | null>(null);

const INPUT_HINT_STYLE_ID = "jg-input-hints";
const INPUT_HINT_CSS = "@media (pointer: coarse){[data-jg-kbd-hint]{display:none!important}}";

/** Install the backstop rule that hides keyboard/mouse hints on touch, once per document. */
function ensureInputHintStylesheet(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(INPUT_HINT_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = INPUT_HINT_STYLE_ID;
  style.textContent = INPUT_HINT_CSS;
  document.head.appendChild(style);
}

/** Live viewport rectangles: the layout viewport and the visible `visualViewport`. */
export interface ViewportMetrics {
  layout: LayoutRect;
  visual: LayoutRect;
}

const SERVER_METRICS: ViewportMetrics = {
  layout: { left: 0, top: 0, right: 0, bottom: 0 },
  visual: { left: 0, top: 0, right: 0, bottom: 0 },
};

function readViewportMetrics(): ViewportMetrics {
  if (typeof window === "undefined") return SERVER_METRICS;
  const layoutWidth = window.innerWidth;
  const layoutHeight = window.innerHeight;
  const vv = window.visualViewport;
  const visual: LayoutRect = vv
    ? {
        left: vv.offsetLeft,
        top: vv.offsetTop,
        right: vv.offsetLeft + vv.width,
        bottom: vv.offsetTop + vv.height,
      }
    : { left: 0, top: 0, right: layoutWidth, bottom: layoutHeight };
  return { layout: { left: 0, top: 0, right: layoutWidth, bottom: layoutHeight }, visual };
}

let cachedMetrics: ViewportMetrics = SERVER_METRICS;

function metricsSnapshot(): ViewportMetrics {
  const next = readViewportMetrics();
  if (!sameRect(next.layout, cachedMetrics.layout) || !sameRect(next.visual, cachedMetrics.visual)) {
    cachedMetrics = next;
  }
  return cachedMetrics;
}

function subscribeViewport(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
  };
}

/** Live visible viewport, tracking `window.visualViewport` (mobile browser chrome, pinch-zoom) with a layout-viewport fallback. */
export function useViewportMetrics(): ViewportMetrics {
  return useSyncExternalStore(subscribeViewport, metricsSnapshot, () => SERVER_METRICS);
}

function measureSafeArea(probe: HTMLElement | null): Insets {
  if (probe === null || typeof getComputedStyle !== "function") return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(probe);
  const px = (value: string): number => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}

const SAFE_AREA_PROBE_STYLE: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  visibility: "hidden",
  pointerEvents: "none",
  paddingTop: "env(safe-area-inset-top, 0px)",
  paddingRight: "env(safe-area-inset-right, 0px)",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  paddingLeft: "env(safe-area-inset-left, 0px)",
};

/**
 * Provides the shared game viewport layout to everything it wraps. Mount it
 * once around the whole game presentation (world, HUD, controls, system UI) so
 * every subsystem reads one coordinated geometry and registers its rect for
 * collision detection. Publishes live `--jg-viewport-*` / `--jg-visual-viewport-*`
 * / `--jg-safe-*` CSS variables on its root.
 */
export function GameViewportProvider({
  platforms,
  className,
  style,
  children,
}: {
  platforms?: readonly HudPlatform[];
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const registry = useMemo(createRegionRegistry, []);
  const metrics = useViewportMetrics();
  const { coarsePointer } = useDisplayProfile();
  const probeRef = useRef<HTMLDivElement | null>(null);
  const [safeArea, setSafeArea] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureInputHintStylesheet();
  }, []);

  useEffect(() => {
    const update = () => {
      const next = measureSafeArea(probeRef.current);
      setSafeArea((prev) =>
        prev.top === next.top && prev.right === next.right && prev.bottom === next.bottom && prev.left === next.left
          ? prev
          : next,
      );
    };
    update();
    if (typeof window === "undefined") return;
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [metrics]);

  const regions = useSyncExternalStore(registry.subscribe, registry.list, () => EMPTY_REGIONS);

  const mobileSupported = platforms?.includes("mobile") ?? true;
  const visual = metrics.visual;
  const vw = Math.max(0, visual.right - visual.left);
  const vh = Math.max(0, visual.bottom - visual.top);

  const layout = useMemo<GameViewportLayout>(() => {
    const orientation: LayoutOrientation =
      vw > 0 || vh > 0 ? orientationOf(vw, vh) : orientationOf(metrics.layout.right, metrics.layout.bottom);
    const mode: GameLayoutMode = resolveLayoutMode({
      width: vw > 0 ? vw : metrics.layout.right,
      height: vh > 0 ? vh : metrics.layout.bottom,
      coarsePointer,
      mobileSupported,
    });
    const reserved = regions
      .filter((region) => region.kind === "control" || region.kind === "system")
      .map((region) => region.rect);
    const gameplayRect = computeGameplayRect(metrics.layout, safeArea, reserved);
    return {
      viewport: metrics.layout,
      visualViewport: visual,
      safeArea,
      mode,
      orientation,
      regions,
      controlZones: reserved,
      gameplayRect,
    };
  }, [regions, metrics.layout, visual, vw, vh, coarsePointer, mobileSupported, safeArea]);

  const collisions = useMemo(() => detectLayoutCollisions(regions), [regions]);
  const forbidden = useMemo(() => collisions.filter((c) => c.severity === "forbid"), [collisions]);

  const collisionReport = forbidden.length === 0 ? undefined : JSON.stringify(forbidden);
  const lastWarnedRef = useRef<string | undefined>(undefined);
  if (collisionReport !== lastWarnedRef.current) {
    lastWarnedRef.current = collisionReport;
    if (collisionReport !== undefined) {
      console.warn(
        `[jgengine] ${formatLayoutCollisions(forbidden)}\n  mode=${layout.mode} viewport=${Math.round(vw)}x${Math.round(vh)} safe=${safeArea.top}/${safeArea.right}/${safeArea.bottom}/${safeArea.left}`,
      );
    }
  }

  useEffect(() => {
    const ids = new Set<string>();
    for (const collision of forbidden) {
      ids.add(collision.a);
      ids.add(collision.b);
    }
    const marked: HTMLElement[] = [];
    for (const region of regions) {
      if (region.element != null && ids.has(region.id)) {
        region.element.setAttribute("data-jg-collision", "");
        marked.push(region.element);
      }
    }
    return () => {
      for (const element of marked) element.removeAttribute("data-jg-collision");
    };
  }, [forbidden, regions]);

  const rootStyle = {
    position: "relative",
    width: "100%",
    height: "100%",
    "--jg-viewport-width": `${metrics.layout.right}px`,
    "--jg-viewport-height": `${metrics.layout.bottom}px`,
    "--jg-visual-viewport-width": `${Math.round(vw)}px`,
    "--jg-visual-viewport-height": `${Math.round(vh)}px`,
    "--jg-visual-viewport-offset-top": `${Math.round(visual.top)}px`,
    "--jg-visual-viewport-offset-left": `${Math.round(visual.left)}px`,
    "--jg-safe-top": `${safeArea.top}px`,
    "--jg-safe-right": `${safeArea.right}px`,
    "--jg-safe-bottom": `${safeArea.bottom}px`,
    "--jg-safe-left": `${safeArea.left}px`,
    ...style,
  } as CSSProperties;

  return (
    <RegionRegistryContext.Provider value={registry}>
      <GameLayoutContext.Provider value={layout}>
        <div
          ref={rootRef}
          data-jg-viewport=""
          data-jg-layout-mode={layout.mode}
          data-jg-orientation={layout.orientation}
          data-jg-layout-collision={collisionReport}
          className={className}
          style={rootStyle}
        >
          <div ref={probeRef} aria-hidden style={SAFE_AREA_PROBE_STYLE} />
          {children}
        </div>
      </GameLayoutContext.Provider>
    </RegionRegistryContext.Provider>
  );
}

/** The live shared viewport layout. Returns a neutral default outside a `GameViewportProvider` so it never throws in previews. */
export function useGameViewportLayout(): GameViewportLayout {
  const layout = useContext(GameLayoutContext);
  const metrics = useViewportMetrics();
  return (
    layout ?? {
      viewport: metrics.layout,
      visualViewport: metrics.visual,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      mode: resolveLayoutMode({ width: metrics.layout.right, height: metrics.layout.bottom, coarsePointer: false }),
      orientation: orientationOf(metrics.layout.right, metrics.layout.bottom),
      regions: [],
      controlZones: [],
      gameplayRect: metrics.layout,
    }
  );
}

/** The resolved explicit composition mode (`desktop-wide` … `mobile-portrait`). */
export function useGameLayoutMode(): GameLayoutMode {
  return useGameViewportLayout().mode;
}

/** The live device orientation. */
export function useGameOrientation(): LayoutOrientation {
  return useGameViewportLayout().orientation;
}

/** Rectangles reserved by touch controls and system UI — HUD placement should avoid these. */
export function useReservedControlZones(): readonly LayoutRect[] {
  return useGameViewportLayout().controlZones;
}

/** Live forbidden/warned region collisions (empty outside a provider). */
export function useLayoutCollisions(): readonly LayoutCollision[] {
  const layout = useContext(GameLayoutContext);
  return useMemo(() => (layout === null ? [] : detectLayoutCollisions(layout.regions)), [layout]);
}

function specKey(spec: LayoutRegionSpec): string {
  return [
    spec.id,
    spec.kind,
    spec.collisionPolicy,
    spec.priority ?? "",
    spec.collisionGroup ?? "",
    (spec.allowOverlapWith ?? []).join("+"),
  ].join("|");
}

/**
 * Register the element behind `ref` as a layout region and keep its measured
 * rectangle live (ResizeObserver + viewport changes). No-op outside a
 * `GameViewportProvider`, so a component using it still works in isolation.
 */
export function useRegisterLayoutRegion(
  spec: LayoutRegionSpec,
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  const registry = useContext(RegionRegistryContext);
  const specRef = useRef(spec);
  specRef.current = spec;
  const key = specKey(spec);

  useEffect(() => {
    const element = ref.current;
    if (registry === null || element === null || !enabled) {
      registry?.remove(specRef.current.id);
      return;
    }
    const measure = () => {
      const rect = element.getBoundingClientRect();
      registry.set({
        ...specRef.current,
        element,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (typeof window !== "undefined") {
      window.addEventListener("resize", measure);
      window.addEventListener("orientationchange", measure);
      window.visualViewport?.addEventListener("resize", measure);
      window.visualViewport?.addEventListener("scroll", measure);
    }
    return () => {
      observer?.disconnect();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", measure);
        window.removeEventListener("orientationchange", measure);
        window.visualViewport?.removeEventListener("resize", measure);
        window.visualViewport?.removeEventListener("scroll", measure);
      }
      registry.remove(specRef.current.id);
    };
  }, [registry, ref, key, enabled]);
}
