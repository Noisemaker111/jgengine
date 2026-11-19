/** @jsxImportSource @jgengine/core/ui/jsx */
import type { LayoutOrientation } from "@jgengine/core/ui/orientation";

import { ShellScreen } from "./rune/shellScreens.view";

function phoneGlyph(requiredOrientation: LayoutOrientation): string {
  // The phone is drawn the way the player should hold it.
  const turn = requiredOrientation === "landscape" ? ' transform="rotate(-90 48 36)"' : "";
  return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><g${turn}><rect x="34" y="10" width="28" height="52" rx="6" stroke="#8ce0c2" stroke-width="3"/><rect x="39" y="18" width="18" height="34" rx="2" fill="#8ce0c2" fill-opacity="0.22"/><circle cx="48" cy="57.5" r="1.8" fill="#8ce0c2"/></g><path d="M22 80a30 30 0 0 1 52 0" stroke="#8ce0c2" stroke-width="3" stroke-linecap="round" stroke-opacity="0.5"/><path d="M70 74l6 8-10 1z" fill="#8ce0c2" fill-opacity="0.5"/></svg>`;
}

/**
 * Full-screen, non-dismissible gate shown when a game needs an orientation the device isn't in. It is
 * drawn on Rune and takes every pointer and key, so nothing reaches the game beneath.
 */
export function RotateDeviceScreen({
  title = "Turn your device",
  description,
  requiredOrientation = "landscape",
}: {
  /** Short headline. */
  title?: string;
  /** One concise explanatory line. Defaults from `requiredOrientation`. */
  description?: string;
  /** Orientation the game needs; the phone is drawn held that way. */
  requiredOrientation?: LayoutOrientation;
}) {
  const line = description ?? (requiredOrientation === "landscape" ? "Rotate to landscape to play." : "Rotate to portrait to play.");
  return <ShellScreen title={title} body={line} glyph={phoneGlyph(requiredOrientation)} />;
}
