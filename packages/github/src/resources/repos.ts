import type { GitHubClient } from "../client";

export interface RepoSummary {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  language: string | null;
  topics: string[];
  license: string | null;
  archived: boolean;
  isFork: boolean;
  createdAt: string;
  pushedAt: string | null;
  url: string;
}

export interface RawRepo {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  license: { name: string } | null;
  archived: boolean;
  fork: boolean;
  created_at: string;
  pushed_at: string | null;
  html_url: string;
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(perPage ?? 30, 100);
}

export function toRepoSummary(raw: RawRepo): RepoSummary {
  return {
    name: raw.name,
    fullName: raw.full_name,
    description: raw.description,
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    watchers: raw.watchers_count,
    openIssues: raw.open_issues_count,
    language: raw.language,
    topics: raw.topics ?? [],
    license: raw.license?.name ?? null,
    archived: raw.archived,
    isFork: raw.fork,
    createdAt: raw.created_at,
    pushedAt: raw.pushed_at,
    url: raw.html_url,
  };
}

export interface ReposOptions {
  sort?: "updated" | "pushed" | "stars";
  perPage?: number;
}

/** List a user's repositories, mapped down to a lean summary shape. */
export async function repos(gh: GitHubClient, user: string, opts: ReposOptions = {}): Promise<RepoSummary[]> {
  const params = new URLSearchParams({ per_page: String(clampPerPage(opts.perPage)) });
  if (opts.sort !== undefined) params.set("sort", opts.sort);
  const raw = await gh.rest<RawRepo[]>(`/users/${encodeURIComponent(user)}/repos?${params.toString()}`);
  return raw.map(toRepoSummary);
}

/** Fetch a single repository by owner/name. */
export async function repo(gh: GitHubClient, owner: string, name: string): Promise<RepoSummary> {
  const raw = await gh.rest<RawRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
  return toRepoSummary(raw);
}

/** Bytes of code per language, as reported by GitHub's linguist pass. */
export async function languages(gh: GitHubClient, owner: string, name: string): Promise<Record<string, number>> {
  return gh.rest<Record<string, number>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/languages`);
}

export interface LanguageShare {
  language: string;
  bytes: number;
  share: number;
}

/** Rank a language→bytes map, attaching each entry's share of the total. */
export function topLanguages(bytes: Record<string, number>, n: number = 5): LanguageShare[] {
  const total = Object.values(bytes).reduce((sum, value) => sum + value, 0);
  return Object.entries(bytes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([language, value]) => ({ language, bytes: value, share: total === 0 ? 0 : value / total }));
}
