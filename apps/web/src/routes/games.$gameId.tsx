import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { CreditCard, CreditTag } from "../components/Credit";
import { GameFace } from "../components/GameCard";
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

function MobileBadge({ hue }: { hue: string }) {
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider"
      style={{ color: hue, borderColor: `${hue}45`, backgroundColor: `${hue}16` }}
    >
      Mobile
    </span>
  );
}

function GameStage({ game }: { game: Game }) {
  const [phase, setPhase] = useState<"poster" | "loading" | "playing">("poster");
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
        background: `radial-gradient(ellipse 80% 90% at 50% 110%, ${game.hue}38, transparent 70%), linear-gradient(to bottom, #0a0f1c, #04060c)`,
      }}
    >
      {phase !== "playing" && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `linear-gradient(to right, ${game.hue}12 1px, transparent 1px), linear-gradient(to bottom, ${game.hue}12 1px, transparent 1px)`,
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(ellipse 80% 90% at 50% 60%, black 30%, transparent 85%)",
          }}
        />
      )}
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
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-40 blur-[2px]">
            <GameFace game={game} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black/75" />
        </div>
      )}
      {phase !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="max-w-md">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-slate-50">{game.title}</h2>
              {game.platforms?.includes("mobile") === true && <MobileBadge hue={game.hue} />}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-300">{game.tagline}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{game.description}</p>
            <p className="mt-3 font-mono text-xs text-slate-500">{game.controls}</p>
            {game.credit !== undefined && (
              <div className="mt-5">
                <CreditCard credit={game.credit} hue={game.hue} />
              </div>
            )}
          </div>
          {phase === "poster" ? (
            <button
              type="button"
              onClick={() => setPhase("loading")}
              className="inline-flex items-center gap-2.5 rounded-xl px-7 py-3 text-sm font-semibold transition hover:scale-[1.03] hover:brightness-110"
              style={{ backgroundColor: game.hue, color: "#04060c", boxShadow: `0 0 44px -8px ${game.hue}` }}
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
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-sm font-semibold tracking-tight text-slate-100">{game.title}</h1>
          {game.platforms?.includes("mobile") === true && <MobileBadge hue={game.hue} />}
          <p className="hidden truncate font-mono text-xs text-slate-500 sm:block">{game.controls}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {game.credit !== undefined && <CreditTag credit={game.credit} hue={game.hue} />}
          <Link
            to="/games"
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:text-emerald-300"
          >
            ← All games
          </Link>
        </div>
      </div>
      <main className="min-h-0 flex-1 bg-black">
        <GameStage game={game} />
      </main>
    </div>
  );
}
