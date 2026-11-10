/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import type { ButtonHTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";
import { Icon } from "../../kit/icons";

import { useMainMenu } from "../mainMenu";
import { MAIN_MENU_KIND } from "../mainMenuPhase";

interface PlayEntryActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/** Start or continue a lab — sign-in and founder setup when needed. */
export function PlayEntryAction({ children, onClick, disabled, ...buttonProps }: PlayEntryActionProps) {
  const { phase, startGame, continueGame, warmCreateRoute, warmContinueRoute, isEnteringGame } = useMainMenu();

  const warmRoute = phase.kind === MAIN_MENU_KIND.continue ? warmContinueRoute : warmCreateRoute;
  const isContinue = phase.kind === MAIN_MENU_KIND.continue;

  return (
    <button
      type="button"
      {...buttonProps}
      disabled={disabled || isEnteringGame}
      onPointerEnter={warmRoute}
      onPointerDown={warmRoute}
      onClick={(event) => {
        onClick?.(event);
        if (isContinue) {
          continueGame();
          return;
        }
        startGame();
      }}
    >
      {isEnteringGame ? (
        <>
          <Icon name="spinner" className="h-4 w-4 animate-spin" />
          Joining world…
        </>
      ) : (
        children
      )}
    </button>
  );
}
