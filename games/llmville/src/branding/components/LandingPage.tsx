import { navigate } from "../../screens/screenRouter";
import { Icon } from "../../kit/icons";

import { cn } from "../../kit/cn";
import { BrandLogo } from "./BrandLogo";
import { RouteLoadingScreen } from "../../components/RouteLoadingScreen";
import { MainMenuLayout } from "../../runtime/components/MainMenuLayout";
import { useMainMenu } from "../../runtime/mainMenu";
import { MAIN_MENU_KIND } from "../../runtime/mainMenuPhase";
import { MenuSettingsDialog } from "../../settings/components/MenuSettingsDialog";

function HomeMainMenu() {
  const {
    phase,
    confirmDeleteWorld,
    setConfirmDeleteWorld,
    isDeleting,
    isEnteringGame,
    startGame,
    continueGame,
    warmCreateRoute,
    warmContinueRoute,
    deleteCurrentWorld,
  } = useMainMenu();

  const warmRoute = phase.kind === MAIN_MENU_KIND.continue ? warmContinueRoute : warmCreateRoute;

  const openSettings = () => {
    void navigate({ to: "/", search: { settings: true } });
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {isEnteringGame ? (
        <RouteLoadingScreen label="Joining world" overlay />
      ) : null}
      <div className="animate-in fade-in zoom-in-95 flex flex-col items-center text-center duration-700">
        <BrandLogo variant="stacked" size="lg" />
        <p className="mt-3 max-w-xs font-sans text-sm text-brand-cream/55">
          Buy GPUs -&gt; Train LLM models -&gt; serve tokens in an open world with humans and agents.
        </p>
      </div>

      <nav
        aria-label="Main menu"
        className="main-menu-panel animate-in fade-in slide-in-from-bottom w-full max-w-sm space-y-2 duration-700"
      >
        {confirmDeleteWorld ? (
          <div className="space-y-2 rounded-[var(--kit-r-surface)] border border-brand-coral/30 bg-brand-coral/5 p-4">
            <p className="font-game text-sm font-bold text-brand-cream">Delete your lab?</p>
            <p className="text-xs leading-relaxed text-brand-cream/55">
              Your lab, racks, models, and progress will be erased. This cannot be undone.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void deleteCurrentWorld()}
                className="game-button game-button-primary game-menu-button border-brand-coral-deep bg-brand-coral text-brand-ink hover:bg-[#ec8f78]"
              >
                {isDeleting ? (
                  <>
                    <Icon name="spinner" className="h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Icon name="trash" className="h-4 w-4" />
                    Yes, delete my lab
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteWorld(false)}
                className="game-button game-menu-button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : phase.kind === MAIN_MENU_KIND.loading ? (
          <button type="button" disabled className="game-button game-menu-button">
            <Icon name="spinner" className="h-4 w-4 animate-spin" />
            Loading…
          </button>
        ) : (
          <>
            {phase.kind === MAIN_MENU_KIND.continue ? (
              <button
                type="button"
                disabled={isDeleting || isEnteringGame}
                onPointerEnter={warmRoute}
                onPointerDown={warmRoute}
                onClick={continueGame}
                className="game-button game-button-primary game-menu-button"
              >
                {isEnteringGame ? (
                  <>
                    <Icon name="spinner" className="h-4 w-4 animate-spin" />
                    Joining world…
                  </>
                ) : (
                  <>
                    <Icon name="play" className="h-4 w-4" />
                    Rejoin world
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={isDeleting}
                onPointerEnter={warmRoute}
                onPointerDown={warmRoute}
                onClick={startGame}
                className="game-button game-button-primary game-menu-button"
              >
                <Icon name="play" className="h-4 w-4" />
                Join world
              </button>
            )}

            {phase.kind === MAIN_MENU_KIND.continue && (
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteWorld(true)}
                className={cn(
                  "game-button game-menu-button text-brand-coral hover:border-brand-coral/40 hover:bg-brand-coral/10 hover:text-brand-coral",
                )}
              >
                <Icon name="trash" className="h-4 w-4" />
                Delete lab
              </button>
            )}

            <button type="button" onClick={openSettings} className="game-button game-menu-button">
              <Icon name="settings" className="h-4 w-4" />
              Settings
            </button>
          </>
        )}
      </nav>
    </div>
  );
}

export function LandingPage() {
  return (
    <MainMenuLayout hideHeader overlay={<MenuSettingsDialog />}>
      <HomeMainMenu />
    </MainMenuLayout>
  );
}
