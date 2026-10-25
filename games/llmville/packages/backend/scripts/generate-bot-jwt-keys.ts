/**
 * Generates the RS256 keypair for LLMville bot JWT auth.
 *
 * Convex env (dashboard → adorable-oriole-506 → Environment Variables):
 *   BOT_JWT_ISSUER
 *   BOT_JWT_PRIVATE_KEY  (base64 PKCS8 — used by bots.ts to sign tokens)
 *
 * This script also writes the public JWKS into convex/auth.config.bot.ts so
 * convex deploy is not blocked by optional auth.config env-var validation.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const ISSUER = "https://llmville.com/bot";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const botAuthConfigPath = join(scriptDir, "../convex/auth.config.bot.ts");

async function main() {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicJwk = await exportJWK(keys.publicKey);
  const jwks = JSON.stringify({ keys: [{ use: "sig", alg: "RS256", kid: "bot-1", ...publicJwk }] });
  const jwksDataUri = `data:application/json;charset=utf-8;base64,${Buffer.from(jwks).toString("base64")}`;

  const botAuthConfigSource = `import type { AuthConfig } from "convex/server";

export const botAuthProviders: AuthConfig["providers"] = [
  {
    type: "customJwt",
    applicationID: "llmville-bot",
    issuer: ${JSON.stringify(ISSUER)},
    jwks: ${JSON.stringify(jwksDataUri)},
    algorithm: "RS256",
  },
];
`;

  writeFileSync(botAuthConfigPath, botAuthConfigSource);

  console.log(`BOT_JWT_ISSUER=${ISSUER}`);
  console.log(`BOT_JWT_PRIVATE_KEY=${Buffer.from(privateKey.trim()).toString("base64")}`);
  console.log(`Wrote public JWKS provider to ${botAuthConfigPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
