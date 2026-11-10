/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "../jsx";
import type { RuneElementProps } from "./element";

/** Native Rune column. Its typed props map directly to Rune element methods. */
export function RuneBox(props: RuneElementProps) { return createElement("rune-box", props); }
/** Native Rune row. */
export function RuneRow(props: RuneElementProps) { return createElement("rune-box", { ...props, direction: "row" }); }
/** Native text, optionally bound directly to a live getter. */
export function RuneText(props: RuneElementProps) { return createElement("rune-text", props); }
/** Native scroll viewport with a column as its content. */
export function RuneScroll(props: RuneElementProps) { return createElement("rune-box", { ...props, scroll: true }); }
/** Native interactive element; children retain their own layout and paint. */
export function RuneButton(props: RuneElementProps) { return createElement("rune-box", { ...props, role: "button" }); }
/** Native slider whose edited value is a fraction in 0..1. */
export function RuneSlider(props: RuneElementProps) { return createElement("rune-slider", props); }
/** Native SVG icon; SVG body is artwork, never a style declaration. */
export function RuneIcon(props: RuneElementProps) { return createElement("rune-icon", props); }
/** Native segmented meter. */
export function RuneCells(props: RuneElementProps) { return createElement("rune-cells", props); }
/** Native 270 degree dial with its label children in the centre. */
export function RuneDial(props: RuneElementProps) { return createElement("rune-dial", props); }
/** A direct Rune surface. Descendants use the native host and retain their JSX context. */
export function RuneSurface(props: RuneElementProps) { return createElement("rune-surface", props); }

const Viewport = createContext<{ width: number; height: number } | null>(null);

/** Provide deterministic native viewport dimensions for headless rendering and tooling. */
export function RuneViewport({ width, height, children }: { width: number; height: number; children?: ReactNode }) {
  return <Viewport value={{ width, height }}>{children}</Viewport>;
}

/** Viewport size in layout points; only a resize rerenders its consumer. */
export function useRuneViewport(): { width: number; height: number } {
  const provided = useContext(Viewport);
  const read = () => typeof window === "undefined" ? { width: 1280, height: 720 } : { width: window.innerWidth, height: window.innerHeight };
  const [size, setSize] = useState(read);
  useEffect(() => {
    if (provided !== null || typeof window === "undefined") return;
    const resize = () => setSize(read());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [provided]);
  return provided ?? size;
}
