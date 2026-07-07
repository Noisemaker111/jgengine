import { useEffect, useRef, type CSSProperties } from "react";

/**
 * Drive a DOM/SVG element from a per-frame value without re-rendering React.
 * Runs one requestAnimationFrame loop, reads `get()` each frame, and calls
 * `apply(value, element)` so HUDs bound to live engine state (speed, pose)
 * never re-render and never lag. `get`/`apply` may change without restarting.
 */
export function useFrameBind<T, E extends Element = Element>(
  ref: { current: E | null },
  get: () => T,
  apply: (value: T, element: E) => void,
): void {
  const getRef = useRef(get);
  getRef.current = get;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const element = ref.current;
      if (element !== null) applyRef.current(getRef.current(), element);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}

/**
 * A `<span>` whose text tracks a live value every frame (the 90% case of
 * useFrameBind). `<LiveText get={() => groundSpeed(car) * KMH} format={Math.round} />`.
 */
export function LiveText({
  get,
  format,
  className,
  style,
}: {
  get: () => number | string;
  format?: (value: number | string) => string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useFrameBind(ref, get, (value, element) => {
    const text = format !== undefined ? format(value) : String(value);
    if (element.textContent !== text) element.textContent = text;
  });
  return <span ref={ref} className={className} style={style} />;
}
