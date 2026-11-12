/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";

import { GAME_IDS, gameBlurb, gameCover, gameTitle } from "../../lib/games";

/** A game picker over one live viewport: the cover until the visitor presses play, then the real game. */
export function PressStart() {
  const games = GAME_IDS.filter((id) => gameCover(id) !== null);
  const [selected, setSelected] = useState(games[0] ?? "");
  const [playing, setPlaying] = useState(false);
  if (games.length === 0) return null;
  const pick = (id: string) => {
    setSelected(id);
    setPlaying(false);
  };
  return (
    <section id="play" className="press" data-theme="dark" aria-labelledby="play-heading">
      <div className="press-inner">
        <header className="press-head">
          <p className="eyebrow">Press start</p>
          <h2 id="play-heading" className="story-h2">
            Real games. Running on this page.
          </h2>
          <p className="band-lede">
            These aren't demos made for a homepage. They're the games the engine is built and tested against, and they live in
            its repo. Pick one and press play: the engine loads in the frame below, with three.js drawing the world and Rune
            drawing the UI.
          </p>
        </header>
        <div className="press-stage">
          <div className="press-screen gizmo">
            {playing ? (
              <iframe
                key={selected}
                src={`/play/?game=${selected}`}
                title={`${gameTitle(selected)}, playable`}
                allow="fullscreen; xr-spatial-tracking; gamepad"
              />
            ) : (
              <button type="button" className="press-cover" onClick={() => setPlaying(true)} aria-label={`Play ${gameTitle(selected)} here`}>
                <img src={gameCover(selected)!} alt="" width={800} height={450} decoding="async" />
                <span className="press-play">
                  <span className="press-play-icon" aria-hidden>
                    ▶
                  </span>
                  Play {gameTitle(selected)}
                </span>
                <span className="press-note">Click inside the game for keyboard and mouse. Sound starts on your first click.</span>
              </button>
            )}
            <div className="press-hud" aria-hidden>
              <span>{playing ? "● live" : "○ ready"}</span>
              <span>/play/?game={selected}</span>
            </div>
          </div>
          <ol className="carts" aria-label="Games">
            {games.map((id, i) => (
              <li key={id}>
                <button type="button" className="cart" aria-pressed={id === selected} onClick={() => pick(id)}>
                  <img src={gameCover(id)!} alt="" width={160} height={90} loading="lazy" decoding="async" />
                  <span className="cart-text">
                    <span className="cart-num">{String(i + 1).padStart(2, "0")}</span>
                    <span className="cart-title">{gameTitle(id)}</span>
                    <span className="cart-blurb">{gameBlurb(id) ?? ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <p className="press-foot">
          <a href={`/games/${selected}`} className="link">
            Open {gameTitle(selected)} full page
          </a>
          <span aria-hidden> · </span>
          <a href="/games" className="link">
            All {GAME_IDS.length} games
          </a>
          <span aria-hidden> · </span>
          <a href={`https://github.com/Noisemaker111/jgengine/tree/beta/games/${selected}`} className="link">
            Its source
          </a>
        </p>
      </div>
    </section>
  );
}
