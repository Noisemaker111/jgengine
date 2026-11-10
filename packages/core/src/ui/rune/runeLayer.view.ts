import { createElement, useLayoutEffect, useRef, type ReactNode } from "react";

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
  useLayoutEffect(() => {
    const container = ref.current;
    return container === null ? undefined : RuneStage.get().attach(container);
  }, []);
  return createElement("div", { ref, "data-jg-rune-layer": "", style: { display: "none" } }, children);
}
