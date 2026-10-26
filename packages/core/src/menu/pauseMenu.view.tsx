import type { ReactNode } from "react";

import { GameMenu, type GameMenuProps } from "./gameMenu.view";

/** Props for {@link PauseMenu}: every {@link GameMenu} knob except `variant`, plus `onResume`. */
export type PauseMenuProps = Omit<GameMenuProps, "variant"> & {
  /** Resume play. Escape, B and Start call it too unless `onBack` is given. */
  onResume?: () => void;
};

/**
 * The pause menu: {@link GameMenu} at its smaller pause scale, so a game composes one menu system for
 * title and pause. The game fills the verbs (Resume, Save, Settings, Quit) and the detail pane, and
 * reskins it with `--jg-*` tokens on `style`. Escape (or B/Start) resumes.
 *
 * @capability pause-menu pause menu from the shared game-menu system: game-filled verbs and detail pane, same navigation and surface as the title menu, sized down
 */
export function PauseMenu(props: PauseMenuProps): ReactNode {
  const { onResume, onBack, ...rest } = props;
  return <GameMenu {...rest} variant="pause" onBack={onBack ?? onResume} label={rest.label ?? "Paused"} />;
}
