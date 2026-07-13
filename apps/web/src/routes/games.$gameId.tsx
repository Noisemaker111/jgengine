import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { GAMES, type Game } from "../content/games";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/games/$gameId")({
  loader: ({ params }) => {
    const game = GAMES.find((entry) => entry.id === params.gameId);
    if (game === undefined) throw notFound();
    return { game };
  },
  head: ({ loaderData }) =>
    seo({
      title: `${loaderData?.game.title ?? "Play"} — JGengine`,
      description: loaderData?.game.tagline ?? "Play a JGengine game in the browser.",
      path: loaderData ? `/games/${loaderData.game.id}` : "/games",
    }),
  component: PlayPage,
});

type GamePhase = "loading" | "playing";

function GameStage({ game }: { game: Game }) {
  const [phase, setPhase] = useState<GamePhase>("loading");
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const markPlaying = useCallback(() => {
    setPhase((current) => (current === "playing" ? current : "playing"));
    frameRef.current?.focus({ preventScroll: true });
  }, []);

  const bindFrame = useCallback(
    (el: HTMLIFrameElement | null) => {
      frameRef.current = el;
      if (el === null) return;
      if (el.contentDocument?.readyState === "complete") markPlaying();
    },
    [markPlaying],
  );

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, []);

  useEffect(() => {
    if (phase !== "loading") return;
    const frame = frameRef.current;
    if (frame?.contentDocument?.readyState === "complete") {
      markPlaying();
      return;
    }
    const fallback = window.setTimeout(markPlaying, 8_000);
    return () => window.clearTimeout(fallback);
  }, [phase, markPlaying]);

  return (
    <div
      className="fixed inset-0 isolate overflow-hidden bg-black"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 80% 90% at 50% 110%, ${game.hue}38, transparent 70%), linear-gradient(to bottom, #0a0f1c, #04060c)`,
        }}
      >
        <iframe
          ref={bindFrame}
          src={`/play/?game=${encodeURIComponent(game.id)}`}
          title={game.title}
          allow="fullscreen; gamepad; pointer-lock"
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${phase === "playing" ? "opacity-100" : "opacity-0"}`}
          onLoad={markPlaying}
        />

        {phase !== "playing" && (
          <div className="absolute inset-0 grid place-items-center" aria-hidden>
            <div className="flex items-center gap-4 font-mono text-sm uppercase tracking-[0.2em] text-white/70">
              <span className="h-5 w-5 animate-spin border-2 border-white/20" style={{ borderTopColor: game.hue }} />
              Loading
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between p-3 sm:p-4">
          <Link
            to="/games"
            aria-label="Exit game"
            className="pointer-events-auto inline-flex h-11 items-center gap-2 border border-white/15 bg-black/50 px-3 font-mono text-xs uppercase tracking-[0.16em] text-white/70 backdrop-blur-md transition hover:border-white/35 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            style={{ clipPath: "polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)" }}
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Exit</span>
          </Link>

          {phase !== "playing" && (
            <div className="border border-white/10 bg-black/35 px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-white/45 backdrop-blur-md">
              {game.platforms?.includes("mobile") === true ? "Desktop + touch" : "Desktop"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayPage() {
  const { game } = Route.useLoaderData();
  return <GameStage game={game} />;
}
