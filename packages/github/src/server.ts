import type { ContributionsWire } from "./wire";

export type { ContributionsWire } from "./wire";

const USERNAME_PATTERN = /^[A-Za-z0-9-]{1,39}$/;

const API = "https://api.github.com";

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=600",
};

/** Thrown by resolveContributions when the user does not exist (→ 404). */
export class GitHubUserNotFoundError extends Error {}

interface GraphQLDay {
  date: string;
  contributionCount: number;
  weekday: number;
}

interface GraphQLResponse {
  data?: {
    user: {
      login: string;
      name: string | null;
      avatarUrl: string | null;
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number;
          weeks: { contributionDays: GraphQLDay[] }[];
        };
      };
    } | null;
  };
  errors?: { message: string }[];
}

async function fetchViaGraphQL(user: string, token: string): Promise<ContributionsWire> {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        login
        name
        avatarUrl
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount weekday } }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "jgengine" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL API responded with ${res.status}`);

  const payload = (await res.json()) as GraphQLResponse;
  if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join("; "));
  if (!payload.data?.user) throw new GitHubUserNotFoundError(user);

  const { login, name, avatarUrl, contributionsCollection } = payload.data.user;
  const calendar = contributionsCollection.contributionCalendar;
  return {
    source: "graphql",
    profile: { login, name, avatarUrl },
    total: calendar.totalContributions,
    weeks: calendar.weeks.map((week) => ({
      days: week.contributionDays.map((day) => ({ date: day.date, count: day.contributionCount, weekday: day.weekday })),
    })),
  };
}

function parseTooltipCounts(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  const pattern = /<tool-tip[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const [, id, text] = match;
    const countMatch = text!.match(/(\d+)\s+contributions?/i);
    counts.set(id!, /no contributions/i.test(text!) ? 0 : countMatch ? Number(countMatch[1]) : 0);
  }
  return counts;
}

export function parseContributionsHtml(html: string): { date: string; count: number; weekday: number }[] {
  const tooltipCounts = parseTooltipCounts(html);
  const days: { date: string; count: number; weekday: number }[] = [];
  const cellPattern = /<td[^>]*id="([^"]*)"[^>]*data-date="([^"]+)"[^>]*data-level="(\d+)"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(html)) !== null) {
    const [, id, date] = match;
    days.push({ date: date!, count: tooltipCounts.get(id!) ?? 0, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() });
  }
  return days;
}

async function fetchViaScrape(user: string): Promise<ContributionsWire> {
  const res = await fetch(`https://github.com/users/${encodeURIComponent(user)}/contributions`, {
    headers: { "User-Agent": "jgengine" },
  });
  if (res.status === 404) throw new GitHubUserNotFoundError(user);
  if (!res.ok) throw new Error(`GitHub responded with ${res.status}`);

  const days = parseContributionsHtml(await res.text());
  const weeks: ContributionsWire["weeks"] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push({ days: days.slice(i, i + 7) });
  return {
    source: "scrape",
    profile: { login: user, name: null, avatarUrl: null },
    total: days.reduce((sum, day) => sum + day.count, 0),
    weeks,
  };
}

/** Server-side: fetch a user's contribution calendar via GraphQL (with token) or HTML scrape. */
export function resolveContributions(user: string, options: { token?: string } = {}): Promise<ContributionsWire> {
  return options.token ? fetchViaGraphQL(user, options.token) : fetchViaScrape(user);
}

/**
 * Turnkey proxy handler — mount at any route in any Web-`Response` server (Nitro,
 * workers, Deno). Reads `?user=`, validates, proxies GitHub, returns JSON + CORS.
 */
export function githubContributionsHandler(options: { token?: string } = {}): (request: Request) => Promise<Response> {
  return async (request) => {
    const user = new URL(request.url).searchParams.get("user");
    if (!user || !USERNAME_PATTERN.test(user)) {
      return json({ error: "Query param 'user' must be a valid GitHub username." }, 400);
    }
    try {
      return json(await resolveContributions(user, options));
    } catch (error) {
      if (error instanceof GitHubUserNotFoundError) return json({ error: `GitHub user '${user}' was not found.` }, 404);
      return json({ error: error instanceof Error ? error.message : "Upstream failure" }, 502);
    }
  };
}

export interface GitHubProxyOptions {
  /** Server-side token; forwarded as `Authorization: Bearer` so private/authed reads work. */
  token?: string;
  /** Optional allowlist over the requested REST path; return false to reject (403). GET-only is always enforced. */
  allowPath?: (path: string) => boolean;
}

function proxyHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "jgengine" };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function passthrough(upstream: Response): Promise<Response> {
  const headers: Record<string, string> = { ...RESPONSE_HEADERS };
  const link = upstream.headers.get("link");
  if (link !== null) headers.Link = link;
  return new Response(await upstream.text(), { status: upstream.status, headers });
}

/**
 * General read-only GitHub proxy: forwards `?path=/...` GETs (and GraphQL POSTs
 * to `/graphql`) to api.github.com with the server-side token. Host-locked and
 * GET-only, so it can only ever READ GitHub — never an open proxy, never a write.
 * Mount once and every client resource routes through it.
 */
export function githubProxyHandler(options: GitHubProxyOptions = {}): (request: Request) => Promise<Response> {
  return async (request) => {
    const path = new URL(request.url).searchParams.get("path");
    if (path === null || !path.startsWith("/")) {
      return json({ error: "Query param 'path' must be an absolute GitHub API path." }, 400);
    }
    if (options.allowPath !== undefined && !options.allowPath(path)) {
      return json({ error: `Path '${path}' is not allowed.` }, 403);
    }
    try {
      if (path === "/graphql" || path.startsWith("/graphql?")) {
        if (request.method !== "POST") return json({ error: "GraphQL requires POST." }, 405);
        const upstream = await fetch(`${API}/graphql`, {
          method: "POST",
          headers: { ...proxyHeaders(options.token), "Content-Type": "application/json" },
          body: await request.text(),
        });
        return passthrough(upstream);
      }
      if (request.method !== "GET") return json({ error: "Only GET reads are proxied." }, 405);
      return passthrough(await fetch(`${API}${path}`, { headers: proxyHeaders(options.token) }));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Upstream failure" }, 502);
    }
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}
