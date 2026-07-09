import type { Game } from "../content/games";
import { GameArt } from "./GameArt";

export function GameFace({ game, className = "" }: { game: Game; className?: string }) {
  if (game.shot !== undefined) {
    return (
      <img
        src={game.shot}
        alt={`${game.title} gameplay`}
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`h-full w-full p-6 ${className}`}>
      <GameArt id={game.id} hue={game.hue} />
    </div>
  );
}

export function GameCard({ game }: { game: Game }) {
  return (
    <a
      href={game.href}
      className="card-hover group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:border-white/20"
    >
      <div
        className="relative aspect-video overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 80% 90% at 50% 110%, ${game.hue}2e, transparent 70%), linear-gradient(to bottom, #0a0e18, #060910)`,
        }}
      >
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]">
          <GameFace game={game} />
        </div>
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
        <span
          className="absolute left-4 top-4 rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider backdrop-blur-sm"
          style={{ color: game.hue, borderColor: `${game.hue}40`, backgroundColor: `${game.hue}14` }}
        >
          {game.genre}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold tracking-tight text-slate-100">{game.title}</h3>
          <span
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold opacity-0 transition group-hover:opacity-100"
            style={{ color: game.hue, backgroundColor: `${game.hue}1a` }}
          >
            Play
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
              <path d="M3 2.2v7.6L10 6 3 2.2Z" />
            </svg>
          </span>
        </div>
        <p className="mt-1 text-sm font-medium text-slate-300">{game.tagline}</p>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{game.description}</p>
        <p className="mt-3 font-mono text-[0.7rem] text-slate-600">{game.controls}</p>
      </div>
    </a>
  );
}
