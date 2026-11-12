/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useRef, useState } from "@jgengine/core/ui/jsx";

import { GAME_IDS, gameBlurb, gameCover, gameTitle } from "../../lib/games";

/**
 * The viewport a framed game lays out for. Its title menu is built for a desktop window: at 1024x640
 * Drift Foundry and Harbor Heat clip theirs, and in the frame's own ~720x450 or a phone's 360x225 most
 * menus showed a logo and nothing to press. The game gets this size and the frame scales the picture.
 */
const GAME_VIEW = { width: 1280, height: 800 };

/** Phones and touch tablets play over the whole screen, in their own touch layout, not a scaled desktop. */
const FULL_SCREEN_QUERY = "(max-width: 639px), (pointer: coarse)";

/** A game picker over one live viewport: the cover until the visitor presses play, then the real game. */
export function PressStart() {
  const games = GAME_IDS.filter((id) => gameCover(id) !== null);
  const [selected, setSelected] = useState(games[0] ?? "");
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState(0);
  const screen = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = screen.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setScale(node.clientWidth / GAME_VIEW.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.activeElement?.tagName !== "IFRAME") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  if (games.length === 0) return null;
  const pick = (id: string) => {
    setSelected(id);
    setPlaying(false);
    setExpanded(false);
  };
  const play = () => {
    setPlaying(true);
    setExpanded(typeof matchMedia === "function" && matchMedia(FULL_SCREEN_QUERY).matches);
  };
  const framed = playing && !expanded;
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
          <div ref={screen} className={expanded ? "press-screen gizmo is-expanded" : "press-screen gizmo"}>
            {playing ? (
              <iframe
                key={selected}
                src={`/play/?game=${selected}`}
                title={`${gameTitle(selected)}, playable`}
                allow="fullscreen; xr-spatial-tracking; gamepad"
                style={
                  framed
                    ? { width: `${GAME_VIEW.width}px`, height: `${GAME_VIEW.height}px`, transform: `scale(${scale})`, transformOrigin: "0 0" }
                    : undefined
                }
              />
            ) : (
              <button type="button" className="press-cover" onClick={play} aria-label={`Play ${gameTitle(selected)} here`}>
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
            {playing ? (
              <button type="button" className="press-size" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Close" : "Full screen"}
              </button>
            ) : null}
            {expanded ? null : (
              <div className="press-hud" aria-hidden>
                <span>{playing ? "● live" : "○ ready"}</span>
                <span>/play/?game={selected}</span>
              </div>
            )}
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
