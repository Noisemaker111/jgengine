import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { PreviewFrame } from "../components/PreviewFrame";
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

type GamePhase = "poster" | "loading" | "playing";

function GameStage({ game }: { game: Game }) {
  const [phase, setPhase] = useState<GamePhase>("poster");
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
        {phase !== "poster" && (
          <iframe
            ref={bindFrame}
            src={`/play/?game=${encodeURIComponent(game.id)}`}
            title={game.title}
            allow="fullscreen; gamepad; pointer-lock"
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${phase === "playing" ? "opacity-100" : "opacity-0"}`}
            onLoad={markPlaying}
          />
        )}

        {phase !== "playing" && (
          <div className="absolute inset-0" aria-hidden>
            <div className="absolute inset-0 opacity-70">
              <PreviewFrame game={game} />
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent_0%,rgba(0,0,0,.28)_42%,rgba(0,0,0,.86)_100%)]" />
            <div
              className="absolute inset-x-0 bottom-0 h-1/2"
              style={{ background: `linear-gradient(to top, ${game.hue}20, transparent)` }}
            />
          </div>
        )}

        {phase !== "playing" && (
          <div className="absolute inset-0 grid place-items-center px-6 py-20 text-center">
            <div className="relative flex max-w-3xl flex-col items-center">
              <p className="mb-4 font-mono text-xs uppercase tracking-[0.42em] text-white/55">JGengine presents</p>
              <h1
                className="text-balance text-5xl font-black uppercase leading-[0.88] tracking-[-0.045em] text-white sm:text-7xl md:text-8xl"
                style={{ textShadow: `0 0 48px ${game.hue}66` }}
              >
                {game.title}
              </h1>
              <p className="mt-5 max-w-xl text-balance text-base font-medium leading-relaxed text-white/75 sm:text-lg">
                {game.tagline}
              </p>

              {phase === "poster" ? (
                <button
                  type="button"
                  onClick={() => setPhase("loading")}
                  className="group relative mt-10 min-h-14 min-w-52 overflow-hidden border border-white/25 px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.24em] text-white transition duration-150 hover:-translate-y-0.5 hover:border-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 active:translate-y-0 active:scale-[0.98]"
                  style={{ clipPath: "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)" }}
                >
                  <span
                    className="absolute inset-0 opacity-80 transition group-hover:opacity-100"
                    style={{ background: `linear-gradient(135deg, ${game.hue}cc, ${game.hue}55)` }}
                  />
                  <span className="relative inline-flex items-center gap-3">
                    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                      <path d="M3 2.2v7.6L10 6 3 2.2Z" />
                    </svg>
                    Enter game
                  </span>
                </button>
              ) : (
                <div className="mt-10 flex items-center gap-4 font-mono text-sm uppercase tracking-[0.2em] text-white/70">
                  <span className="h-5 w-5 animate-spin border-2 border-white/20" style={{ borderTopColor: game.hue }} />
                  Loading
                </div>
              )}
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
