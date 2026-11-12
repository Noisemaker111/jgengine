/** @jsxImportSource @jgengine/core/ui/jsx */
import { GAME_IDS, gameCover, gameTitle } from "../../lib/games";

/**
 * The homepage's pick of the games, chosen by their cover captures: the frames that read best at
 * card size. Every game stays on /games; this list only decides which ones the homepage leads with.
 */
const FEATURED: readonly { id: string; genre: string; pitch: string }[] = [
  { id: "fernwild", genre: "Survival", pitch: "Tame dinosaurs and survive the wild." },
  { id: "drift-foundry", genre: "Racing", pitch: "Race a welded buggy ahead of a compactor." },
  { id: "harbor-heat", genre: "Open city", pitch: "Run deliveries through a coastal city." },
  { id: "scrap-signal", genre: "Looter-shooter", pitch: "Loot guns across six wasteland zones." },
  { id: "deepward", genre: "Extraction", pitch: "Salvage a ruin and get the haul home." },
  { id: "brightway-park", genre: "Tycoon", pitch: "Run a theme park full of hungry guests." },
];

export function Showcase() {
  const games = FEATURED.filter((game) => GAME_IDS.includes(game.id) && gameCover(game.id) !== null);
  return (
    <section id="games" className="band lp-games" aria-labelledby="games-heading">
      <div className="band-inner">
        <header className="lp-head">
          <p className="eyebrow">Made with jgengine</p>
          <h2 id="games-heading" className="story-h2">
            Real games. Play them right here.
          </h2>
          <p className="band-lede">
            Racing, survival, shooters, tycoons. Each one is built on the engine, lives in its repo, and runs in your browser, with
            nothing to install.
          </p>
        </header>
        <ul className="lp-game-grid">
          {games.map((game) => (
            <li key={game.id}>
              <a href={`/games/${game.id}`} className="lp-game card card-link">
                <span className="lp-game-shot">
                  <img src={gameCover(game.id)!} alt="" width={800} height={450} loading="lazy" decoding="async" />
                  <span className="lp-game-play" aria-hidden>
                    ▶ Play
                  </span>
                </span>
                <span className="lp-game-text">
                  <span className="lp-game-genre">{game.genre}</span>
                  <span className="lp-game-title">{gameTitle(game.id)}</span>
                  <span className="lp-game-pitch">{game.pitch}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="lp-more">
          <a href="/games" className="btn btn-secondary">
            See all {GAME_IDS.length} games <span className="arrow" aria-hidden>→</span>
          </a>
        </p>
      </div>
    </section>
  );
}
