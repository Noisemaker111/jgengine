import { spawnSync } from "node:child_process";

/**
 * Hosts that rate-limit anonymous pulls (60 API calls an hour per IP, shared by every agent on the
 * machine) and accept a token. Release downloads on github.com are left alone: they redirect to a
 * signed storage URL that rejects a second credential.
 */
export const GITHUB_TOKEN_HOSTS: ReadonlySet<string> = new Set(["api.github.com", "raw.githubusercontent.com", "codeload.github.com"]);

/** Run `gh auth token`; null when gh is missing, signed out or slow. */
export type GhTokenReader = () => string | null;

const readGhToken: GhTokenReader = () => {
  try {
    const result = spawnSync("gh", ["auth", "token"], { encoding: "utf8", windowsHide: true, timeout: 5_000 });
    const token = result.status === 0 ? result.stdout.trim() : "";
    return token === "" ? null : token;
  } catch {
    return null;
  }
};

/** `GITHUB_TOKEN`, then `GH_TOKEN`, then the signed-in gh CLI's token; undefined when none exists. */
export function resolveGithubToken(env: NodeJS.ProcessEnv = process.env, readGh: GhTokenReader = readGhToken): string | undefined {
  const fromEnv = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv.trim();
  return readGh() ?? undefined;
}

/** True when `url` goes to a host that should carry the token. */
export function wantsGithubToken(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && GITHUB_TOKEN_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** Request headers with `authorization` added for a GitHub host, unless the caller set one. */
export function withGithubAuth(url: string, headers: HeadersInit | undefined, token: string | undefined): Headers {
  const merged = new Headers(headers);
  if (token !== undefined && wantsGithubToken(url) && !merged.has("authorization")) merged.set("authorization", `Bearer ${token}`);
  return merged;
}
