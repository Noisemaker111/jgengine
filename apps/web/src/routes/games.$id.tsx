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
          <h1 className="text-2xl font-bold text-slate-50">No game called “{id}”</h1>
          <Link to="/games" className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-200">
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
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-deep/60 shadow-[0_24px_80px_-24px_rgba(2,3,8,0.95)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  to="/games"
                  className="shrink-0 font-mono text-[11px] text-slate-500 transition hover:text-slate-300"
                >
                  ← games
                </Link>
                <span className="truncate text-sm font-semibold text-slate-100">{gameTitle(id)}</span>
              </div>
              <button
                type="button"
                onClick={handleFullscreenClick}
                className="shrink-0 font-mono text-[11px] text-emerald-300/90 transition hover:text-emerald-200"
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
          <p className="mt-3 text-center text-xs text-slate-500">
            Runs entirely in your browser. Source:{" "}
            <code className="text-slate-400">Games/{id}</code> — built by a coding agent on JGengine.
          </p>
          {credit !== null && (
            <p className="mt-1 text-center text-xs text-slate-500">
              {credit.url !== undefined ? (
                <a
                  href={credit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 underline decoration-slate-600 underline-offset-2 transition hover:text-emerald-300"
                >
                  {credit.text}
                </a>
              ) : (
                <span className="text-slate-400">{credit.text}</span>
              )}
            </p>
          )}
        </div>
      </section>
    </Page>
  );
}
