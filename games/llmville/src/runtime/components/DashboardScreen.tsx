import { Link } from "@tanstack/react-router";

import { KitButton, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { BrandLogo } from "@/branding/components/BrandLogo";
import { StandalonePageShell } from "@/branding/components/StandalonePageShell";
import { useDashboardScreenState } from "@/auth";

export function DashboardScreen() {
  const { phase, logout, displayName, email, username } = useDashboardScreenState();

  if (phase === "loading") {
    return (
      <StandalonePageShell centered>
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-brand-teal/25 border-t-brand-teal animate-spin" />
          <p className="text-sm font-medium text-brand-cream/60">Loading account…</p>
        </div>
      </StandalonePageShell>
    );
  }

  if (phase === "signed_out" || phase === "guest") {
    const isGuest = phase === "guest";
    return (
      <StandalonePageShell centered>
        <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
          <div className="mb-7 flex flex-col items-center text-center">
            <BrandLogo variant="stacked" size="md" />
            <p className="mt-4 text-sm font-medium text-brand-cream/65">
              {isGuest
                ? "Playing as guest — progress won't be saved."
                : "Sign in to sync your lab across devices."}
            </p>
          </div>
          <KitPanel data-shell="terminal" eyebrow="Account" className="space-y-5 p-8 text-center">
            <h1 className="font-game text-2xl font-extrabold text-brand-cream">Account</h1>
            <p className="text-sm font-medium text-brand-cream/70">
              {isGuest ? "Sign in to save your progress." : "You are not signed in yet."}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="game-button game-button-primary flex-1 px-4 py-3">
                <span className="text-sm">Sign in</span>
              </Link>
              <Link to="/signup" className="game-button game-button-secondary flex-1 px-4 py-3">
                <span className="text-sm">Sign up</span>
              </Link>
            </div>
          </KitPanel>
        </div>
      </StandalonePageShell>
    );
  }

  return (
    <StandalonePageShell centered>
      <div className="w-full max-w-lg animate-in fade-in zoom-in-95 duration-300">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandLogo variant="stacked" size="md" />
          <p className="mt-4 text-sm font-medium text-brand-cream/65">Signed in and ready to build.</p>
        </div>
        <KitPanel data-shell="terminal" eyebrow="Account" className="space-y-6 p-8">
          <h1 className="text-center font-game text-2xl font-extrabold text-brand-cream">Account</h1>

          <div className="space-y-3 rounded-xl border border-[var(--kit-line)] bg-black/20 p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-brand-cream/45">Display name</span>
              <span className="text-sm font-semibold text-brand-cream">{displayName}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-brand-cream/45">Email</span>
              <span className="text-sm font-semibold text-brand-cream">{email}</span>
            </div>
            {username !== null && username !== "" && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-brand-cream/45">Username</span>
                <span className="text-sm font-semibold text-brand-teal">@{username}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/" className="llm-btn flex-1 px-4 py-3 text-center" data-variant="primary">
              <span className="text-sm">Back home</span>
            </Link>
            <KitButton type="button" variant="ghost" onClick={() => void logout()} className="flex-1 px-4 py-3">
              <span className="text-sm">Sign out</span>
            </KitButton>
          </div>
        </KitPanel>
      </div>
    </StandalonePageShell>
  );
}
