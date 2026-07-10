import { useEffect, useRef, useState, type ReactNode } from "react";

const CAPTURE_WIDTH = 800;
const CAPTURE_HEIGHT = 450;
const READY_TIMEOUT_MS = 16_000;
const POLL_INTERVAL_MS = 150;
const CACHE_VERSION = "v1";

const memoryCache = new Map<string, string>();
const attempted = new Set<string>();
let activeCapture: Promise<void> = Promise.resolve();

function storageKey(id: string): string {
  return `jg-poster:${CACHE_VERSION}:${id}`;
}

function readCache(id: string): string | undefined {
  const hit = memoryCache.get(id);
  if (hit !== undefined) return hit;
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const stored = sessionStorage.getItem(storageKey(id)) ?? undefined;
    if (stored !== undefined) memoryCache.set(id, stored);
    return stored;
  } catch {
    return undefined;
  }
}

function writeCache(id: string, dataUrl: string): void {
  memoryCache.set(id, dataUrl);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(id), dataUrl);
  } catch {
    // quota exceeded — memory cache still serves this session
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

const MIN_LUMINANCE_STDDEV = 10;

function hasSceneContent(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return true;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  try {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 16) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
      sumSq += lum * lum;
      count += 1;
    }
  } catch {
    return true;
  }
  if (count === 0) return true;
  const mean = sum / count;
  const stddev = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  return stddev >= MIN_LUMINANCE_STDDEV;
}

async function renderPoster(id: string): Promise<string | null> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${CAPTURE_WIDTH}px`,
    height: `${CAPTURE_HEIGHT}px`,
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  iframe.src = `/play/?game=${encodeURIComponent(id)}&mode=poster`;
  document.body.appendChild(iframe);

  try {
    const deadline = performance.now() + READY_TIMEOUT_MS;
    let ready = false;
    while (performance.now() < deadline) {
      const doc = iframe.contentDocument;
      if (doc?.querySelector("[data-poster-ready]") != null) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (!ready) return null;

    await nextFrame();
    await nextFrame();

    const canvas = iframe.contentDocument?.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return null;

    const out = document.createElement("canvas");
    out.width = CAPTURE_WIDTH;
    out.height = CAPTURE_HEIGHT;
    const paint = out.getContext("2d");
    if (paint === null) return null;
    paint.drawImage(canvas, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    if (!hasSceneContent(out)) return null;
    return out.toDataURL("image/webp", 0.82);
  } catch {
    return null;
  } finally {
    iframe.remove();
  }
}

function queueCapture(id: string): Promise<string | null> {
  const run = activeCapture.then(() => renderPoster(id));
  activeCapture = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function SceneThumbnail({
  id,
  className = "",
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cached = readCache(id);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }
    if (attempted.has(id)) return;

    const host = hostRef.current;
    if (host === null) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (attempted.has(id)) return;
        attempted.add(id);
        void queueCapture(id).then((dataUrl) => {
          if (cancelled || dataUrl === null) return;
          writeCache(id, dataUrl);
          setSrc(dataUrl);
        });
      },
      { rootMargin: "300px" },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id]);

  return (
    <div ref={hostRef} className={`relative h-full w-full ${className}`}>
      {children}
      {src !== undefined && (
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500"
          onLoad={(event) => {
            event.currentTarget.style.opacity = "1";
          }}
        />
      )}
    </div>
  );
}
