import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Page } from "../components/Layout";
import { GameCard } from "../components/GameCard";
import { GAME_IDS, gameBlurb, gameCredit, gameSeed, gameTitle, isGameId } from "../lib/games";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/games/$id")({
  head: ({ params }) =>
    seo({
      title: `${gameTitle(params.id)} — play in your browser · jgengine`,
      description: `Play ${gameTitle(params.id)}${gameBlurb(params.id) ? `, ${gameBlurb(params.id)!.toLowerCase()},` : ""} in your browser. Built on jgengine, an open-source TypeScript game engine.`,
      path: `/games/${params.id}`,
    }),
  component: GamePage,
});

function GamePage() {
  const { id } = Route.useParams();
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsFullscreen, setSupportsFullscreen] = useState(false);

  useEffect(() => {
    setSupportsFullscreen(
      typeof document !== "undefined" &&
        document.fullscreenEnabled &&
        typeof frameWrapRef.current?.requestFullscreen === "function",
    );
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameWrapRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  if (!isGameId(id)) {
    return (
      <Page>
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-24 sm:px-6">
          <p className="eyebrow">Unknown game</p>
          <h1 className="font-display text-4xl font-extrabold text-fg">No game called “{id}”.</h1>
          <Link to="/games" className="btn btn-secondary">
            ← All games
          </Link>
        </div>
      </Page>
    );
  }
  const playUrl = `/play/?game=${id}`;
  const credit = gameCredit(id);

  const handleFullscreenClick = async () => {
    if (isFullscreen) {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      }
      return;
    }
    const el = frameWrapRef.current;
    if (el && document.fullscreenEnabled && typeof el.requestFullscreen === "function") {
      try {
        await el.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
        };
        orientation.lock?.("landscape").catch(() => {});
        return;
      } catch {
        // fall through to the new-tab fallback below
      }
    }
    window.open(playUrl, "_blank", "noopener,noreferrer");
  };

  const blurb = gameBlurb(id);
  const seed = gameSeed(id);
  const at = GAME_IDS.indexOf(id);
  const others = [1, 2, 3, 4].map((step) => GAME_IDS[(at + step) % GAME_IDS.length]!).filter((other) => other !== id);

  return (
    <Page stickyHeader={false}>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Link to="/games" className="font-mono text-xs text-faint transition-colors hover:text-fg">
              ← All games
            </Link>
            <h1 className="font-display mt-2 text-3xl font-extrabold text-fg sm:text-[2.6rem]">{gameTitle(id)}</h1>
            {blurb !== null && <p className="mt-1 text-muted">{blurb}</p>}
            {seed !== null && (
              <p className="mt-1 font-mono text-xs text-faint">
                <span className="text-accent-text">started as</span> “{seed}”
              </p>
            )}
          </div>
          <button type="button" onClick={handleFullscreenClick} className="btn btn-secondary">
            {isFullscreen ? "Exit fullscreen" : supportsFullscreen ? "Fullscreen ↗" : "Open player ↗"}
          </button>
        </div>
        <div
          ref={frameWrapRef}
          data-theme="dark"
          className={`mt-5 overflow-hidden border border-line-strong bg-[#06080a] ${isFullscreen ? "h-full w-full" : "rounded-lg"}`}
        >
          <iframe
            src={playUrl}
            title={`${gameTitle(id)}, playable`}
            allow="fullscreen; xr-spatial-tracking; gamepad"
            className={`block w-full border-0 bg-[#06080a] ${isFullscreen ? "h-full" : "h-[72dvh] min-h-[320px] sm:min-h-[520px]"}`}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
          <p>
            Runs in your browser on jgengine. Source:{" "}
            <a href={`https://github.com/Noisemaker111/jgengine/tree/beta/games/${id}`} className="link">
              games/{id}
            </a>
          </p>
          {credit !== null &&
            (credit.url !== undefined ? (
              <a href={credit.url} target="_blank" rel="noreferrer" className="link">
                {credit.text}
              </a>
            ) : (
              <span>{credit.text}</span>
            ))}
        </div>

        {others.length > 0 && (
          <div className="mt-16">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-xl font-extrabold text-fg">Play another</h2>
              <Link to="/games" className="link text-sm">
                All {GAME_IDS.length} games
              </Link>
            </div>
            <ul className="games-wall mt-5">
              {others.map((other) => (
                <li key={other}>
                  <GameCard id={other} seed={false} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </Page>
  );
}
