import { useEffect, useState, type ReactNode } from "react";

import { useAccessibilitySettings } from "@jgengine/react/accessibilitySettings";

import type { CaptionFeed } from "./captions";

const PRUNE_MS = 250;

/**
 * The captions line: a bounded, bottom-centred stack that renders only while the accessibility
 * captions setting is on. Reads HudTheme tokens, so a game's theme reskins it, and lives in the same
 * overlay layer as the notice stack.
 *
 * @capability caption-overlay render the caption feed as a themed, screen-reader-announced line stack gated by the captions accessibility setting
 */
export function CaptionOverlay({
  feed,
  max = 2,
  zIndex = 84,
}: {
  feed: CaptionFeed;
  /** How many lines to show at once. Default 2. */
  max?: number;
  zIndex?: number;
}): ReactNode {
  const accessibility = useAccessibilitySettings();
  const [changed, setChanged] = useState(0);
  const lines = accessibility.captions ? feed.list().slice(-max) : [];

  useEffect(() => feed.subscribe(() => setChanged((current) => current + 1)), [feed]);

  useEffect(() => {
    if (lines.length === 0) return;
    const timer = setInterval(() => feed.prune(), PRUNE_MS);
    return () => clearInterval(timer);
  }, [feed, lines.length, changed]);

  if (!accessibility.captions || lines.length === 0) return null;
  return (
    <div
      data-jg-captions=""
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "absolute",
        left: "50%",
        bottom: "clamp(64px, 12vh, 132px)",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        maxWidth: "min(720px, 82vw)",
        pointerEvents: "none",
        zIndex,
      }}
    >
      {lines.map((line) => (
        <div
          key={line.id}
          data-jg-caption={line.kind}
          style={{
            background: "var(--jg-frame-bg, rgba(8, 11, 16, 0.82))",
            border: "var(--jg-frame-border, 1px solid rgba(255, 255, 255, 0.12))",
            borderRadius: "var(--jg-frame-radius, 10px)",
            color: "var(--jg-text, #f8fafc)",
            fontFamily: "var(--jg-font-body, ui-sans-serif, system-ui, sans-serif)",
            fontSize: "clamp(0.95rem, 1.5vw, 1.15rem)",
            fontWeight: 600,
            letterSpacing: "0.01em",
            padding: "6px 12px",
            textAlign: "center",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
          }}
        >
          {line.text}
          {line.count > 1 ? <span style={{ opacity: 0.7 }}> x{line.count}</span> : null}
        </div>
      ))}
    </div>
  );
}
