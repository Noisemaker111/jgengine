import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The layer above the HUD canvas. The canvas shrinks the whole rig to fit a phone, which is right
 * for edge readouts and wrong for the forearm terminal: that is held up to the face at full size.
 * Screens rendered through `OverlayPortal` escape the canvas scale and sit over it unscaled.
 */
export const OverlayHostContext = createContext<HTMLElement | null>(null);

export function OverlayPortal({ children }: { children: ReactNode }) {
  const host = useContext(OverlayHostContext);
  return host === null ? <>{children}</> : createPortal(children, host);
}
