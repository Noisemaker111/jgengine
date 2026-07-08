import type { GitHubClient } from "../client";

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  comments: number;
  isPullRequest: boolean;
  createdAt: string;
  closedAt: string | null;
  author: string | null;
  labels: string[];
  url: string;
}

interface RawLabel {
  name?: string;
}

export interface RawIssue {
  number: number;
  title: string;
  state: string;
  comments: number;
  pull_request?: unknown;
  created_at: string;
  closed_at: string | null;
  user: { login: string } | null;
  labels?: (string | RawLabel)[];
  html_url: string;
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(perPage ?? 30, 100);
}

function labelName(label: string | RawLabel): string | undefined {
  return typeof label === "string" ? label : label.name;
}

export function toIssueSummary(raw: RawIssue): IssueSummary {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    comments: raw.comments,
    isPullRequest: raw.pull_request !== undefined,
    createdAt: raw.created_at,
    closedAt: raw.closed_at,
    author: raw.user?.login ?? null,
    labels: (raw.labels ?? []).map(labelName).filter((n): n is string => n !== undefined),
    url: raw.html_url,
  };
}

export interface IssuesOptions {
  state?: "open" | "closed" | "all";
  perPage?: number;
}

/**
 * List issues on a repository. GitHub's `/issues` endpoint also returns pull
 * requests (an item is a PR when it carries a `pull_request` key) — that's
 * reflected in `isPullRequest`, and `comments` is the item's comment count.
 */
export async function issues(gh: GitHubClient, owner: string, name: string, opts: IssuesOptions = {}): Promise<IssueSummary[]> {
  const params = new URLSearchParams({ per_page: String(clampPerPage(opts.perPage)), state: opts.state ?? "open" });
  const raw = await gh.rest<RawIssue[]>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?${params.toString()}`);
  return raw.map(toIssueSummary);
}
