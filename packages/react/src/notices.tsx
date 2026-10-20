import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import type { Notice, NoticeFeed, NoticeTone } from "@jgengine/core/game/notices";

import { useOptionalGameContext } from "./provider";

export type { Notice, NoticeTone } from "@jgengine/core/game/notices";

/** Where {@link NoticeStack} sits: below top-edge HUD bars, over the play area, or above bottom action bars. */
export type NoticePlacement = "top" | "center" | "bottom";

const EXIT_MS = 200;
const EMPTY: readonly Notice[] = [];
const NO_FEED_SUBSCRIBE = () => () => undefined;

const TONE_COLOR: Record<NoticeTone, string> = {
  info: "var(--jg-accent, #7cc4ff)",
  success: "var(--jg-success, #3ecf8e)",
  warn: "var(--jg-warning, #f5b544)",
  deny: "var(--jg-danger, #f26d6d)",
};

const TONE_LABEL: Record<NoticeTone, string> = { info: "Info", success: "Done", warn: "Warning", deny: "Can't do that" };

const PLACEMENT_STYLE: Record<NoticePlacement, CSSProperties> = {
  top: { top: "clamp(64px, 14%, 150px)" },
  center: { top: "34%" },
  bottom: { bottom: "clamp(120px, 22%, 230px)", flexDirection: "column-reverse" },
};

const KEYFRAMES = `
@keyframes jg-notice-in { from { opacity: 0; transform: translateY(-8px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes jg-notice-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-6px) scale(0.98); } }
@keyframes jg-notice-shake { 0%,100% { transform: none; } 20% { transform: translateX(-5px); } 45% { transform: translateX(4px); } 70% { transform: translateX(-2px); } }
@keyframes jg-notice-pop { 0% { transform: scale(1); } 40% { transform: scale(1.035); } 100% { transform: scale(1); } }
[data-jg-notice] { animation: jg-notice-in 180ms cubic-bezier(.2,.8,.2,1) both; }
[data-jg-notice][data-leaving] { animation: jg-notice-out ${EXIT_MS}ms ease-in both; }
[data-jg-notice-body][data-bump="deny"] { animation: jg-notice-shake 260ms ease-out; }
[data-jg-notice-body][data-bump="other"] { animation: jg-notice-pop 220ms ease-out; }
@media (prefers-reduced-motion: reduce) { [data-jg-notice], [data-jg-notice][data-leaving], [data-jg-notice-body][data-bump] { animation-duration: 1ms; } }
`;

function ToneGlyph({ tone }: { tone: NoticeTone }) {
  const path = tone === "deny"
    ? "M5 5l6 6M11 5l-6 6"
    : tone === "success"
      ? "M4.5 8.5l2.5 2.5 4.5-5"
      : tone === "warn"
        ? "M8 4.5v4.5M8 11.4v.1"
        : "M8 7.2v4.3M8 4.6v.1";
  return (
    <span
      aria-hidden
      style={{
        flex: "none",
        width: 20,
        height: 20,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: TONE_COLOR[tone],
        color: "var(--jg-surface-deep, #0b1018)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

type Shown = { notice: Notice; leaving: boolean };

/** Keeps removed notices on screen, in place, for the exit animation; new ones join the end. @internal */
export function reconcileShown(previous: readonly Shown[], live: readonly Notice[]): Shown[] {
  const byId = new Map(live.map((notice) => [notice.id, notice]));
  const next: Shown[] = previous.map((entry) => {
    const current = byId.get(entry.notice.id);
    return current === undefined ? { notice: entry.notice, leaving: true } : { notice: current, leaving: false };
  });
  const known = new Set(previous.map((entry) => entry.notice.id));
  for (const notice of live) if (!known.has(notice.id)) next.push({ notice, leaving: false });
  return next;
}

/** Live notices of `feed`, re-rendering on change and pruning each one when it expires. */
export function useNoticeList(feed: NoticeFeed | null): readonly Notice[] {
  const list = useSyncExternalStore(
    feed?.subscribe ?? NO_FEED_SUBSCRIBE,
    feed === null ? () => EMPTY : feed.list,
    feed === null ? () => EMPTY : feed.list,
  );
  const [, setRetry] = useState(0);
  useEffect(() => {
    if (feed === null || list.length === 0) return;
    const soonest = Math.min(...list.map((notice) => notice.expiresAt));
    const timer = setTimeout(() => {
      feed.prune();
      // A feed on a non-wall clock may not have expired yet; poll gently until it does.
      if (feed.list() === list) setRetry((value) => value + 1);
    }, Math.max(16, soonest - Date.now()));
    return () => clearTimeout(timer);
  });
  return list;
}

/**
 * Animated, toned notice stack for a {@link NoticeFeed} — the default renderer the shell mounts for
 * `ctx.game.notices`. Uses `--jg-*` theme vars with fallbacks, 14px text, and never takes pointer input.
 *
 * @capability notice-feed render ctx.game.notices as an animated toned stack (enter/exit motion, ×N stacking)
 */
export function NoticeStack({
  feed,
  placement = "top",
  scale = 1,
  renderNotice,
}: {
  /** Defaults to the surrounding game's `ctx.game.notices`. */
  feed?: NoticeFeed;
  placement?: NoticePlacement;
  /** Multiplies text and spacing (the shell passes the player's UI scale). */
  scale?: number;
  renderNotice?: (notice: Notice) => ReactNode;
}) {
  const ctx = useOptionalGameContext();
  const source = feed ?? ctx?.game.notices ?? null;
  const live = useNoticeList(source);
  const [shown, setShown] = useState<Shown[]>(() => reconcileShown([], live));
  const [seenLive, setSeenLive] = useState(live);
  if (seenLive !== live) {
    setSeenLive(live);
    setShown(reconcileShown(shown, live));
  }
  const anyLeaving = shown.some((entry) => entry.leaving);
  useEffect(() => {
    if (!anyLeaving) return;
    const timer = setTimeout(() => setShown((previous) => previous.filter((entry) => !entry.leaving)), EXIT_MS);
    return () => clearTimeout(timer);
  }, [anyLeaving]);

  if (shown.length === 0) return null;
  return (
    <div
      data-jg-notices={placement}
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 45,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6 * scale,
        width: "min(460px, calc(100% - 32px))",
        pointerEvents: "none",
        ...PLACEMENT_STYLE[placement],
      }}
    >
      <style>{KEYFRAMES}</style>
      {shown.map(({ notice, leaving }) => (
        <div key={notice.id} data-jg-notice={notice.tone} data-leaving={leaving ? "" : undefined} style={{ maxWidth: "100%" }}>
          {renderNotice !== undefined ? renderNotice(notice) : (
            <div
              key={notice.count}
              data-jg-notice-body
              data-bump={notice.count > 1 ? (notice.tone === "deny" ? "deny" : "other") : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10 * scale,
                padding: `${8 * scale}px ${14 * scale}px ${8 * scale}px ${10 * scale}px`,
                borderRadius: 10 * scale,
                background: "var(--jg-surface, rgba(13, 18, 27, 0.9))",
                border: "1px solid var(--jg-edge, rgba(255, 255, 255, 0.12))",
                boxShadow: `inset 3px 0 0 ${TONE_COLOR[notice.tone]}, 0 8px 24px rgba(0, 0, 0, 0.35)`,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                color: "var(--jg-text, #f1f5f9)",
                fontFamily: "var(--jg-font-body, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)",
                fontSize: 14 * scale,
                fontWeight: 600,
                lineHeight: 1.3,
                letterSpacing: "0.01em",
                textShadow: "0 1px 1px rgba(0, 0, 0, 0.35)",
              }}
            >
              <ToneGlyph tone={notice.tone} />
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{TONE_LABEL[notice.tone]}: </span>
              <span>{notice.text}</span>
              {notice.count > 1 ? (
                <span
                  style={{
                    flex: "none",
                    fontSize: 12 * scale,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    padding: `${1 * scale}px ${6 * scale}px`,
                    borderRadius: 999,
                    background: "rgba(255, 255, 255, 0.12)",
                    color: "var(--jg-text-dim, rgba(241, 245, 249, 0.8))",
                  }}
                >
                  ×{notice.count}
                </span>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
