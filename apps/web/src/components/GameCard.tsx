import { Link } from "@tanstack/react-router";

import { gameBlurb, gameCover, gameTitle } from "../lib/games";

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
        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
      />
    );
  }
  return (
    <div className="bg-dots relative grid h-full w-full place-items-center bg-sunken">
      <span className="font-display text-5xl font-extrabold tracking-[-0.04em] text-fg/15 sm:text-6xl" aria-hidden>
        {gameTitle(id)}
      </span>
    </div>
  );
}

/** A probe game tile: cover screenshot, README title and description, link to play. */
export function GameCard({ id, size = "md", eager = false }: { id: string; size?: "lg" | "md" | "sm"; eager?: boolean }) {
  const blurb = gameBlurb(id);
  return (
    <Link
      to="/games/$id"
      params={{ id }}
      className="card card-link group flex h-full flex-col overflow-hidden"
    >
      <div className={`relative overflow-hidden border-b border-line ${size === "lg" ? "aspect-[16/10]" : "aspect-video"}`}>
        <Cover id={id} eager={eager} />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#b9f23f]" aria-hidden />
          Playable
        </span>
      </div>
      <div className={`flex flex-1 items-end justify-between gap-4 ${size === "sm" ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="min-w-0">
          <h3
            className={`font-display font-bold tracking-tight text-fg ${size === "lg" ? "text-2xl" : size === "sm" ? "text-base sm:text-lg" : "text-lg"}`}
          >
            {gameTitle(id)}
          </h3>
          {blurb !== null && <p className={`mt-1 text-muted ${size === "sm" ? "text-xs sm:text-sm" : "text-sm"}`}>{blurb}</p>}
        </div>
        <span
          className={`${size === "sm" ? "hidden sm:grid" : "grid"} h-9 w-9 shrink-0 place-items-center rounded-full border border-line-strong text-fg transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-on-accent`}
          aria-hidden
        >
          <svg viewBox="0 0 16 16" className="ml-0.5 h-3.5 w-3.5" fill="currentColor">
            <path d="M4 2.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 0 0 0-1.2l-8-5.2C4.7 1.8 4 2.2 4 2.8Z" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
