import { createElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";

import { RuneStage } from "./runeStage.view";

/** Whether this page draws game UI through Rune (`?ui=dom` keeps the DOM, for side-by-side checks). */
export function runeUiEnabled(): boolean {
  if (typeof window === "undefined" || !("gpu" in navigator)) return false;
  return new URLSearchParams(window.location.search).get("ui") === "rune";
}

/**
 * Draws its children through Rune instead of the page: the elements exist (so styles, refs and
 * events work as written) but the browser never lays them out or paints them; the Rune stage
 * mirrors them onto its canvas over the game.
 *
 * @capability rune-layer draw a UI subtree through the Rune canvas instead of the DOM
 */
export function RuneLayer({ children }: { children?: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [onPage, setOnPage] = useState(() => RuneStage.get().unavailable);
  useEffect(() => RuneStage.get().onUnavailable(() => setOnPage(true)), []);
  useLayoutEffect(() => {
    const container = ref.current;
    return container === null || onPage ? undefined : RuneStage.get().attach(container);
  }, [onPage]);
  // Rune could not start (no WebGPU adapter, no bundle): the same children, mounted afresh in the
  // page so everything that measured itself while undisplayed measures again.
  if (onPage) return createElement("div", { key: "page", style: { display: "contents" } }, children);
  return createElement("div", { key: "rune", ref, "data-jg-rune-layer": "", style: { display: "none" } }, children);
}
