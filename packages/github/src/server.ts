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
  const cellPattern = /<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(html)) !== null) {
    const [tag, date] = match;
    const id = tag.match(/\bid="([^"]*)"/)?.[1];
    const count = id !== undefined ? tooltipCounts.get(id) ?? 0 : 0;
    days.push({ date: date!, count, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() });
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
  if (days.length === 0) {
    throw new Error(`Could not read '${user}'’s contribution calendar — GitHub may have blocked the request or changed its page markup.`);
  }
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
  /**
   * REST path allowlist — return true to forward a `?path=` GET. Every path is
   * rejected (403) unless this says otherwise; omitting it denies everything.
   * There is no "allow all" default, so a bare mount can never become an open proxy.
   */
  allowPath?: (path: string) => boolean;
  /**
   * GraphQL allowlist, keyed by operation name, holding the exact query text the
   * server sends upstream for that name. Callers pick an `?op=` name and supply
   * only `variables`; they never send query text, so an unlisted or forged query
   * can't reach GitHub. Omitting this disables GraphQL entirely.
   */
  graphqlOperations?: Record<string, string>;
  /** Injectable fetch (tests, non-browser runtimes). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const PROXY_RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
};

function proxyHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "jgengine" };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function passthrough(upstream: Response): Promise<Response> {
  const headers: Record<string, string> = { ...PROXY_RESPONSE_HEADERS };
  const link = upstream.headers.get("link");
  if (link !== null) headers.Link = link;
  return new Response(await upstream.text(), { status: upstream.status, headers });
}

function proxyJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: PROXY_RESPONSE_HEADERS });
}

async function handleGraphQLOp(request: Request, op: string, options: GitHubProxyOptions): Promise<Response> {
  if (request.method !== "POST") return proxyJson({ error: "GraphQL requires POST." }, 405);
  const query = options.graphqlOperations?.[op];
  if (query === undefined) return proxyJson({ error: `GraphQL operation '${op}' is not allowed.` }, 403);
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const { variables } = (await request.json().catch(() => ({}))) as { variables?: Record<string, unknown> };
    const upstream = await doFetch(`${API}/graphql`, {
      method: "POST",
      headers: { ...proxyHeaders(options.token), "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    return passthrough(upstream);
  } catch (error) {
    return proxyJson({ error: error instanceof Error ? error.message : "Upstream failure" }, 502);
  }
}

/**
 * Named-operation GitHub proxy: forwards only the REST paths and GraphQL
 * operations the caller explicitly allowlists, using the server-side token.
 * Clients never supply raw GraphQL text or an unconstrained path — a bare
 * mount with no `allowPath`/`graphqlOperations` forwards nothing at all.
 */
export function githubProxyHandler(options: GitHubProxyOptions = {}): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const op = url.searchParams.get("op");
    if (op !== null) return handleGraphQLOp(request, op, options);

    const path = url.searchParams.get("path");
    if (path === null || !path.startsWith("/")) {
      return proxyJson({ error: "Query param 'path' must be an absolute GitHub API path." }, 400);
    }
    if (path === "/graphql" || path.startsWith("/graphql?")) {
      return proxyJson({ error: "Use '?op=<name>' for GraphQL, not '?path=/graphql'." }, 403);
    }
    if (!(options.allowPath?.(path) ?? false)) {
      return proxyJson({ error: `Path '${path}' is not allowed.` }, 403);
    }
    if (request.method !== "GET") return proxyJson({ error: "Only GET reads are proxied." }, 405);
    const doFetch = options.fetchImpl ?? fetch;
    try {
      return await passthrough(await doFetch(`${API}${path}`, { headers: proxyHeaders(options.token) }));
    } catch (error) {
      return proxyJson({ error: error instanceof Error ? error.message : "Upstream failure" }, 502);
    }
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}
