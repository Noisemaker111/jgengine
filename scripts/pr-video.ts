/**
 * Upload a video (or image) to GitHub's user-attachments store so it renders
 * with GitHub's NATIVE INLINE PLAYER in PR/issue bodies and comments — the
 * only URLs GitHub plays inline (`github.com/user-attachments/assets/<uuid>`).
 *
 * There is deliberately no token API for this (community discussion #29993;
 * cli/cli#13256 is blocked on one), so this uses the browser upload flow via
 * the `user-attachments` npm package, authenticated with a GitHub session
 * cookie provided as the `GH_SESSION_TOKEN` environment secret:
 *
 *   1. Log into github.com as a bot/machine account with repo write access
 *      (a dedicated account bounds the blast radius — the cookie is a
 *      full-account credential, treat it like a password).
 *   2. Copy the `user_session` cookie value from browser devtools.
 *   3. Add it as env var `GH_SESSION_TOKEN` in the agent environment
 *      (claude.ai/code environment settings for cloud sessions).
 *
 * Once uploaded, the printed URL pasted on its OWN BARE LINE in any PR body
 * or comment renders as a video player regardless of which account posts it.
 * Sessions expire on GitHub's side eventually; on 401/422 refresh the secret.
 *
 *   bun run pr-video shots/vice-isle-collision-half.mp4
 *
 * Size limits (GitHub): 10MB video on free plans, 100MB on paid. Formats:
 * mp4, mov, webm (H.264 mp4 is the safe choice — drive --record emits it).
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { uploadPoliciesAssets } from "user-attachments";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const FREE_PLAN_VIDEO_LIMIT = 10 * 1024 * 1024;

/**
 * Normalize the `GH_SESSION_TOKEN` secret into a Cookie header value: accept
 * either the raw `user_session` value or a pasted `name=value; ...` string.
 */
export function sessionCookie(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.includes("=")) return trimmed;
  return `user_session=${trimmed}; __Host-user_session_same_site=${trimmed}`;
}

export function parseOriginRepo(url: string): { owner: string; repo: string } | null {
  const match = url.replace(/\.git$/, "").match(/([^/:]+)\/([^/]+)$/);
  return match === null ? null : { owner: match[1]!, repo: match[2]! };
}

function fail(message: string): never {
  process.stderr.write(`pr-video: ${message}\n`);
  process.exit(1);
}

async function repositoryId(owner: string, repo: string): Promise<number> {
  // Unauthenticated calls 403 from shared egress IPs (cloud proxies, Actions
  // runners) — authenticate with whatever CI token is around when one is set.
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "jgengine-pr-video",
      ...(token !== undefined && token.length > 0 ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) fail(`could not resolve repository id for ${owner}/${repo} (HTTP ${response.status})`);
  const body = (await response.json()) as { id?: number };
  if (typeof body.id !== "number") fail(`no repository id in API response for ${owner}/${repo}`);
  return body.id;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  let repoArg: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--repo") repoArg = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Upload video/image to GitHub user-attachments for INLINE playback in PR bodies.\n\n" +
          "  bun run pr-video <clip.mp4> [more ...] [--repo owner/repo]\n\n" +
          "Needs env GH_SESSION_TOKEN (a github.com user_session cookie of an account\n" +
          "with write access — use a dedicated bot account; see script header).\n" +
          "Paste each printed URL on its own bare line in the PR body/comment.\n",
      );
      process.exit(0);
    } else if (arg.startsWith("-")) fail(`unknown flag: ${arg}`);
    else files.push(arg);
  }
  if (files.length === 0) fail("no files given — pass one or more .mp4/.mov/.webm/.gif/.png");
  for (const file of files) {
    if (!existsSync(file) || !statSync(file).isFile()) fail(`not a file: ${file}`);
    if (!(extname(file).toLowerCase() in CONTENT_TYPES)) {
      fail(`unsupported extension: ${file} (supported: ${Object.keys(CONTENT_TYPES).join(", ")})`);
    }
  }

  const secret = process.env.GH_SESSION_TOKEN;
  if (secret === undefined || secret.trim().length === 0) {
    fail(
      "GH_SESSION_TOKEN is not set. GitHub has no token API for attachment uploads —\n" +
        "inline-playing video requires a github.com session cookie:\n" +
        "  1. log into github.com as a (preferably dedicated) account with repo write access\n" +
        "  2. copy the user_session cookie value from browser devtools\n" +
        "  3. set it as the GH_SESSION_TOKEN env secret in this agent environment\n" +
        "Until then, embed the GIF preview via pr-shots (plays inline) and link the mp4.",
    );
  }

  const origin = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const parsed = repoArg !== null ? parseOriginRepo(repoArg) : parseOriginRepo(origin);
  if (parsed === null) fail(`could not parse owner/repo from ${repoArg ?? origin}`);
  const repoId = await repositoryId(parsed.owner, parsed.repo);
  const cookie = sessionCookie(secret);

  for (const path of files) {
    const bytes = readFileSync(path);
    const type = CONTENT_TYPES[extname(path).toLowerCase()]!;
    if (type.startsWith("video/") && bytes.length > FREE_PLAN_VIDEO_LIMIT) {
      process.stderr.write(
        `pr-video: ${path} is ${(bytes.length / 1_048_576).toFixed(1)}MB — over GitHub's 10MB free-plan video limit; the upload may be rejected unless the repo owner is on a paid plan\n`,
      );
    }
    try {
      const asset = await uploadPoliciesAssets({
        repositoryId: repoId,
        file: new File([bytes], basename(path), { type }),
        cookie,
      });
      process.stdout.write(`${asset.href}\n`);
    } catch (error) {
      fail(
        `upload failed for ${path}: ${error instanceof Error ? error.message : String(error)}\n` +
          "(a 401/422 usually means the GH_SESSION_TOKEN session expired — refresh the secret)",
      );
    }
  }
  process.stderr.write(
    "\npr-video: paste each URL on its OWN BARE LINE in the PR body/comment — GitHub\n" +
      "renders it as an inline video player (wrapping it in a markdown link breaks that).\n",
  );
}
