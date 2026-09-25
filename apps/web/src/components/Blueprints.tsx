import { Link } from "@tanstack/react-router";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { BLUEPRINTS } from "../lib/blueprints";
import { capability, domainLabel } from "../lib/capabilities";
import { gameTitle, isGameId } from "../lib/games";
import { InlineCode } from "./InlineCode";
import { CodeBlock } from "./marketing";

/** Tabbed "big game → the primitives an agent would reach for" examples, from real capability rows. */
export function Blueprints() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const blueprint = BLUEPRINTS[active]!;
  const rows = blueprint.blocks.flatMap((ref) => {
    const row = capability(ref);
    return row === undefined ? [] : [row];
  });
  const imports = rows.map((row) => row.exports[0]!.importLine).join("\n");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (active + delta + BLUEPRINTS.length) % BLUEPRINTS.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Example games"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-bg p-1 sm:inline-grid"
      >
        {BLUEPRINTS.map((item, i) => (
          <button
            key={item.scale}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors sm:px-4 ${
              i === active ? "bg-fg text-bg" : "text-muted hover:text-fg"
            }`}
          >
            {item.scale.replace(/-scale$/, "")}
            <span className="hidden sm:inline">-scale</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="min-w-0">
          <p className="card px-4 py-3.5 font-mono text-[13px] leading-relaxed text-muted sm:text-sm">
            <span className="text-accent-text" aria-hidden>
              ›{" "}
            </span>
            Make a game that <span className="text-fg">{blueprint.prompt}</span> with jgengine
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={`${row.skill}/${row.key}`} className="rounded-xl border border-line bg-bg p-3.5">
                <p className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[12px] font-semibold text-fg">{row.key}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                    {domainLabel(row.skill)}
                  </span>
                </p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">
                  <InlineCode text={row.summary} />
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock code={imports} filename="what the agent imports" />
          {isGameId(blueprint.gameId) && (
            <Link
              to="/games/$id"
              params={{ id: blueprint.gameId }}
              className="card card-link flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <span className="text-sm text-muted">
                Closest probe game: <span className="font-semibold text-fg">{gameTitle(blueprint.gameId)}</span>
              </span>
              <span className="text-sm font-semibold text-accent-text">
                Play <span aria-hidden>→</span>
              </span>
            </Link>
          )}
          <Link to="/capabilities" className="link self-start text-sm">
            Browse every capability
          </Link>
        </div>
      </div>
    </div>
  );
}
