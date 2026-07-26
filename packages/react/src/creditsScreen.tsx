import { type CSSProperties, type ReactNode } from "react";

import type { CreditsDocument, CreditsEntry } from "@jgengine/core/game/credits";

/**
 * Renders a {@link CreditsDocument} as headed sections of credited lines. Skinned entirely through
 * the `--jg-*` HudTheme tokens, so it inherits the game's look from the surrounding theme block;
 * pass `renderEntry` to art-direct the line itself. Links render only when an entry carries `href`,
 * and always open in a new tab with `noreferrer`.
 *
 * This is a building block, not a finished credits screen — the game owns placement, backdrop, the
 * back affordance, and whether it scrolls or rolls.
 *
 * @capability credits-screen drop-in credits view over a CreditsDocument — headed sections, optional links, HudTheme-skinned
 */
export function CreditsScreen({
  document,
  className,
  style,
  renderEntry,
}: {
  document: CreditsDocument;
  className?: string;
  style?: CSSProperties;
  renderEntry?: (entry: CreditsEntry, index: number) => ReactNode;
}): ReactNode {
  return (
    <div
      className={className}
      data-jg="credits-screen"
      style={{ display: "flex", flexDirection: "column", gap: 22, color: "var(--jg-text, #f5f7fa)", ...style }}
    >
      {document.title !== undefined && (
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--jg-font-display, inherit)",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
          }}
        >
          {document.title}
        </h2>
      )}
      {document.sections.map((section) => (
        <section key={section.heading} data-jg="credits-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--jg-font-display, inherit)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "var(--jg-accent, #38bdf8)",
            }}
          >
            {section.heading}
          </h3>
          {section.entries.map((entry, index) => (
            <div key={`${entry.label}-${index}`} data-jg="credits-entry" style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              {renderEntry !== undefined ? (
                renderEntry(entry, index)
              ) : (
                <>
                  {entry.href === undefined ? (
                    <span style={{ fontSize: 14 }}>{entry.label}</span>
                  ) : (
                    <a
                      href={entry.href}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 14, color: "inherit", textDecoration: "underline" }}
                    >
                      {entry.label}
                    </a>
                  )}
                  {entry.detail !== undefined && (
                    <span style={{ fontSize: 12, color: "var(--jg-text-dim, #94a3b8)" }}>{entry.detail}</span>
                  )}
                </>
              )}
            </div>
          ))}
        </section>
      ))}
      {document.notice !== undefined && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--jg-text-dim, #94a3b8)", whiteSpace: "pre-line" }}>
          {document.notice}
        </p>
      )}
    </div>
  );
}
