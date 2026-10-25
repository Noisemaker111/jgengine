import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";

import type { DataModel } from "./_generated/dataModel";

import { components } from "./_generated/api";
import authConfig from "./auth.config";
import { createTrustedOriginsResolver } from "./authOrigins";

const isLocalConvexSite = process.env.CONVEX_SITE_URL?.includes("127.0.0.1") ?? false;
const siteUrl =
  process.env.SITE_URL ??
  (isLocalConvexSite ? "http://localhost:3001" : "https://llmville.com");
const authBaseUrl =
  process.env.CONVEX_SITE_URL ??
  process.env.BETTER_AUTH_URL ??
  process.env.VITE_CONVEX_SITE_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!authBaseUrl) {
  throw new Error("Missing auth base URL. Set CONVEX_SITE_URL (or BETTER_AUTH_URL).");
}

if ((googleClientId && !googleClientSecret) || (!googleClientId && googleClientSecret)) {
  throw new Error("Google OAuth requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
}

const resolvedSiteUrl: string = siteUrl;
const resolvedAuthBaseUrl: string = authBaseUrl;
const resolveTrustedOrigins = createTrustedOriginsResolver(resolvedSiteUrl);

export const authComponent = createClient<DataModel>(components.betterAuth);

function createAuth(ctx: GenericCtx<DataModel>) {
  const socialProviders = googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : undefined;

  return betterAuth({
    baseURL: resolvedAuthBaseUrl,
    trustedOrigins: resolveTrustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders,
    plugins: [
      anonymous({ disableDeleteAnonymousUser: true }),
      crossDomain({ siteUrl: resolvedSiteUrl }),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
    ],
  });
}

export { createAuth };
