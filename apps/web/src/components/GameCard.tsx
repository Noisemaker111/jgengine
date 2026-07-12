import type { Game } from "../content/games";
import { PreviewFrame } from "./PreviewFrame";

export function GameFace({ game, className = "" }: { game: Game; className?: string }) {
  return (
    <div className={`relative h-full w-full ${className}`}>
      <PreviewFrame game={game} />
    </div>
  );
}

export function GameCard({ game }: { game: Game }) {
  return (
    <a
      href={game.href}
      className="card-hover shine panel group relative flex flex-col overflow-hidden rounded-2xl"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px opacity-60 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(to right, transparent, ${game.hue}80, transparent)` }}
      />
      <div
        className="scanlines relative aspect-video overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 80% 90% at 50% 115%, ${game.hue}38, transparent 70%), linear-gradient(to bottom, #0a0f1c, #04060c)`,
        }}
      >
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.05]">
          <GameFace game={game} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <h3
          className="absolute bottom-3 left-3 max-w-[calc(100%-3.75rem)] truncate rounded-md bg-black/45 px-2 py-0.5 text-[0.95rem] font-semibold tracking-tight text-slate-100 backdrop-blur-sm transition group-hover:text-white"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.75)" }}
        >
          {game.title}
        </h3>
        <span
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          style={{
            color: "#04060c",
            backgroundColor: game.hue,
            borderColor: `${game.hue}60`,
            boxShadow: `0 0 24px -4px ${game.hue}`,
          }}
          aria-hidden
        >
          <svg viewBox="0 0 12 12" className="ml-0.5 h-3 w-3" fill="currentColor">
            <path d="M3 2.2v7.6L10 6 3 2.2Z" />
          </svg>
        </span>
      </div>
      <div className="border-t border-white/[0.05] px-4 py-2.5">
        <p className="line-clamp-2 text-[0.8rem] leading-snug text-slate-300">{game.tagline}</p>
      </div>
    </a>
  );
}
