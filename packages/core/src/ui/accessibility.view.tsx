/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useContext, useSyncExternalStore, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";

import {
  COLORBLIND_MATRICES,
  colorblindFrameFilter,
  type AccessibilityState,
  type AccessibilityStore,
  type ColorblindMode,
} from "@jgengine/core/ui/accessibility";
import { readColorblind } from "@jgengine/core/settings/accessibilitySettings";
import type { SettingsStore } from "@jgengine/core/settings/settingsModel";

interface AccessibilityContextValue {
  state: AccessibilityState;
  store: AccessibilityStore;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

const FILTER_MODES: readonly Exclude<ColorblindMode, "none">[] = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "grayscale",
];

export function useAccessibility(): AccessibilityContextValue {
  const value = useContext(AccessibilityContext);
  if (value === null) throw new Error("useAccessibility must be used within an <AccessibilityProvider>");
  return value;
}

/** @capability colorblind-filters SVG feColorMatrix defs (protanopia/deuteranopia/tritanopia/grayscale) referenced by the accessibility colorblind filter */
export function ColorblindFilters(): ReactNode {
  return (
    <svg aria-hidden width={0} height={0} style={{ position: "absolute" }} data-colorblind-filters>
      <defs>
        {FILTER_MODES.map((mode) => (
          <filter key={mode} id={`jg-cb-${mode}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={COLORBLIND_MATRICES[mode] ?? ""} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

export interface ColorblindFrameProps {
  mode?: ColorblindMode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Apply the player's colour-vision mode to one rendered frame: a box carrying
 * `filter: url(#jg-cb-<mode>)` plus the filter defs it references. Put it around the canvas of a 3D
 * game and nothing else — the filter is one compositor pass over that box's pixels, so HUD, menu and
 * caption text outside it keep the contrast and hues the rest of the UI assumes.
 *
 * The filter needs no framebuffer copy and no extra WebGL draw: the browser filters the canvas layer
 * as it composites, so switching modes costs nothing per frame beyond that pass. Gameplay stays
 * unaffected; the cost is one full-screen colour-matrix pass while a mode other than `none` is set.
 *
 * @capability colorblind-frame apply the player's colour-vision mode to the 3D frame alone, leaving HUD and menu text unfiltered
 */
export function ColorblindFrame({ mode = "none", children, className, style }: ColorblindFrameProps): ReactNode {
  const filter = colorblindFrameFilter(mode);
  return (
    <>
      <ColorblindFilters />
      <div
        className={className}
        data-colorblind-frame={mode}
        style={filter === null ? style : { ...style, filter }}
      >
        {children}
      </div>
    </>
  );
}

/**
 * The live colour-vision mode from a settings store — the same store the settings rows write, so the
 * frame follows the player's choice the moment they pick it. Pass the store the shell owns; read
 * `useAccessibilitySettings().colorblind` instead when a `SettingsProvider` is above the caller.
 *
 * @capability colorblind-frame-mode read the live colour-vision mode from the settings store that the settings rows write
 */
export function useColorblindMode(store: SettingsStore): ColorblindMode {
  return useSyncExternalStore(
    store.subscribe,
    () => readColorblind(store),
    () => readColorblind(store),
  );
}

/** @capability accessibility-provider apply accessibility preferences to a subtree — text-scale CSS var and reduced-motion/high-contrast/colorblind/captions data attrs */
export function AccessibilityProvider({
  store,
  children,
  className,
  style,
}: {
  store: AccessibilityStore;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}): ReactNode {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const rootStyle: CSSProperties = { ...style };
  (rootStyle as Record<string, string>)["--jg-text-scale"] = String(state.textScale);

  return (
    <AccessibilityContext.Provider value={{ state, store }}>
      <div
        className={className}
        data-accessibility
        data-reduced-motion={state.reducedMotion}
        data-high-contrast={state.highContrast}
        data-colorblind={state.colorblind}
        data-captions={state.captions}
        style={rootStyle}
      >
        {children}
      </div>
    </AccessibilityContext.Provider>
  );
}

/**
 * OS "reduce motion" preference (`prefers-reduced-motion: reduce`) as a live
 * boolean — SSR-safe (defaults false). Use it to seed an accessibility store's
 * `reducedMotion` default.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    () => false,
  );
}

export function useReducedMotion(): boolean {
  const prefers = usePrefersReducedMotion();
  const value = useContext(AccessibilityContext);
  return prefers || value?.state.reducedMotion === true;
}
