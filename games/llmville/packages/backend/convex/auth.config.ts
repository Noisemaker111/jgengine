import type { AuthConfig } from "convex/server";

import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

import { botAuthProviders } from "./auth.config.bot";

export default {
  providers: [getAuthConfigProvider(), ...botAuthProviders],
} satisfies AuthConfig;
