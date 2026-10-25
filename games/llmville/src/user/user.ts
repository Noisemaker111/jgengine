import { api } from "@llmville/backend/convex/_generated/api";
import {
  FOUNDER_PERK_DISPLAY_PERCENT,
  normalizeAvatarId,
  type CanonicalAvatarId,
} from "@llmville/game/user/founder";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";

import { BASE_POWER_CAPACITY_KW } from "@llmville/game/infrastructure/infrastructure";
import { useAuth } from "@/auth";
import { resolveAuthUsername } from "@/auth/authCredentials";
import { formatChunkLoadError } from "@/runtime/chunkLoadError";
import { clearAllLocalGamePersistence } from "@/storage/storage";

export type AvatarId = CanonicalAvatarId;

export { normalizeAvatarId };

export type FounderPerkKind =
  | "higher_tps"
  | "lower_shop_prices"
  | "lower_electricity"
  | "higher_tflops"
  | "higher_serving_cash";

export interface AvatarDefinition {
  id: AvatarId;
  name: string;
  outfit: string;
  bio: string;
  perkTitle: string;
  /** Public URL under `llmville/public/` (e.g. `/images/…` for 9:16 portraits). */
  portraitSrc: string;
  perkKind: FounderPerkKind;
}

/** Portrait art: `llmville/public/images/*_portrait.png` (3:4 cards). */
export const AVATARS: readonly AvatarDefinition[] = [
  {
    id: "sam_altman",
    name: "Sam Altman",
    outfit: "Suit + calm voice",
    bio: "Ship fast, raise often, demo weekly.",
    perkTitle: "Scale Era",
    portraitSrc: "/images/sam_portrait.png",
    perkKind: "higher_tps",
  },
  {
    id: "lee_rob",
    name: "Lee Rob",
    outfit: "Hoodie + deploy vibes",
    bio: "Lean lab, smart buys, compound the savings.",
    perkTitle: "Indie Fund",
    portraitSrc: "/images/lee_portrait.png",
    perkKind: "lower_shop_prices",
  },
  {
    id: "elon_xai",
    name: "Elon Musk",
    outfit: "Cybertruck hat",
    bio: "Meme the roadmap, cut the power bill.",
    perkTitle: "Off-Grid Ops",
    portraitSrc: "/images/elon_portrait.png",
    perkKind: "lower_electricity",
  },
  {
    id: "dario_amodei",
    name: "Dario Amodei",
    outfit: "Research coat + safety slides",
    bio: "Safety-first scaling—more flops, fewer surprises.",
    perkTitle: "Constitutional Compute",
    portraitSrc: "/images/dario_portrait.png",
    perkKind: "higher_tflops",
  },
  {
    id: "logan_kilpatrick",
    name: "Logan Kilpatrick",
    outfit: "Product polo + launch notes",
    bio: "Ship the story, polish the launch, monetize inference.",
    perkTitle: "Launch Playbook",
    portraitSrc: "/images/logan_portrait.png",
    perkKind: "higher_serving_cash",
  },
];

const PROFILE_USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

/** One-line bonus for mentor picker cards. */
export function getMentorPerkSummary(avatarId: AvatarId): string {
  const id = normalizeAvatarId(avatarId);
  const pct = FOUNDER_PERK_DISPLAY_PERCENT[id];
  const def = getAvatarById(id);
  switch (def.perkKind) {
    case "higher_tps":
      return `+${pct}% serving throughput`;
    case "lower_shop_prices":
      return `${pct}% off shop prices`;
    case "lower_electricity":
      return `${pct}% lower power bills`;
    case "higher_tflops":
      return `+${pct}% training TFLOPs`;
    case "higher_serving_cash":
      return `+${pct}% serving cash`;
  }
}

export function getAvatarById(avatarId: AvatarId): AvatarDefinition {
  const avatar = AVATARS.find((item) => item.id === avatarId);
  if (avatar === undefined) {
    return AVATARS[0];
  }
  return avatar;
}

export function getDefaultAvatarId(): AvatarId {
  return AVATARS[0].id;
}

export function sanitizeProfileUsernameKeystroke(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function normalizeProfileUsernameInput(raw: string): string {
  return sanitizeProfileUsernameKeystroke(raw.trim());
}

export function useUpdateAvatarMutation() {
  return useMutation(api.user.updateAvatar);
}

export function useCreateWorldCustomizeScreen() {
  const { user, isLoading, convexUser } = useAuth();
  const navigate = useNavigate();
  const updateAvatar = useUpdateAvatarMutation();
  const bootstrapWorld = useMutation(api.world.bootstrapWorld);
  const [selectedAvatarId, setSelectedAvatarId] = useState<AvatarId>(getDefaultAvatarId);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!convexUser && !user) return;
    if (convexUser?.avatarId) {
      setSelectedAvatarId(normalizeAvatarId(convexUser.avatarId));
    }
  }, [convexUser, user]);

  const selectedAvatar = getAvatarById(selectedAvatarId);
  const profileUsername = resolveAuthUsername(convexUser);
  const displayName = convexUser?.displayName?.trim() || profileUsername || "Player";

  const handleContinue = useCallback(async () => {
    if (isLoading || user === null || !profileUsername || isStarting) return;

    setError(null);
    setIsStarting(true);
    try {
      await updateAvatar({ avatarId: selectedAvatarId });
      clearAllLocalGamePersistence();

      const bootstrapped = await bootstrapWorld({
        displayName,
        avatarId: selectedAvatarId,
        forceNew: false,
      });

      if (!bootstrapped.gameId) {
        throw new Error("Your lab is still being set up. Try again in a moment.");
      }

      await navigate({ to: "/game/$gameId", params: { gameId: bootstrapped.gameId } });
    } catch (startError) {
      setError(formatChunkLoadError(startError));
      setIsStarting(false);
    }
  }, [
    bootstrapWorld,
    displayName,
    isLoading,
    isStarting,
    navigate,
    profileUsername,
    selectedAvatarId,
    updateAvatar,
    user,
  ]);

  return {
    avatars: AVATARS,
    selectedAvatarId,
    selectedAvatar,
    selectAvatar: setSelectedAvatarId,
    handleContinue,
    isLoading,
    isStarting,
    error,
    canContinue: !isLoading && user !== null && profileUsername !== null && !isStarting,
  };
}

interface UseProfileScreenParams {
  usernameParam: string;
}

function normalizeProfileRouteUsername(raw: string): string {
  return raw.toLowerCase().trim().replace(/^@/, "");
}

export function useProfileScreen({ usernameParam }: UseProfileScreenParams) {
  const navigate = useNavigate();
  const { isAuthenticated, convexUser, logout } = useAuth();
  const normalizedUsername = normalizeProfileRouteUsername(usernameParam);
  const publicProfile = useQuery(api.user.getPublicProfileByUsername, { username: normalizedUsername });
  const updateProfile = useMutation(api.user.updateProfile);

  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameCheck, setUsernameCheck] = useState("");

  const isOwnProfile =
    isAuthenticated
    && convexUser !== null
    && convexUser !== undefined
    && convexUser.username?.toLowerCase() === normalizedUsername;

  useEffect(() => {
    if (publicProfile?.username) {
      setUsername(publicProfile.username);
    }
  }, [publicProfile?.username]);

  const handleSave = async () => {
    if (!isOwnProfile || !publicProfile?.username) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const trimmedUsername = normalizeProfileUsernameInput(username);
      await updateProfile({
        displayName: trimmedUsername || publicProfile.username,
        username: trimmedUsername || undefined,
      });
      if (trimmedUsername && trimmedUsername !== normalizedUsername) {
        navigate({ to: "/profile/$username", params: { username: trimmedUsername } });
      }
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setUsername(publicProfile?.username ?? "");
    setError(null);
    setIsEditing(false);
  };

  const usernameAvailable = useQuery(
    api.user.isUsernameAvailable,
    isOwnProfile && usernameCheck && convexUser
      ? { username: usernameCheck, excludeExternalId: convexUser.externalId }
      : "skip",
  );

  const typedUsername = normalizeProfileUsernameInput(username);
  const isCheckingUsername =
    isOwnProfile
    && typedUsername.length >= 3
    && typedUsername !== (publicProfile?.username ?? "");
  const usernameTaken = isCheckingUsername && usernameAvailable === false;
  const checkingUsername = isCheckingUsername && usernameAvailable === undefined;
  const hasValidUsername = PROFILE_USERNAME_REGEX.test(typedUsername);

  const isLoading = publicProfile === undefined;

  return {
    isLoading,
    publicProfile,
    isOwnProfile,
    isEditing,
    setIsEditing,
    username,
    setUsername,
    saving,
    error,
    usernameCheck,
    setUsernameCheck,
    usernameTaken,
    checkingUsername,
    hasValidUsername,
    handleSave,
    handleCancel,
    logout,
    disableSave: saving || !hasValidUsername || (isCheckingUsername && (usernameTaken || checkingUsername)),
  };
}

export interface GamePlayerProfile {
  walkSpeedLevel: number;
  trainingDurationMultiplier: number;
  powerCapacityKw: number;
}

export function normalizePlayerProfile(
  profile: Partial<GamePlayerProfile> | null | undefined,
): GamePlayerProfile {
  return {
    walkSpeedLevel: profile?.walkSpeedLevel ?? 0,
    trainingDurationMultiplier: profile?.trainingDurationMultiplier ?? 1,
    powerCapacityKw: profile?.powerCapacityKw ?? BASE_POWER_CAPACITY_KW,
  };
}
