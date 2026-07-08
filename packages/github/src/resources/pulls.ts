/**
 * NOTE: GitHub's pull-request LIST endpoint (`/repos/{owner}/{repo}/pulls`) does
 * NOT include a comment count on each item. Callers that want comments-per-PR
 * should use `issues()` from ./issues instead — the issues endpoint includes
 * pull requests and reports `comments` on every item.
 */
import type { GitHubClient } from "../client";

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  merged: boolean;
  createdAt: string;
  mergedAt: string | null;
  author: string | null;
  headRef: string;
  baseRef: string;
  url: string;
}

interface RawPullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  merged_at: string | null;
  created_at: string;
  user: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
  html_url: string;
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(perPage ?? 30, 100);
}

export function toPullRequestSummary(raw: RawPullRequest): PullRequestSummary {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    draft: raw.draft,
    merged: raw.merged_at !== null,
    createdAt: raw.created_at,
    mergedAt: raw.merged_at,
    author: raw.user?.login ?? null,
    headRef: raw.head.ref,
    baseRef: raw.base.ref,
    url: raw.html_url,
  };
}

export interface PullRequestsOptions {
  state?: "open" | "closed" | "all";
  perPage?: number;
}

/** List pull requests on a repository. See the module note re: comment counts. */
export async function pullRequests(
  gh: GitHubClient,
  owner: string,
  name: string,
  opts: PullRequestsOptions = {},
): Promise<PullRequestSummary[]> {
  const params = new URLSearchParams({ per_page: String(clampPerPage(opts.perPage)), state: opts.state ?? "open" });
  const raw = await gh.rest<RawPullRequest[]>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?${params.toString()}`);
  return raw.map(toPullRequestSummary);
}
