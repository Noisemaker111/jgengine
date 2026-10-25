import { Canvas } from "@react-three/fiber";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "@/components/ui/cn";

/** Scroll container used to lazy-mount off-screen preview canvases. */
export const DomViewportScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

const DomViewportScrollActivityContext = createContext(false);

const SCROLL_IDLE_MS = 220;
const DEFAULT_MOUNT_ROOT_MARGIN = "320px 0px";
const DEFAULT_UNMOUNT_DEFER_MS = 900;

export function DomViewportScrollProvider({
  scrollRef,
  children,
}: {
  scrollRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollEndTimerRef = useRef(0);

  useEffect(() => {
    const scrollEl = scrollRef?.current ?? null;
    if (!scrollEl) return;

    const onScroll = () => {
      setIsScrolling(true);
      window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = window.setTimeout(() => {
        setIsScrolling(false);
      }, SCROLL_IDLE_MS);
    };

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      window.clearTimeout(scrollEndTimerRef.current);
    };
  }, [scrollRef]);

  return (
    <DomViewportScrollContext.Provider value={scrollRef ?? null}>
      <DomViewportScrollActivityContext.Provider value={isScrolling}>
        {children}
      </DomViewportScrollActivityContext.Provider>
    </DomViewportScrollContext.Provider>
  );
}

export type DomViewportVisibility = {
  /** Card intersects the expanded scroll viewport. */
  active: boolean;
  /** Canvas is mounted; held during fast scroll until idle. */
  mounted: boolean;
};

/**
 * Tracks whether a DOM viewport should render its canvas.
 * Mounts early (root margin), holds through fast scroll, unmounts after idle.
 */
export function useDomViewportVisibility(
  viewportRef: RefObject<HTMLElement | null>,
  options?: {
    rootMargin?: string;
    deferUnmountMs?: number;
  },
): DomViewportVisibility {
  const scrollRef = useContext(DomViewportScrollContext);
  const isScrolling = useContext(DomViewportScrollActivityContext);
  const rootMargin = options?.rootMargin ?? DEFAULT_MOUNT_ROOT_MARGIN;
  const deferUnmountMs = options?.deferUnmountMs ?? DEFAULT_UNMOUNT_DEFER_MS;

  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const update = (entry?: IntersectionObserverEntry) => {
      setActive(entry?.isIntersecting ?? false);
    };

    const observer = new IntersectionObserver(
      ([entry]) => update(entry),
      {
        root: scrollRef?.current ?? null,
        rootMargin,
        threshold: 0,
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [viewportRef, scrollRef, rootMargin]);

  useEffect(() => {
    if (active) {
      setMounted(true);
    }
  }, [active]);

  useEffect(() => {
    if (active || isScrolling) return;

    const timer = window.setTimeout(() => setMounted(false), deferUnmountMs);
    return () => window.clearTimeout(timer);
  }, [active, isScrolling, deferUnmountMs]);

  return { active, mounted };
}

export type DomViewportCanvasProps = {
  children: ReactNode;
  className?: string;
  camera?: {
    position: [number, number, number];
    zoom: number;
    near: number;
    far: number;
  };
};

const DEFAULT_PREVIEW_CAMERA = {
  position: [3.4, 2.6, 4.2] as [number, number, number],
  zoom: 58,
  near: 0.1,
  far: 80,
};

/**
 * Renders a self-contained R3F canvas inside a DOM box.
 * The box is the viewport — CSS layout and overflow define clipping bounds.
 */
export function DomViewportCanvas({
  children,
  className,
  camera = DEFAULT_PREVIEW_CAMERA,
}: DomViewportCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { mounted } = useDomViewportVisibility(viewportRef);

  return (
    <div
      ref={viewportRef}
      className={cn("relative overflow-hidden", className)}
    >
      {mounted ? (
        <Canvas
          orthographic
          frameloop="demand"
          camera={camera}
          dpr={[1, 1.25]}
          gl={{ antialias: false, alpha: true, stencil: false, depth: true }}
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: "none" }}
        >
          {children}
        </Canvas>
      ) : null}
    </div>
  );
}