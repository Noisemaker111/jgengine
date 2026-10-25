import { useNavigate } from "@tanstack/react-router";
import { Loader2, Play, Settings, Trash2 } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { BrandLogo } from "@/branding/components/BrandLogo";
import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";
import { MainMenuLayout } from "@/runtime/components/MainMenuLayout";
import { useMainMenu } from "@/runtime/mainMenu";
import { MAIN_MENU_KIND } from "@/runtime/mainMenuPhase";
import { SettingsDock } from "@/settings/components/SettingsDock";

function HomeMainMenu() {
  const navigate = useNavigate();
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
    void navigate({ to: "/", search: { settings: true, tab: "general" } });
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
          <div className="space-y-2 rounded-[var(--r-surface)] border border-brand-coral/30 bg-brand-coral/5 p-4">
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
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" aria-hidden />
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
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Joining world…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden />
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
                <Play className="h-4 w-4" aria-hidden />
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
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete lab
              </button>
            )}

            <button type="button" onClick={openSettings} className="game-button game-menu-button">
              <Settings className="h-4 w-4" aria-hidden />
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
    <MainMenuLayout hideHeader overlay={<SettingsDock showTrigger={false} />}>
      <HomeMainMenu />
    </MainMenuLayout>
  );
}
