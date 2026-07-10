import type { Game } from "../content/games";
import { GameArt } from "./GameArt";
import { SceneThumbnail } from "./SceneThumbnail";

function FacePlaceholder({ game }: { game: Game }) {
  if (game.shot !== undefined) {
    return (
      <img
        src={game.shot}
        alt={`${game.title} gameplay`}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  return (
    <>
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `linear-gradient(to right, ${game.hue}14 1px, transparent 1px), linear-gradient(to bottom, ${game.hue}14 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 90% 100% at 50% 100%, black 30%, transparent 80%)",
        }}
      />
      <div className="absolute inset-0 p-6">
        <GameArt id={game.id} hue={game.hue} />
      </div>
    </>
  );
}

export function GameFace({ game, className = "" }: { game: Game; className?: string }) {
  return (
    <SceneThumbnail id={game.id} className={className}>
      <FacePlaceholder game={game} />
    </SceneThumbnail>
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
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
        <span
          className="absolute left-4 top-4 rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider backdrop-blur-sm"
          style={{ color: game.hue, borderColor: `${game.hue}45`, backgroundColor: `${game.hue}16` }}
        >
          {game.genre}
        </span>
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
      <div className="flex flex-1 flex-col border-t border-white/[0.05] p-5">
        <h3 className="font-semibold tracking-tight text-slate-100 transition group-hover:text-white">
          {game.title}
        </h3>
        <p className="mt-1 text-sm font-medium text-slate-300">{game.tagline}</p>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{game.description}</p>
        <p className="mt-3.5 flex items-center gap-2 font-mono text-[0.7rem] text-slate-600">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <rect x="1.5" y="4.5" width="13" height="7.5" rx="2.5" />
            <path d="M5 7.2v2.6M3.7 8.5h2.6M10.4 9.6h.01M12.2 7.6h.01" strokeLinecap="round" />
          </svg>
          {game.controls}
        </p>
      </div>
    </a>
  );
}
