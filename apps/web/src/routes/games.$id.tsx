import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Page } from "../components/Layout";
import { gameCredit, gameTitle, isGameId } from "../lib/games";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/games/$id")({
  head: ({ params }) =>
    seo({
      title: `${gameTitle(params.id)} — play in your browser · JGengine`,
      description: `Play ${gameTitle(params.id)}, built with JGengine, right in your browser.`,
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
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
          <h1 className="text-2xl font-bold text-fg">No game called “{id}”</h1>
          <Link to="/games" className="text-accent-text underline decoration-accent/50 underline-offset-2 hover:text-accent-text">
            ← Back to all games
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

  return (
    <Page stickyHeader={false}>
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-line bg-sunken/60">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  to="/games"
                  className="shrink-0 font-mono text-[11px] text-faint transition hover:text-muted"
                >
                  ← games
                </Link>
                <span className="truncate text-sm font-semibold text-fg">{gameTitle(id)}</span>
              </div>
              <button
                type="button"
                onClick={handleFullscreenClick}
                className="shrink-0 font-mono text-[11px] text-accent-text transition hover:text-accent-text"
              >
                {isFullscreen ? "exit fullscreen" : supportsFullscreen ? "fullscreen ↗" : "open player ↗"}
              </button>
            </div>
            <div
              ref={frameWrapRef}
              className={isFullscreen ? "h-full w-full bg-neutral-950" : ""}
            >
              <iframe
                src={playUrl}
                title={`${gameTitle(id)} — JGengine`}
                allow="fullscreen; xr-spatial-tracking; gamepad"
                className={`w-full border-0 bg-neutral-950 ${
                  isFullscreen ? "h-full" : "h-[78dvh] min-h-[320px] sm:min-h-[520px]"
                }`}
              />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-faint">
            Runs entirely in your browser. Source:{" "}
            <code className="text-muted">Games/{id}</code> — built by a coding agent on JGengine.
          </p>
          {credit !== null && (
            <p className="mt-1 text-center text-xs text-faint">
              {credit.url !== undefined ? (
                <a
                  href={credit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted underline decoration-line-strong underline-offset-2 transition hover:text-accent-text"
                >
                  {credit.text}
                </a>
              ) : (
                <span className="text-muted">{credit.text}</span>
              )}
            </p>
          )}
        </div>
      </section>
    </Page>
  );
}
