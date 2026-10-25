import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, LogIn, User } from "lucide-react";

import { MAIN_MENU_ACCOUNT_CHIP_KIND, useMainMenuAccountChipVm } from "@/auth";
import { BrandLogo } from "@/branding/components/BrandLogo";
import { SITE_TAGLINE } from "@/seo/siteSeo";
import { MainMenuAtmosphere } from "@/runtime/components/MainMenuAtmosphere";

interface MainMenuLayoutProps {
  children: React.ReactNode;
  /** Optional hero column shown beside the menu on large screens (home intro, etc.). */
  intro?: React.ReactNode;
  backTo?: string;
  overlay?: React.ReactNode;
  /** Hide the top logo / account header row (title-screen style). */
  hideHeader?: boolean;
}

export function MainMenuLayout({ children, intro, backTo, overlay, hideHeader = false }: MainMenuLayoutProps) {
  const accountChip = useMainMenuAccountChipVm();
  const navigate = useNavigate();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-brand-ink font-sans text-brand-cream select-none">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(224,169,92,0.14)_0%,transparent_45%),radial-gradient(circle_at_50%_120%,#22332f_0%,#16201e_70%)]" />
        <div className="game-perspective-grid absolute inset-0" />
        <div className="absolute left-[10%] top-[12%] h-[42%] w-[42%] rounded-full bg-[#e0a95c]/10 blur-[130px] animate-pulse" />
        <div
          className="absolute bottom-[8%] right-[12%] h-[42%] w-[42%] rounded-full bg-[#5fc2a8]/10 blur-[130px] animate-pulse"
          style={{ animationDelay: "1.4s" }}
        />
        <MainMenuAtmosphere />
      </div>

      <div className="relative z-10 flex h-full w-full flex-col p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-8 md:p-12">
        <header
          className={`flex w-full gap-4 ${hideHeader ? "justify-end" : "items-start justify-between"}`}
        >
          {!hideHeader ? (
            <div className="flex min-w-0 flex-col gap-4">
              {backTo ? (
                <Link
                  to={backTo}
                  className="flex items-center gap-1.5 text-sm font-semibold text-brand-teal transition-colors animate-in slide-in-from-left duration-300 hover:text-brand-cream"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                  Back
                </Link>
              ) : null}
              <div className="animate-in fade-in slide-in-from-left duration-700">
                <Link to="/" aria-label="LLMville home">
                  <BrandLogo variant="inline" size="md" showTagline className="max-w-full" />
                </Link>
              </div>
            </div>
          ) : null}

          <div className="animate-in fade-in slide-in-from-right duration-700">
            {accountChip.kind === MAIN_MENU_ACCOUNT_CHIP_KIND.signedOut ? null : accountChip.kind ===
              MAIN_MENU_ACCOUNT_CHIP_KIND.guest ? (
              <div className="flex flex-col items-end gap-1.5">
                <span className="font-sans text-[11px] font-semibold text-brand-cream/55">
                  Playing as guest — progress won't be saved
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/login" })}
                  className="game-button game-button-primary game-button-compact px-4 py-2.5 text-sm"
                >
                  <LogIn className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
                  <span>Sign in to save</span>
                </button>
              </div>
            ) : accountChip.kind === MAIN_MENU_ACCOUNT_CHIP_KIND.profileLink ? (
              <Link
                to="/profile/$username"
                params={{ username: accountChip.username }}
                className="game-account-chip group/profile"
              >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-brand-teal/50">
                  <User className="h-5 w-5 text-brand-teal/90" aria-hidden />
                </div>
                <div className="flex flex-col gap-0.5 text-left">
                  <span className="font-game text-[13px] font-bold tracking-wide text-brand-cream">
                    {accountChip.displayLine}
                  </span>
                  <span className="font-sans text-[11px] font-semibold text-brand-teal">@{accountChip.username}</span>
                </div>
              </Link>
            ) : (
              <div className="game-account-chip">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-brand-teal/40">
                  <User className="h-5 w-5 text-brand-teal/70" aria-hidden />
                </div>
                <div className="flex flex-col gap-0.5 text-left">
                  <span className="font-game text-[13px] font-bold tracking-wide text-brand-cream">
                    {accountChip.displayLine}
                  </span>
                  <span className="animate-pulse font-sans text-[11px] text-brand-teal/60">Loading…</span>
                </div>
              </div>
            )}
          </div>
        </header>

        <main
          className={`flex flex-1 flex-col ${
            intro ? "items-start overflow-y-auto py-4 sm:py-6" : "items-center justify-center"
          }`}
        >
          <div
            className={
              intro
                ? "grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:gap-10"
                : "w-full max-w-sm animate-in fade-in slide-in-from-bottom duration-700"
            }
          >
            {intro ? (
              <div className="animate-in fade-in slide-in-from-left duration-700 max-lg:max-w-lg">{intro}</div>
            ) : null}
            <div
              className={
                intro
                  ? "main-menu-panel animate-in fade-in slide-in-from-bottom duration-700 w-full max-w-sm justify-self-start lg:justify-self-end"
                  : undefined
              }
            >
              {children}
            </div>
          </div>
        </main>

        <footer
          className={`flex w-full flex-wrap items-center justify-between gap-3 text-[11px] font-semibold text-brand-cream/45 ${hideHeader ? "justify-center" : ""}`}
        >
          {!hideHeader ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full bg-brand-teal shadow-[0_0_8px_rgba(95,194,168,0.7)]"
                aria-hidden
              />
              {SITE_TAGLINE}
            </span>
          ) : (
            <span>&copy; 2026 LLMville</span>
          )}
          {!hideHeader ? (
            <nav aria-label="Site links" className="flex items-center gap-4">
              <a href="https://llmville.com" className="tracking-wide transition-colors hover:text-brand-teal">
                llmville.com
              </a>
            </nav>
          ) : null}
        </footer>
      </div>

      {overlay}
    </div>
  );
}
