import { useDeferredValue, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { GameCard } from "../components/GameCard";
import { Page, PageHero } from "../components/Layout";
import { GAME_CATEGORIES, GAMES, GAMES_BY_CATEGORY, type Game, type GameCategory } from "../content/games";
import { seo } from "../lib/seo";
import { REPO_URL } from "../lib/site";

export const Route = createFileRoute("/games/")({
  head: () =>
    seo({
      title: "Games — JGengine",
      description: "Games built by AI agents on the JGengine SDK — playable in the browser.",
      path: "/games",
    }),
  component: GamesPage,
});

type Filter = GameCategory | "All";

type SearchableGame = {
  game: Game;
  haystack: string;
};

const SEARCHABLE_GAMES: SearchableGame[] = GAMES.map((game) => ({
  game,
  haystack: `${game.title} ${game.tagline} ${game.description} ${game.genre} ${game.controls}`.toLowerCase(),
}));

function getSearchTerms(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function matches(haystack: string, terms: string[]): boolean {
  return terms.every((term) => haystack.includes(term));
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
  isSearching,
}: {
  query: string;
  setQuery: (value: string) => void;
  active: Filter;
  setActive: (value: Filter) => void;
  counts: Record<Filter, number>;
  isSearching: boolean;
}) {
  const chips: Filter[] = ["All", ...GAME_CATEGORIES];
  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-md">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search games…"
          aria-label="Search games"
          aria-busy={isSearching}
          autoComplete="off"
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
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
          const isActive = chip === active;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setActive(chip)}
              aria-pressed={isActive}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
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

function GameGrid({ games }: { games: Game[] }) {
  return (
    <div className="grid gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}

function GamesList({ isDefault, filtered, active }: { isDefault: boolean; filtered: Game[]; active: Filter }) {
  if (isDefault) {
    return (
      <div>
        {GAMES_BY_CATEGORY.map(({ category, games }, groupIndex) => (
          <section key={category}>
            <div className={`flex items-baseline gap-3 ${groupIndex === 0 ? "pt-10" : "pt-12"}`}>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">{category}</h2>
              <span className="font-mono text-xs text-slate-600">
                {games.length} {games.length === 1 ? "game" : "games"}
              </span>
            </div>
            <GameGrid games={games} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="pt-10 font-mono text-xs text-slate-600">
        {filtered.length} {filtered.length === 1 ? "game" : "games"}
        {active !== "All" && <span className="text-slate-500"> · {active}</span>}
      </p>
      <GameGrid games={filtered} />
    </div>
  );
}

function GamesPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [active, setActive] = useState<Filter>("All");
  const searchTerms = useMemo(() => getSearchTerms(deferredQuery), [deferredQuery]);
  const isSearching = query !== deferredQuery;

  const queryMatches = useMemo(() => {
    if (searchTerms.length === 0) return GAMES;
    return SEARCHABLE_GAMES.filter(({ haystack }) => matches(haystack, searchTerms)).map(({ game }) => game);
  }, [searchTerms]);

  const counts = useMemo(() => {
    const result = { All: queryMatches.length } as Record<Filter, number>;
    for (const category of GAME_CATEGORIES) result[category] = 0;
    for (const game of queryMatches) result[game.category] += 1;
    return result;
  }, [queryMatches]);

  const filtered = useMemo(
    () => (active === "All" ? queryMatches : queryMatches.filter((game) => game.category === active)),
    [queryMatches, active],
  );

  const isDefault = deferredQuery.length === 0 && active === "All";

  return (
    <Page>
      <PageHero
        eyebrow="The arcade"
        title="Games"
        blurb={`Every game here was built by an AI agent from the JGengine skills — ${GAMES.length} games, a different genre each time, on the same SDK. Click one and it runs in your browser, no install.`}
      />
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="mt-8">
          <GamesFilter
            query={query}
            setQuery={setQuery}
            active={active}
            setActive={setActive}
            counts={counts}
            isSearching={isSearching}
          />
        </div>

        <div aria-live="polite" aria-busy={isSearching}>
          {filtered.length > 0 ? (
            <GamesList isDefault={isDefault} filtered={filtered} active={active} />
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
        </div>

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
