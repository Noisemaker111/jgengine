import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { suspendPlayControls } from "@jgengine/core/game/controlGate";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { sceneCaptureFor, type SceneCapture } from "./render/sceneCaptureRuntime";

/** Own the current photo control lease and pending read until close or detach. @internal */
export function attachPhotoControls(ctx: GameContext, photograph: SceneCapture, focus: { eligible(): boolean; restore(): void }): () => void {
  const release = suspendPlayControls(ctx);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    photograph.cancel();
    release();
    if (!photograph.photoMode.get().active && focus.eligible()) focus.restore();
  };
}

/**
 * Default photograph controls for the current rendered game.
 * @capability photo-controls open photo mode, save a rendered PNG and return focus to gameplay
 */
export function PhotoControls({ ctx, playSurface }: { ctx: GameContext; playSurface: RefObject<HTMLElement | null> }) {
  const photograph = sceneCaptureFor(ctx);
  const state = useSyncExternalStore(photograph.subscribe, photograph.get, photograph.get);
  const photo = useSyncExternalStore(photograph.photoMode.subscribe, photograph.photoMode.get, photograph.photoMode.get);
  const panel = useRef<HTMLDivElement>(null);
  const enterButton = useRef<HTMLButtonElement>(null);
  const owner = useRef(ctx);
  owner.current = ctx;
  useLayoutEffect(() => {
    if (!photo.active) return;
    const surface = playSurface.current;
    const detach = attachPhotoControls(ctx, photograph, {
      eligible: () => owner.current === ctx && playSurface.current === surface && !!surface?.isConnected && (document.activeElement === document.body || !!panel.current?.contains(document.activeElement) || document.activeElement === enterButton.current),
      restore: () => surface?.focus({ preventScroll: true }),
    });
    panel.current?.querySelector<HTMLButtonElement>("[data-photo-capture]")?.focus();
    // Only an explicit close restores focus. An old context/unmount cannot focus a replacement game.
    return detach;
  }, [ctx, photograph, photo.active, playSurface]);
  useLayoutEffect(() => () => { photograph.cancel(); photograph.photoMode.exit(); }, [photograph]);
  const buttonStyle = { border: "1px solid #718f9d", borderRadius: 8, padding: "9px 14px", background: "#17303d", color: "#f1f5f9", cursor: "pointer" };
  return <><div ref={panel} data-shell-photo-controls style={{ position: "absolute", top: 16, right: 16, zIndex: 35, pointerEvents: "auto", fontFamily: "system-ui", color: "#f1f5f9" }}
    onKeyDown={(event) => { if (photo.active) { event.stopPropagation(); if (event.key === "Escape") photograph.photoMode.exit(); } }}>
    {photo.active ? <section role="dialog" aria-label="Photograph game" style={{ maxWidth: 300, padding: 16, borderRadius: 12, background: "#0d1d2eed", border: "1px solid #718f9d" }}>
      <strong>Photograph game</strong><p style={{ fontSize: 13 }}>Save the rendered world as a PNG. The shared world keeps running.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button data-photo-capture type="button" style={buttonStyle} disabled={!state.ready || state.capturing} onClick={() => { void photograph.capture({ filename: "game-photo.png", overlay: panel.current }); }}>Save photo</button>
        <button type="button" style={buttonStyle} onClick={() => photograph.photoMode.exit()}>{state.capturing ? "Cancel photo" : "Back to game"}</button>
      </div>
      {!state.ready ? <p role="status">Waiting for the game view.</p> : null}
      {state.capturing ? <p role="status">Capturing the next rendered frame…</p> : null}
      {state.error !== null ? <p role="alert">{state.error}</p> : null}
    </section> : <button ref={enterButton} type="button" style={buttonStyle} disabled={!state.ready} onClick={() => photograph.photoMode.enter()}>Photo</button>}
  </div>{state.capturing ? <button type="button" style={{ ...buttonStyle, position: "absolute", top: 16, right: 16, zIndex: 36, pointerEvents: "auto" }} onClick={() => photograph.cancel()}>Cancel photo</button> : null}</>;
}
