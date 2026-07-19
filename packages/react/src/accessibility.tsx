import { createContext, useContext, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import {
  COLORBLIND_MATRICES,
  type AccessibilityState,
  type AccessibilityStore,
  type ColorblindMode,
} from "@jgengine/core/ui/accessibility";

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

/** Read the live accessibility state + its store; throws without an {@link AccessibilityProvider} above. */
export function useAccessibility(): AccessibilityContextValue {
  const value = useContext(AccessibilityContext);
  if (value === null) throw new Error("useAccessibility must be used within an <AccessibilityProvider>");
  return value;
}

/**
 * Hidden SVG `<defs>` holding the `feColorMatrix` colorblind filters that
 * `AccessibilityProvider` references by `filter: url(#jg-cb-<mode>)`. Rendered
 * automatically inside the provider; export standalone for custom roots.
 *
 * @capability colorblind-filters SVG feColorMatrix defs (protanopia/deuteranopia/tritanopia/grayscale) referenced by the accessibility colorblind filter
 */
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

/**
 * Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for
 * text to scale off, sets `data-reduced-motion` / `data-high-contrast` /
 * `data-colorblind` / `data-captions` for CSS to respond to, and wraps the tree
 * in the selected colorblind `feColorMatrix` filter. Reads a
 * `createAccessibilityStore` and re-renders on change; provides the state to
 * `useAccessibility`.
 *
 * @capability accessibility-provider apply accessibility preferences to a subtree — text-scale CSS var, reduced-motion/high-contrast/colorblind/captions data attrs, and the colorblind color-matrix filter
 */
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
  if (state.colorblind !== "none") rootStyle.filter = `url(#jg-cb-${state.colorblind})`;

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
        <ColorblindFilters />
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
