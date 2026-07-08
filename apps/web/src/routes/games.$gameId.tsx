import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { GameArt } from "../components/GameArt";
import { Header } from "../components/Layout";
import { GAMES, type Game } from "../content/games";

export const Route = createFileRoute("/games/$gameId")({
  loader: ({ params }) => {
    const game = GAMES.find((entry) => entry.id === params.gameId);
    if (game === undefined) throw notFound();
    return { game };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.game.title ?? "Play"} — JGengine` },
      { name: "description", content: loaderData?.game.tagline ?? "Play a JGengine game in the browser." },
    ],
  }),
  component: PlayPage,
});

function GameStage({ game }: { game: Game }) {
  const [phase, setPhase] = useState<"poster" | "loading" | "playing">("poster");
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const markPlaying = useCallback(() => {
    setPhase((current) => (current === "playing" ? current : "playing"));
    frameRef.current?.focus();
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
      className="relative h-full w-full"
      style={{
        background: `radial-gradient(ellipse 80% 90% at 50% 110%, ${game.hue}2e, transparent 70%), linear-gradient(to bottom, #0a0e18, #060910)`,
      }}
    >
      {phase !== "poster" && (
        <iframe
          ref={bindFrame}
          src={`/play/?game=${encodeURIComponent(game.id)}`}
          title={game.title}
          allow="fullscreen; gamepad; pointer-lock"
          className={`h-full w-full border-0 transition-opacity duration-300 ${phase === "playing" ? "opacity-100" : "opacity-0"}`}
          onLoad={markPlaying}
        />
      )}
      {phase !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="h-32 w-48 sm:h-40 sm:w-60">
            <GameArt id={game.id} hue={game.hue} />
          </div>
          <div className="max-w-md">
            <h2 className="text-2xl font-bold tracking-tight text-slate-50">{game.title}</h2>
            <p className="mt-2 text-sm text-slate-400">{game.tagline}</p>
            <p className="mt-3 font-mono text-xs text-slate-600">{game.controls}</p>
          </div>
          {phase === "poster" ? (
            <button
              type="button"
              onClick={() => setPhase("loading")}
              className="inline-flex items-center gap-2.5 rounded-xl px-7 py-3 text-sm font-semibold transition hover:brightness-110"
              style={{ backgroundColor: game.hue, color: "#060910", boxShadow: `0 0 36px -8px ${game.hue}` }}
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
                <path d="M3 2.2v7.6L10 6 3 2.2Z" />
              </svg>
              Play now
            </button>
          ) : (
            <div className="inline-flex items-center gap-3 text-sm text-slate-300">
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-white/15"
                style={{ borderTopColor: game.hue }}
              />
              Loading {game.title}…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayPage() {
  const { game } = Route.useLoaderData();
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-sm font-semibold tracking-tight text-slate-100">{game.title}</h1>
          <p className="hidden truncate font-mono text-xs text-slate-500 sm:block">{game.controls}</p>
        </div>
        <Link
          to="/games"
          className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 transition hover:text-emerald-300"
        >
          ← All games
        </Link>
      </div>
      <main className="min-h-0 flex-1 bg-black">
        <GameStage game={game} />
      </main>
    </div>
  );
}
