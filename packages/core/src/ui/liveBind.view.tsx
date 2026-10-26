import { useEffect, useRef, type CSSProperties } from "react";

type FrameSubscriber = () => void;

const subscribers = new Set<FrameSubscriber>();
let sharedRaf = 0;

function sharedTick(): void {
  for (const subscriber of subscribers) subscriber();
  if (subscribers.size > 0) sharedRaf = requestAnimationFrame(sharedTick);
  else sharedRaf = 0;
}

export function subscribeFrameBind(subscriber: FrameSubscriber): () => void {
  subscribers.add(subscriber);
  if (sharedRaf === 0 && typeof requestAnimationFrame !== "undefined") {
    sharedRaf = requestAnimationFrame(sharedTick);
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && sharedRaf !== 0 && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(sharedRaf);
      sharedRaf = 0;
    }
  };
}

export function frameBindSubscriberCount(): number {
  return subscribers.size;
}

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
    return subscribeFrameBind(() => {
      const element = ref.current;
      if (element !== null) applyRef.current(getRef.current(), element);
    });
  }, [ref]);
}

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
