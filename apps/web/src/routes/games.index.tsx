import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { GameCard } from "../components/GameCard";
import { Page, PageHero } from "../components/Layout";
import { GAME_CATEGORIES, GAMES, GAMES_BY_CATEGORY, type Game, type GameCategory } from "../content/games";
import { REPO_URL } from "../lib/site";

export const Route = createFileRoute("/games/")({
  head: () => ({
    meta: [
      { title: "Games — JGengine" },
      {
        name: "description",
        content: "Games built by AI agents on the JGengine SDK — playable in the browser.",
      },
    ],
  }),
  component: GamesPage,
});

type Filter = GameCategory | "All";

function matches(game: Game, query: string): boolean {
  const haystack = `${game.title} ${game.tagline} ${game.description} ${game.genre} ${game.controls}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .every((term) => haystack.includes(term));
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}

function GamesFilter({
  query,
  setQuery,
  active,
  setActive,
  counts,
}: {
  query: string;
  setQuery: (value: string) => void;
  active: Filter;
  setActive: (value: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const chips: Filter[] = ["All", ...GAME_CATEGORIES];
  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-md">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search games…"
          aria-label="Search games"
          className="panel w-full rounded-xl py-2.5 pl-10 pr-9 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-emerald-400/40 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const isActive = chip === active;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setActive(chip)}
              aria-pressed={isActive}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                isActive
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200"
              }`}
            >
              {chip}
              <span className={`ml-1.5 font-mono text-[0.65rem] ${isActive ? "text-emerald-400/70" : "text-slate-600"}`}>
                {counts[chip]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GamesPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Filter>("All");

  const counts = useMemo(() => {
    const byQuery = query.length > 0 ? GAMES.filter((game) => matches(game, query)) : GAMES;
    const result = { All: byQuery.length } as Record<Filter, number>;
    for (const category of GAME_CATEGORIES) {
      result[category] = byQuery.filter((game) => game.category === category).length;
    }
    return result;
  }, [query]);

  const filtered = useMemo(
    () => GAMES.filter((game) => (active === "All" || game.category === active) && matches(game, query)),
    [query, active],
  );

  const isDefault = query.length === 0 && active === "All";

  return (
    <Page>
      <PageHero
        eyebrow="The arcade"
        title="Games"
        blurb={`Every game here was built by an AI agent from the JGengine skills — ${GAMES.length} games, a different genre each time, on the same SDK. Click one and it runs in your browser, no install.`}
      />
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="mt-8">
          <GamesFilter query={query} setQuery={setQuery} active={active} setActive={setActive} counts={counts} />
        </div>

        {isDefault ? (
          GAMES_BY_CATEGORY.map(({ category, games }) => (
            <div key={category} className="mt-12 first:mt-10">
              <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-slate-100">{category}</h2>
                <span className="font-mono text-xs text-slate-600">
                  {games.length} {games.length === 1 ? "game" : "games"}
                </span>
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {games.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            </div>
          ))
        ) : filtered.length > 0 ? (
          <div className="mt-10">
            <p className="font-mono text-xs text-slate-600">
              {filtered.length} {filtered.length === 1 ? "game" : "games"}
              {active !== "All" && <span className="text-slate-500"> · {active}</span>}
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        ) : (
          <div className="panel mt-10 rounded-2xl px-6 py-14 text-center">
            <p className="text-sm text-slate-300">No games match your search.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActive("All");
              }}
              className="mt-3 text-xs font-medium text-emerald-300 underline decoration-emerald-300/40 underline-offset-2 transition hover:decoration-emerald-300"
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="panel panel-top-glow mt-14 rounded-2xl p-6 sm:p-8">
          <h2 className="font-semibold tracking-tight text-slate-100">How a game gets on this page</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            An agent with the skills installed builds it under{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-300">Games/</code>{" "}
            in{" "}
            <a href={REPO_URL} className="text-emerald-300 underline decoration-emerald-300/40 underline-offset-2 transition hover:decoration-emerald-300">
              the repo
            </a>
            . On the next deploy it appears here and becomes playable at{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-300">
              /games/&lt;id&gt;
            </code>{" "}
            — no registry, no wiring.
          </p>
        </div>
      </section>
    </Page>
  );
}
