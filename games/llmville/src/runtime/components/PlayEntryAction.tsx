/** @jsxImportSource @jgengine/core/ui/jsx */
import { Button } from "../../ui/kit";
import type { MainMenuState } from "../mainMenu";
import { MAIN_MENU_KIND } from "../mainMenuPhase";

export function PlayEntryAction({ menu, label }: { menu: MainMenuState; label: string }) {
  const continuing = menu.phase.kind === MAIN_MENU_KIND.continue;
  return <Button tone="primary" icon="play" busy={menu.isEnteringGame} busyLabel="Joining world…"
    onHover={(inside) => { if (inside) (continuing ? menu.warmContinueRoute : menu.warmCreateRoute)(); }}
    onPress={continuing ? menu.continueGame : menu.startGame}>{label}</Button>;
}
