import type { Game } from "../content/games";

export function PreviewFrame({ game, className = "" }: { game: Game; className?: string }) {
  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#04060c] ${className}`}>
      <img
        src={`/game-shots/${game.id}.png`}
        alt={game.title}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
