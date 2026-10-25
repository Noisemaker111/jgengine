import { useEffect, useInsertionEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * How the cursor marks the selected item.
 *
 * - `brackets`: four corner brackets that snap around it, like a console menu.
 * - `chevron`: a pointer at its left edge that slides between items.
 * - `bar`: a thick bar under it, like a tab or a racing menu.
 * - `diamond`: a spinning diamond at its left, for fantasy and arcade menus.
 * - `frame`: a glowing outline the size of the item.
 */
export type GameCursorStyle = "brackets" | "chevron" | "bar" | "diamond" | "frame";

/** Props for {@link GameCursor}. */
export interface GameCursorProps {
  /** Look. Default `brackets`. */
  variant?: GameCursorStyle;
  /** Colour. Default the theme accent. */
  color?: string;
  /** Gap between the item and the cursor in px. Default 6. */
  gap?: number;
  /** Line thickness in px. Default 3. */
  thickness?: number;
  /** Bracket arm length in px. Default 14. */
  arm?: number;
  className?: string;
  style?: CSSProperties;
}

/** What the cursor follows, in priority order: the menu's current item, then focus, then the hovered control. */
const TARGETS = '[data-jg-menu-item], button, [role="button"], [role="tab"], [role="slider"], a[href], [data-jg-frame][data-interactive]';

const CURSOR_CSS = `@layer components.jgengine {
[data-jg-cursor-scope] :focus-visible { outline: none; }
[data-jg-game-cursor] { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 3; color: var(--jg-cursor-color, var(--jg-accent, #ffd23f)); transition: transform calc(140ms * var(--jg-motion-scale, 1)) cubic-bezier(0.2, 0.9, 0.3, 1.2), width calc(140ms * var(--jg-motion-scale, 1)) cubic-bezier(0.2, 0.9, 0.3, 1.2), height calc(140ms * var(--jg-motion-scale, 1)) cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity calc(120ms * var(--jg-motion-scale, 1)) ease; filter: drop-shadow(0 0 6px color-mix(in srgb, currentColor 55%, transparent)); }
[data-jg-game-cursor][data-hidden] { opacity: 0; }
[data-jg-game-cursor="brackets"] { --a: var(--jg-cursor-arm, 14px); --t: var(--jg-cursor-thickness, 3px);
  background:
    linear-gradient(currentColor, currentColor) top left / var(--a) var(--t) no-repeat,
    linear-gradient(currentColor, currentColor) top left / var(--t) var(--a) no-repeat,
    linear-gradient(currentColor, currentColor) top right / var(--a) var(--t) no-repeat,
    linear-gradient(currentColor, currentColor) top right / var(--t) var(--a) no-repeat,
    linear-gradient(currentColor, currentColor) bottom left / var(--a) var(--t) no-repeat,
    linear-gradient(currentColor, currentColor) bottom left / var(--t) var(--a) no-repeat,
    linear-gradient(currentColor, currentColor) bottom right / var(--a) var(--t) no-repeat,
    linear-gradient(currentColor, currentColor) bottom right / var(--t) var(--a) no-repeat;
  animation: jg-cursor-breathe calc(1400ms * var(--jg-motion-scale, 1)) ease-in-out infinite; }
[data-jg-game-cursor="frame"] { box-shadow: 0 0 0 var(--jg-cursor-thickness, 3px) currentColor, 0 0 18px currentColor; animation: jg-cursor-breathe calc(1400ms * var(--jg-motion-scale, 1)) ease-in-out infinite; }
[data-jg-game-cursor="bar"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: var(--jg-cursor-thickness, 3px); background: currentColor; }
[data-jg-game-cursor="chevron"]::before { content: ""; position: absolute; top: 50%; left: calc(-1 * var(--jg-cursor-arm, 14px)); width: var(--jg-cursor-arm, 14px); height: var(--jg-cursor-arm, 14px); translate: 0 -50%; background: currentColor; clip-path: polygon(0 0, 100% 50%, 0 100%, 30% 50%); animation: jg-cursor-nudge calc(900ms * var(--jg-motion-scale, 1)) ease-in-out infinite; }
[data-jg-game-cursor="diamond"]::before { content: ""; position: absolute; top: 50%; left: calc(-1 * var(--jg-cursor-arm, 14px)); width: calc(var(--jg-cursor-arm, 14px) * 0.7); height: calc(var(--jg-cursor-arm, 14px) * 0.7); translate: 0 -50%; rotate: 45deg; background: currentColor; box-shadow: 0 0 0 2px rgba(0,0,0,0.5); animation: jg-cursor-spin calc(2400ms * var(--jg-motion-scale, 1)) linear infinite; }
@keyframes jg-cursor-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.62; } }
@keyframes jg-cursor-nudge { 0%, 100% { translate: 0 -50%; } 50% { translate: 4px -50%; } }
@keyframes jg-cursor-spin { from { rotate: 45deg; } to { rotate: 405deg; } }
}`;

const CURSOR_STYLE_ID = "jg-game-cursor-styles";

function ensureCursorStyles(): void {
  if (typeof document === "undefined" || document.getElementById(CURSOR_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = CURSOR_STYLE_ID;
  style.textContent = CURSOR_CSS;
  document.head.appendChild(style);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The item the cursor should sit on inside `scope`, or null. */
export function gameCursorTarget(scope: ParentNode, hovered: Element | null): Element | null {
  const current = scope.querySelector('[data-jg-menu-item][aria-current="true"]');
  if (current !== null) return current;
  const focused = typeof document === "undefined" ? null : document.activeElement;
  if (focused !== null && focused !== document.body && (scope as Node).contains(focused) && focused.matches(TARGETS)) return focused;
  return hovered;
}

/**
 * A game-style selection cursor for a menu: corner brackets, a pointer or a bar that glides to
 * whichever item the keyboard, gamepad or mouse selects, instead of a browser focus ring. Drop it
 * inside the menu's positioned container; it follows the `useMenuNav` current item, then focus,
 * then the hovered control, and hides when nothing is selected. Reduced motion makes it jump.
 *
 * ```tsx
 * <nav style={{ position: "relative" }} {...nav.containerProps}>
 *   {items}
 *   <GameCursor variant="chevron" />
 * </nav>
 * ```
 *
 * @capability game-cursor console-style selection cursor (brackets, chevron, bar) that glides to the focused menu item
 */
export function GameCursor({ variant = "brackets", color, gap = 6, thickness = 3, arm = 14, className, style }: GameCursorProps): ReactNode {
  useInsertionEffect(ensureCursorStyles, []);
  const self = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const node = self.current;
    const scope = node?.parentElement;
    if (node === null || scope === null || scope === undefined) return;
    scope.setAttribute("data-jg-cursor-scope", "");
    let hovered: Element | null = null;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = gameCursorTarget(scope, hovered);
        if (target === null) return setBox(null);
        const host = (node.offsetParent ?? scope).getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return setBox(null);
        setBox({ x: rect.left - host.left - gap, y: rect.top - host.top - gap, w: rect.width + gap * 2, h: rect.height + gap * 2 });
      });
    };
    const onOver = (event: Event) => {
      const target = (event.target as Element | null)?.closest?.(TARGETS) ?? null;
      if (target !== null && scope.contains(target)) hovered = target;
      measure();
    };
    const onLeave = () => {
      hovered = null;
      measure();
    };
    const observer = new MutationObserver(measure);
    observer.observe(scope, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current", "aria-pressed", "aria-selected"] });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(scope);
    scope.addEventListener("focusin", measure);
    scope.addEventListener("pointerover", onOver);
    scope.addEventListener("pointerleave", onLeave);
    scope.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize?.disconnect();
      scope.removeEventListener("focusin", measure);
      scope.removeEventListener("pointerover", onOver);
      scope.removeEventListener("pointerleave", onLeave);
      scope.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      scope.removeAttribute("data-jg-cursor-scope");
    };
  }, [gap]);

  const vars = {
    "--jg-cursor-color": color,
    "--jg-cursor-thickness": `${thickness}px`,
    "--jg-cursor-arm": `${arm}px`,
  } as CSSProperties;
  return (
    <div
      ref={self}
      aria-hidden="true"
      data-jg-game-cursor={variant}
      data-hidden={box === null ? "" : undefined}
      className={className}
      style={{
        ...vars,
        width: box?.w ?? 0,
        height: box?.h ?? 0,
        transform: box === null ? undefined : `translate(${box.x}px, ${box.y}px)`,
        ...style,
      }}
    />
  );
}
