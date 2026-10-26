import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Props for caller-composed horizontally scrolling controls. */
export interface ScrollRailProps {
  children: ReactNode;
  /** Accessible name for the rail and its overflow navigation. */
  label: string;
  className?: string;
  style?: CSSProperties;
  /** Spacing between caller-owned items. Default 6 pixels. */
  gap?: number;
}

/**
 * Native horizontal scrolling with overflow-only navigation and automatic focus reveal.
 * Callers own item markup, selection, keyboard semantics, and skin through HudTheme or style.
 *
 * @capability scroll-rail reachable horizontal controls with visible overflow navigation and keyboard focus reveal
 */
export function ScrollRail({ children, label, className, style, gap = 6 }: ScrollRailProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = () => {
    const rail = ref.current;
    if (rail === null) return;
    const next = { start: rail.scrollLeft <= 1, end: rail.scrollWidth - rail.clientWidth - rail.scrollLeft <= 1 };
    setEdges(current => current.start === next.start && current.end === next.end ? current : next);
  };
  useEffect(() => {
    const rail = ref.current;
    if (rail === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    for (const child of rail.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [children]);
  const scroll = (direction: number) => {
    const rail = ref.current;
    if (rail === null) return;
    rail.scrollBy({ left: direction * Math.max(44, rail.clientWidth * 0.8), behavior: "instant" });
    measure();
  };
  const overflow = !edges.start || !edges.end;
  const buttonStyle: CSSProperties = {
    flex: "0 0 44px", minHeight: 44, border: "1px solid var(--jg-edge, #454550)",
    borderRadius: "var(--jg-slot-radius, 6px)", background: "var(--jg-surface-deep, #15151d)",
    color: "var(--jg-text, #ececef)", font: "inherit", cursor: "pointer",
  };
  return <div className={className} data-scroll-rail="" style={{ display: "flex", minWidth: 0, flexShrink: 0, gap, ...style }}>
    {overflow && <button type="button" aria-label={`Show earlier ${label}`} aria-controls={id} disabled={edges.start} onClick={() => scroll(-1)} style={{ ...buttonStyle, opacity: edges.start ? 0.45 : 1 }}>←</button>}
    <div ref={ref} id={id} role="group" aria-label={label} onScroll={measure}
      onFocusCapture={event => {
        const rail = ref.current;
        if (rail === null || event.target === rail) return;
        const bounds = rail.getBoundingClientRect(), target = event.target.getBoundingClientRect();
        if (target.left < bounds.left) rail.scrollLeft += target.left - bounds.left;
        else if (target.right > bounds.right) rail.scrollLeft += target.right - bounds.right;
        measure();
      }}
      style={{ display: "flex", flex: "1 1 auto", minWidth: 0, overflowX: "auto", gap }}>
      {children}
    </div>
    {overflow && <button type="button" aria-label={`Show later ${label}`} aria-controls={id} disabled={edges.end} onClick={() => scroll(1)} style={{ ...buttonStyle, opacity: edges.end ? 0.45 : 1 }}>→</button>}
  </div>;
}
