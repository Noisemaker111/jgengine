/**
 * Dev overlay: see the real HUD layout instead of guessing it from the code.
 *
 * The HUD is spread across ~20 files, so neither a human nor an agent can tell
 * from the source where a component actually lands on a given screen shape, what
 * size it ends up, whether it runs off the edge, or which layer steals a touch.
 * This overlay measures the live DOM and draws it back:
 *
 *   - Every named layer (`data-ui-layer`) gets a labelled box with its real
 *     x / y / width / height — the actual position on THIS screen, not the one
 *     you inferred from Tailwind classes.
 *   - Boxes that run past the viewport edge are flagged amber ("offscreen") —
 *     that is the x/y bug class where a panel is pushed off the right side.
 *   - Interactive regions whose hit areas OVERLAP are tinted red — those are the
 *     spots where one layer steals a touch meant for another (z-index blocking).
 *   - A legend lists every named layer and its coordinates, so you get a table
 *     of where everything is even without reading the outlines.
 *
 * Enable with ?ui=1 or ?debug=ui in the URL. The overlay is pointer-events-none
 * and sits above everything, so it never changes the layout it measures.
 */

import { useEffect, useState } from "react";

import { UI_LAYER } from "@/runtime/uiLayers";

export function useShowUiHitTest(): boolean {
  const [enabled, setEnabled] = useState(() => readFlag());
  useEffect(() => {
    const onChange = () => setEnabled(readFlag());
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return enabled;
}

function readFlag(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("ui") === "1" || params.get("debug") === "ui";
}

interface MeasuredBox {
  label: string;
  zIndex: number;
  rect: DOMRect;
  offscreen: boolean;
}

/** Named structural layers — the components whose position/size we want to see. */
const LAYOUT_SELECTOR = "[data-ui-layer]";

/** Tags we treat as "a thing the player can press/drag" — for touch-conflict checks. */
const INTERACTIVE_SELECTOR =
  'button, a[href], canvas, input, [role="button"], [role="slider"], .game-ui-interactive';

function effectiveZIndex(element: Element): number {
  let node: Element | null = element;
  while (node instanceof HTMLElement) {
    const style = window.getComputedStyle(node);
    if (style.position !== "static") {
      const z = Number.parseInt(style.zIndex, 10);
      if (!Number.isNaN(z)) return z;
    }
    node = node.parentElement;
  }
  return 0;
}

function describe(element: Element): string {
  const layer = element.getAttribute("data-ui-layer");
  if (layer) return layer;
  const aria = element.getAttribute("aria-label");
  if (aria) return aria;
  if (element.tagName === "CANVAS") return "scene";
  const text = element.textContent?.trim();
  if (text) return text.length > 16 ? `${text.slice(0, 16)}…` : text;
  return element.tagName.toLowerCase();
}

function isOffscreen(rect: DOMRect): boolean {
  return (
    rect.left < -1 ||
    rect.top < -1 ||
    rect.right > window.innerWidth + 1 ||
    rect.bottom > window.innerHeight + 1
  );
}

function measure(selector: string): MeasuredBox[] {
  const boxes: MeasuredBox[] = [];
  for (const element of document.querySelectorAll(selector)) {
    if (window.getComputedStyle(element).pointerEvents === "none" && selector === INTERACTIVE_SELECTOR) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    boxes.push({
      label: describe(element),
      zIndex: effectiveZIndex(element),
      rect,
      offscreen: isOffscreen(rect),
    });
  }
  return boxes;
}

function intersection(a: DOMRect, b: DOMRect): DOMRect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right - left < 6 || bottom - top < 6) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

function coords(rect: DOMRect): string {
  return `${Math.round(rect.left)},${Math.round(rect.top)} · ${Math.round(rect.width)}×${Math.round(rect.height)}`;
}

export function UiHitTestOverlay() {
  const [layout, setLayout] = useState<MeasuredBox[]>([]);
  const [interactive, setInteractive] = useState<MeasuredBox[]>([]);

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setLayout(measure(LAYOUT_SELECTOR));
      setInteractive(measure(INTERACTIVE_SELECTOR));
      timer = window.setTimeout(tick, 200);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  const conflicts: DOMRect[] = [];
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const region = intersection(interactive[i].rect, interactive[j].rect);
      if (region) conflicts.push(region);
    }
  }

  const offscreenCount = layout.filter((box) => box.offscreen).length;

  return (
    <div
      className="pointer-events-none fixed inset-0 font-mono"
      style={{ zIndex: UI_LAYER.debugInspector }}
      aria-hidden="true"
    >
      {/* Named layout layers: where each component actually lands + its size. */}
      {layout.map((box, index) => (
        <div
          key={`layout-${index}`}
          className={box.offscreen ? "absolute border-2 border-dashed border-amber-400" : "absolute border border-cyan-400/70"}
          style={{ left: box.rect.left, top: box.rect.top, width: box.rect.width, height: box.rect.height }}
        >
          <span
            className={
              box.offscreen
                ? "absolute left-0 top-0 whitespace-nowrap bg-amber-400 px-1 text-[9px] font-bold leading-tight text-black"
                : "absolute left-0 top-0 whitespace-nowrap bg-cyan-400/90 px-1 text-[9px] font-bold leading-tight text-black"
            }
          >
            {box.label} · z{box.zIndex} · {coords(box.rect)}
            {box.offscreen ? " · OFFSCREEN" : ""}
          </span>
        </div>
      ))}

      {/* Touch-conflict zones: one interactive layer steals another's touch here. */}
      {conflicts.map((region, index) => (
        <div
          key={`conflict-${index}`}
          className="absolute border border-red-500 bg-red-500/30"
          style={{ left: region.left, top: region.top, width: region.width, height: region.height }}
        />
      ))}

      {/* Legend / table of every named layer and its coordinates. */}
      <div className="absolute left-2 top-2 max-h-[80vh] max-w-[70vw] overflow-auto rounded bg-black/85 px-2 py-1.5 text-[10px] leading-snug text-white">
        <div className="font-bold text-cyan-300">UI inspector (?debug=ui)</div>
        <div className={conflicts.length > 0 ? "text-red-400" : "text-emerald-400"}>
          {conflicts.length > 0
            ? `${conflicts.length} touch conflict${conflicts.length === 1 ? "" : "s"} (red)`
            : "no touch conflicts"}
        </div>
        <div className={offscreenCount > 0 ? "text-amber-400" : "text-emerald-400"}>
          {offscreenCount > 0 ? `${offscreenCount} offscreen (amber)` : "all in viewport"}
        </div>
        <div className="mt-1 border-t border-white/20 pt-1">
          {layout
            .slice()
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((box, index) => (
              <div key={index} className={box.offscreen ? "text-amber-300" : "text-white/85"}>
                <span className="text-cyan-300">{box.label}</span> z{box.zIndex} · {coords(box.rect)}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
