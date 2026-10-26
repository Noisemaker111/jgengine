import type { GameContext } from "../runtime/gameContext";
import type { WorldModel, WorldPlacement } from "./worldModel";

/** One piece a build key can place: its world-model kind and the name a notice says. */
export interface BuildPiece {
  id: string;
  label: string;
}

/** How {@link placePiece} reports. */
export interface PlacePieceOptions {
  /** Say `<label> going up` when the piece lands. Default `true`. */
  announce?: boolean;
}

/**
 * Put one piece into a world model where the player asked, saying why when it cannot go: `at` is
 * the placement, or the refusal text when the player pointed somewhere nothing can stand (outside
 * the grounds, no free pad). The model's own refusal (cost, taken cell, locked kind) is said as-is.
 * Returns whether the piece was placed.
 *
 * @capability place-piece place a build piece in a world model with on-screen refusals
 */
export function placePiece(
  ctx: GameContext,
  world: Pick<WorldModel, "canPlace" | "place">,
  piece: BuildPiece,
  at: WorldPlacement | string,
  options: PlacePieceOptions = {},
): boolean {
  if (typeof at === "string") {
    ctx.game.notices.push({ text: at, tone: "deny" });
    return false;
  }
  const refused = world.canPlace(piece.id, at);
  if (refused !== null) {
    ctx.game.notices.push({ text: refused.message, tone: "deny" });
    return false;
  }
  world.place(piece.id, at);
  if (options.announce !== false) ctx.game.notices.push({ text: `${piece.label} going up`, tone: "info" });
  return true;
}

/**
 * Define one `build1`..`buildN` command per piece, in order, so each binds to its number key; the
 * command runs `use` with the piece (arm it, or place it straight away).
 *
 * @capability build-keys one numbered build command per build piece
 */
export function defineBuildKeys<TPiece extends BuildPiece>(
  ctx: GameContext,
  pieces: readonly TPiece[],
  use: (ctx: GameContext, piece: TPiece) => void,
): void {
  pieces.forEach((piece, index) => {
    ctx.game.commands.define(`build${index + 1}`, {
      apply(state) {
        use(state, piece);
        return state;
      },
    });
  });
}
