import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from "react";
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

export function PreviewFrame({ game, className = "" }: { game: Game; className?: string }) {
  const Preview = PREVIEWS[game.id];
  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#04060c] ${className}`}>
      {Preview === undefined ? (
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
