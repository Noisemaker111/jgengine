import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { useMainMenu } from "@/runtime/mainMenu";
import { MAIN_MENU_KIND } from "@/runtime/mainMenuPhase";

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
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Joining world…
        </>
      ) : (
        children
      )}
    </button>
  );
}
