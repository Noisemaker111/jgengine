import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import type { PhotoModeState, PhotoModeStore } from "@jgengine/core/ui/photoMode";

/** Subscribe to a photo-mode store's live state. */
export function usePhotoMode(store: PhotoModeStore): PhotoModeState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Props for {@link PhotoModeControls}. */
export interface PhotoModeControlsProps {
  store: PhotoModeStore;
  /** Take the shot — wire to shell `captureCanvas` + `downloadImage`. */
  onCapture?: () => void;
  className?: string;
  style?: CSSProperties;
}

const BTN: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.4)",
  background: "rgba(17,22,30,0.85)",
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 12px",
  cursor: "pointer",
};

/**
 * Photo-mode toolbar — a hide/show-HUD toggle, a capture button, and an exit
 * button, bound to a `createPhotoModeStore`. Presentation-only: the game wires
 * `onCapture` to shell `captureCanvas`/`downloadImage` and reads `hideHud` to
 * drop its gameplay HUD.
 *
 * @capability photo-mode-controls photo-mode toolbar (hide-HUD toggle, capture, exit) bound to a photo-mode store
 */
export function PhotoModeControls({ store, onCapture, className, style }: PhotoModeControlsProps): ReactNode {
  const state = usePhotoMode(store);
  return (
    <div
      className={className}
      data-photo-mode-controls
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: 8,
        borderRadius: 12,
        background: "rgba(6,9,14,0.86)",
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.3))",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        ...style,
      }}
    >
      <span style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(203,213,225,0.75)", padding: "0 4px" }}>
        📷 Photo
      </span>
      <button
        type="button"
        data-photo-hide-hud
        aria-pressed={state.hideHud}
        onClick={() => store.setHideHud(!state.hideHud)}
        style={{ ...BTN, ...(state.hideHud ? { borderColor: "rgba(56,189,248,0.6)", color: "#bae6fd" } : {}) }}
      >
        {state.hideHud ? "HUD hidden" : "HUD shown"}
      </button>
      {onCapture !== undefined ? (
        <button type="button" data-photo-capture onClick={onCapture} style={{ ...BTN, borderColor: "rgba(74,222,128,0.6)", color: "#bbf7d0" }}>
          Capture
        </button>
      ) : null}
      <button type="button" data-photo-exit onClick={() => store.exit()} style={BTN}>
        Exit
      </button>
    </div>
  );
}
