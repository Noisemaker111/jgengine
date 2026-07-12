import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type { Game } from "../content/games";

type PreviewComponent = ComponentType<{ className?: string }>;

const previewModules = import.meta.glob<{ default: PreviewComponent }>("../../../../Games/*/src/preview.tsx");

const PREVIEWS: Record<string, LazyExoticComponent<PreviewComponent>> = {};
for (const [path, load] of Object.entries(previewModules)) {
  const id = path.split("/").at(-3);
  if (id !== undefined) PREVIEWS[id] = lazy(load);
}

function PreviewFallback({ game }: { game: Game }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#04060c]">
      <span
        className="px-4 text-center font-black uppercase tracking-[0.2em] text-slate-200"
        style={{ textShadow: `0 0 24px ${game.hue}55` }}
      >
        {game.title}
      </span>
    </div>
  );
}

function useNearViewport<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNear(entry.isIntersecting);
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, near };
}

export function PreviewFrame({ game, className = "" }: { game: Game; className?: string }) {
  const Preview = PREVIEWS[game.id];
  const { ref, near } = useNearViewport<HTMLDivElement>();
  return (
    <div ref={ref} className={`relative h-full w-full overflow-hidden bg-[#04060c] ${className}`}>
      {Preview === undefined || !near ? (
        <PreviewFallback game={game} />
      ) : (
        <Suspense fallback={<PreviewFallback game={game} />}>
          <div className="absolute inset-0">
            <Preview className="h-full w-full" />
          </div>
        </Suspense>
      )}
    </div>
  );
}
