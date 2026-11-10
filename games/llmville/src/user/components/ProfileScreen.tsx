/** @jsxImportSource @jgengine/core/ui/jsx */
import { ScreenLink } from "../../screens/screenRouter";
import { Icon } from "../../kit/icons";

import { KitButton } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { formatCompactNumber, formatMoney } from "../../economy/economy";
import { MainMenuLayout } from "../../runtime/components/MainMenuLayout";
import { getAvatarById, getMentorPerkSummary, useProfileScreen, sanitizeProfileUsernameKeystroke } from "../user";
import type { ReactNode } from "@jgengine/core/ui/jsx";

interface ProfileScreenProps {
  username: string;
}

function ProfilePanel({ children }: { children: ReactNode }) {
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
          <Icon name="spinner" className="h-8 w-8 animate-spin text-brand-teal" />
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
            <ScreenLink to="/" className="game-button game-button-primary game-menu-button mt-2 inline-flex">
              Back home
            </ScreenLink>
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
            <div className="llm-stat-grid">
              <div className="llm-stat llm-stat--scoreboard llm-stat--tone-amber">
                <span className="llm-stat__icon"><Icon name="coins" className="h-4 w-4" /></span>
                <div className="llm-stat__content">
                  <span className="llm-stat__label">Cash</span>
                  <span className="llm-stat__value">{`$${formatMoney(publicProfile.lab.cash)}`}</span>
                </div>
              </div>
              <div className="llm-stat llm-stat--scoreboard llm-stat--tone-teal">
                <span className="llm-stat__icon"><Icon name="sparkles" className="h-4 w-4" /></span>
                <div className="llm-stat__content">
                  <span className="llm-stat__label">Data tokens</span>
                  <span className="llm-stat__value">{formatCompactNumber(publicProfile.lab.dataTokens)}</span>
                </div>
              </div>
              <div className="llm-stat llm-stat--scoreboard llm-stat--tone-cream">
                <span className="llm-stat__icon"><Icon name="cpu" className="h-4 w-4" /></span>
                <div className="llm-stat__content">
                  <span className="llm-stat__label">Models serving</span>
                  <span className="llm-stat__value">{publicProfile.lab.modelsServing}</span>
                </div>
              </div>
              <div className="llm-stat llm-stat--scoreboard llm-stat--tone-coral">
                <span className="llm-stat__icon"><Icon name="users" className="h-4 w-4" /></span>
                <div className="llm-stat__content">
                  <span className="llm-stat__label">Models trained</span>
                  <span className="llm-stat__value">{publicProfile.lab.modelsTrained}</span>
                </div>
              </div>
            </div>
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
                <KitButton
                  type="button"
                  variant="ghost"
                  onClick={handleCancel}
                  className="game-menu-button flex-1"
                >
                  <Icon name="close" className="h-4 w-4" />
                  Cancel
                </KitButton>
                <KitButton
                  type="button"
                  variant="primary"
                  onClick={() => void handleSave()}
                  disabled={disableSave}
                  className="game-menu-button flex-1 disabled:opacity-50"
                >
                  {saving ? (
                    <Icon name="spinner" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon name="check" className="h-4 w-4" />
                  )}
                  Save
                </KitButton>
              </div>
            ) : (
              <KitButton
                type="button"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="game-menu-button w-full"
              >
                <Icon name="pencil" className="h-4 w-4" />
                Edit handle
              </KitButton>
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
              <Icon name="logOut" className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        ) : null}
      </ProfilePanel>
    </MainMenuLayout>
  );
}