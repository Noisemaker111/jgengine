import type { UiKit } from "./uiKit";
import { arcadeKit } from "./uiKitArcade";
import { broadcastKit } from "./uiKitBroadcast";
import { holoKit } from "./uiKitHolo";
import { inkKit } from "./uiKitInk";
import { paperKit } from "./uiKitPaper";
import { parchmentKit } from "./uiKitParchment";
import { signalKit } from "./uiKitSignal";
import { terminalKit } from "./uiKitTerminal";

/** The built-in kit names a game can pick with `defineGame({ uiKit: "<name>" })`. */
export type UiKitName = "ink" | "paper" | "parchment" | "terminal" | "holo" | "broadcast" | "arcade" | "signal";

/**
 * The eight built-in UI kits, each a complete visual language with every part:
 * `ink` comic caper, `paper` cardboard and stickers, `parchment` painterly fantasy, `terminal`
 * brutalist console, `holo` angular sci-fi hologram, `broadcast` sports TV graphics, `arcade` retro
 * pixel cabinet, `signal` in-world signage and departure boards.
 *
 * @capability ui-kits eight complete built-in UI kits (ink, paper, parchment, terminal, holo, broadcast, arcade, signal) a game picks in one line
 */
export const UI_KITS: Readonly<Record<UiKitName, UiKit>> = {
  ink: inkKit,
  paper: paperKit,
  parchment: parchmentKit,
  terminal: terminalKit,
  holo: holoKit,
  broadcast: broadcastKit,
  arcade: arcadeKit,
  signal: signalKit,
};

/** A built-in kit by name, or a kit object as given (for example from `customizeKit`). */
export function resolveUiKit(kit: UiKitName | UiKit): UiKit {
  return typeof kit === "string" ? UI_KITS[kit] : kit;
}
