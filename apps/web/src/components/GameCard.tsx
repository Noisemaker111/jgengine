import { Link } from "@tanstack/react-router";

import { gameBlurb, gameCover, gameSeed, gameTitle } from "../lib/games";

function Cover({ id, eager }: { id: string; eager: boolean }) {
  const cover = gameCover(id);
  if (cover !== null) {
    return (
      <img
        src={cover}
        alt=""
        width={800}
        height={450}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
    );
  }
  return (
    <div className="bg-grid relative grid h-full w-full place-items-center bg-sunken">
      <span className="font-display text-3xl font-extrabold text-fg/20" aria-hidden>
        {gameTitle(id)}
      </span>
    </div>
  );
}

/** A game tile: cover capture, README title and genre, the idea it started from, link to play. */
export function GameCard({ id, eager = false, seed = true }: { id: string; eager?: boolean; seed?: boolean }) {
  const blurb = gameBlurb(id);
  const idea = seed ? gameSeed(id) : null;
  return (
    <Link to="/games/$id" params={{ id }} className="card card-link group flex h-full flex-col overflow-hidden">
      <div className="relative aspect-video overflow-hidden border-b border-line bg-sunken">
        <Cover id={id} eager={eager} />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Play ▸
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5 sm:p-4">
        <h3 className="font-display text-base font-bold leading-tight text-fg sm:text-lg">{gameTitle(id)}</h3>
        {blurb !== null && <p className="text-[13px] leading-snug text-muted sm:text-sm">{blurb}</p>}
        {idea !== null && (
          <p className="mt-auto pt-2 font-mono text-[11px] leading-snug text-faint">
            <span className="text-accent-text">started as</span> “{idea}”
          </p>
        )}
      </div>
    </Link>
  );
}
