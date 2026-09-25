import { useDeferredValue, useMemo, useState } from "react";

import { CAPABILITIES, SKILL_DOMAINS, domainLabel } from "../lib/capabilities";
import { CopyButton } from "./Copy";
import { InlineCode } from "./InlineCode";

const PAGE = 40;
const REPO_SKILLS = "https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills";

/** Search and filter every intent row from the skills' generated capability indexes. */
export function CapabilityBrowser() {
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);

  const counts = useMemo(() => {
    const byskill = new Map<string, number>();
    for (const row of CAPABILITIES) byskill.set(row.skill, (byskill.get(row.skill) ?? 0) + 1);
    return byskill;
  }, []);

  const matches = useMemo(() => {
    const terms = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return CAPABILITIES.filter((row) => {
      if (skill !== null && row.skill !== skill) return false;
      if (terms.length === 0) return true;
      const hay = `${row.key} ${row.summary} ${row.exports.map((e) => e.symbol).join(" ")}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [deferredQuery, skill]);

  const shown = matches.slice(0, limit);

  return (
    <div>
      <div className="flex flex-col gap-4">
        <label className="relative block">
          <span className="sr-only">Search capabilities</span>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search: minimap, loot, vehicle, dialogue, inventory…"
            className="h-12 w-full rounded-xl border border-line-strong bg-raised pl-11 pr-4 text-base text-fg placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by skill">
          <FilterChip active={skill === null} onClick={() => setSkill(null)} label="All" count={CAPABILITIES.length} />
          {SKILL_DOMAINS.filter((domain) => counts.has(domain.id)).map((domain) => (
            <FilterChip
              key={domain.id}
              active={skill === domain.id}
              onClick={() => {
                setSkill(domain.id);
                setLimit(PAGE);
              }}
              label={domain.label}
              count={counts.get(domain.id) ?? 0}
            />
          ))}
        </div>
      </div>

      <p className="mt-6 font-mono text-xs text-faint" aria-live="polite">
        {matches.length} {matches.length === 1 ? "match" : "matches"}
        {skill !== null && (
          <>
            {" "}
            in{" "}
            <a href={`${REPO_SKILLS}/${skill}/capabilities.md`} className="link">
              {skill}/capabilities.md
            </a>
          </>
        )}
      </p>

      <ul className="mt-3 grid gap-2">
        {shown.map((row) => {
          const first = row.exports[0]!;
          return (
            <li
              key={`${row.skill}/${row.key}`}
              className="grid gap-3 rounded-xl border border-line bg-raised p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-6"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[13px] font-semibold text-fg">{row.key}</span>
                  <span className="chip !py-0 !text-[10px] uppercase tracking-[0.08em]">{domainLabel(row.skill)}</span>
                </p>
                <p className="mt-1 text-sm leading-snug text-muted">
                  <InlineCode text={row.summary} />
                </p>
              </div>
              <div className="code-surface flex min-w-0 items-center gap-2 rounded-lg border border-line py-1.5 pl-3 pr-1.5">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px]">
                  <span className="tok-keyword">import</span> {`{ ${first.symbol} } `}
                  <span className="tok-keyword">from</span>{" "}
                  <span className="tok-string">{first.importLine.slice(first.importLine.indexOf('"'))}</span>
                </code>
                <CopyButton value={first.importLine} label="" ariaLabel={`Copy import for ${first.symbol}`} variant="ghost" className="!px-2" />
              </div>
            </li>
          );
        })}
      </ul>

      {matches.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">
          Nothing matches. If a game needs it and no primitive exists, that's a gap worth an issue.
        </p>
      )}
      {matches.length > shown.length && (
        <div className="mt-5 flex justify-center">
          <button type="button" className="btn btn-secondary" onClick={() => setLimit(matches.length)}>
            Show all {matches.length}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "border-fg bg-fg text-bg" : "border-line text-muted hover:border-line-strong hover:text-fg"
      }`}
    >
      {label}
      <span className={`font-mono text-[11px] ${active ? "text-bg/70" : "text-faint"}`}>{count}</span>
    </button>
  );
}
