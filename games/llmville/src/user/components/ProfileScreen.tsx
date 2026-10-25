import { Link } from "@tanstack/react-router";
import { Check, Coins, Cpu, Loader2, LogOut, Pencil, Sparkles, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stat, StatGrid } from "@/components/ui/stat";
import { formatCompactNumber, formatMoney } from "@/economy/economy";
import { MainMenuLayout } from "@/runtime/components/MainMenuLayout";
import { getAvatarById, getMentorPerkSummary, useProfileScreen, sanitizeProfileUsernameKeystroke } from "@/user/user";

interface ProfileScreenProps {
  username: string;
}

function ProfilePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="main-menu-panel w-full max-w-md space-y-6 p-6 sm:p-8">
      {children}
    </div>
  );
}

export function ProfileScreen({ username: usernameParam }: ProfileScreenProps) {
  const {
    isLoading,
    publicProfile,
    isOwnProfile,
    isEditing,
    setIsEditing,
    username,
    setUsername,
    saving,
    error,
    setUsernameCheck,
    usernameTaken,
    checkingUsername,
    handleSave,
    handleCancel,
    logout,
    disableSave,
  } = useProfileScreen({ usernameParam });

  if (isLoading) {
    return (
      <MainMenuLayout backTo="/">
        <div className="flex flex-col items-center gap-4 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-brand-teal" aria-hidden />
          <p className="text-sm font-medium text-brand-cream/60">Loading profile…</p>
        </div>
      </MainMenuLayout>
    );
  }

  if (publicProfile == null) {
    return (
      <MainMenuLayout backTo="/">
        <ProfilePanel>
          <div className="space-y-3 text-center">
            <h1 className="font-game text-xl font-extrabold text-brand-cream">Profile not found</h1>
            <p className="text-sm text-brand-cream/60">
              That username may have changed or doesn&apos;t exist.
            </p>
            <Link to="/" className="game-button game-button-primary game-menu-button mt-2 inline-flex">
              Back home
            </Link>
          </div>
        </ProfilePanel>
      </MainMenuLayout>
    );
  }

  const handle = publicProfile.username ?? usernameParam;
  const mentor = getAvatarById(publicProfile.avatarId);

  return (
    <MainMenuLayout backTo="/">
      <ProfilePanel>
        <div className="space-y-1 text-center">
          {isOwnProfile && isEditing ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-cream/45">Public handle</p>
              <div className="flex items-center justify-center gap-1">
                <span className="font-game text-lg font-bold text-brand-teal/80">@</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(sanitizeProfileUsernameKeystroke(event.target.value))}
                  onBlur={() => setUsernameCheck(username)}
                  placeholder="username"
                  maxLength={24}
                  className="game-input inline-block min-w-[160px] w-auto text-center font-game text-lg font-bold"
                />
              </div>
              {usernameTaken ? (
                <p className="text-xs text-[#f0a097]">Username is already taken</p>
              ) : checkingUsername ? (
                <p className="text-xs text-brand-cream/45">Checking availability…</p>
              ) : null}
            </div>
          ) : (
            <>
              <p className="font-game text-3xl font-extrabold tracking-tight text-brand-cream">@{handle}</p>
              <p className="text-sm font-medium text-brand-teal/80">
                Mentor: {mentor.name} · {mentor.perkTitle}
              </p>
              <p className="text-xs text-brand-cream/45">{getMentorPerkSummary(publicProfile.avatarId)}</p>
            </>
          )}
        </div>

        {publicProfile.lab ? (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-cream/45">Public lab stats</p>
              <p className="mt-1 font-game text-sm font-bold text-brand-cream/75">
                {publicProfile.lab.name}
              </p>
            </div>
            <StatGrid>
              <Stat
                variant="scoreboard"
                tone="amber"
                label="Cash"
                value={`$${formatMoney(publicProfile.lab.cash)}`}
                icon={<Coins className="h-4 w-4" aria-hidden />}
              />
              <Stat
                variant="scoreboard"
                tone="teal"
                label="Data tokens"
                value={formatCompactNumber(publicProfile.lab.dataTokens)}
                icon={<Sparkles className="h-4 w-4" aria-hidden />}
              />
              <Stat
                variant="scoreboard"
                tone="cream"
                label="Models serving"
                value={publicProfile.lab.modelsServing}
                icon={<Cpu className="h-4 w-4" aria-hidden />}
              />
              <Stat
                variant="scoreboard"
                tone="coral"
                label="Models trained"
                value={publicProfile.lab.modelsTrained}
                icon={<Users className="h-4 w-4" aria-hidden />}
              />
            </StatGrid>
            {publicProfile.lab.topBenchmark > 0 ? (
              <p className="text-center text-xs font-semibold text-brand-teal/70">
                Top benchmark score: {Math.round(publicProfile.lab.topBenchmark)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-white/8 bg-white/3 px-4 py-3 text-center text-sm text-brand-cream/55">
            No public lab yet.
          </p>
        )}

        {error ? <p className="text-center text-sm text-[#f0a097]">{error}</p> : null}

        {isOwnProfile ? (
          <div className="flex flex-col gap-2">
            {isEditing ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  className="game-menu-button flex-1"
                >
                  <X className="h-4 w-4" aria-hidden />
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handleSave()}
                  disabled={disableSave}
                  className="game-menu-button flex-1 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Save
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditing(true)}
                className="game-menu-button w-full"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit handle
              </Button>
            )}
          </div>
        ) : null}

        {isOwnProfile ? (
          <div className="border-t border-white/8 pt-4 text-center">
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-cream/45 transition-colors hover:text-brand-coral"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        ) : null}
      </ProfilePanel>
    </MainMenuLayout>
  );
}