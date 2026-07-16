export interface GitHubClientOptions {
  /**
   * Proxy base (e.g. "/api/github") that holds a server-side token and forwards
   * allowlisted GETs to api.github.com. Required in the browser for private /
   * authed data and for GraphQL; omit for direct public REST.
   */
  endpoint?: string;
  /** Personal access token for DIRECT calls — server/Node only, never shipped to a browser. */
  token?: string;
  /** Injectable fetch (tests, non-browser runtimes). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** @internal */
export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

const API = "https://api.github.com";
const REST_HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "jgengine" };

/**
 * Minimal transport over the GitHub API. `rest`/`graphql` are the two primitives;
 * resource helpers (repos, pullRequests, …) are thin functions built on `rest`.
 * Public reads can go direct; anything private/authed/GraphQL routes through a
 * proxy endpoint that keeps the token server-side.
 */
export interface GitHubClient {
  rest<T>(path: string): Promise<T>;
  /**
   * Direct mode (no `endpoint`): `query` is raw GraphQL text sent with the token.
   * Proxy mode: `query` is the allowlisted operation name — the server owns the
   * actual query text, so the browser never transmits free-form GraphQL.
   */
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

async function unwrapGraphQL<T>(response: Response): Promise<T> {
  if (!response.ok) throw new GitHubError(response.status, `GitHub GraphQL failed (${response.status})`);
  const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (payload.errors?.length) throw new GitHubError(502, payload.errors.map((e) => e.message).join("; "));
  return payload.data as T;
}

/** @internal */
export function createGitHub(options: GitHubClientOptions = {}): GitHubClient {
  const doFetch = options.fetchImpl ?? fetch;
  const { endpoint, token } = options;

  async function rest<T>(path: string): Promise<T> {
    const url = endpoint === undefined ? `${API}${path}` : `${endpoint}?path=${encodeURIComponent(path)}`;
    const headers = endpoint === undefined && token !== undefined ? { ...REST_HEADERS, Authorization: `Bearer ${token}` } : REST_HEADERS;
    const response = await doFetch(url, { headers });
    if (!response.ok) throw new GitHubError(response.status, `GitHub GET ${path} failed (${response.status})`);
    return (await response.json()) as T;
  }

  async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (endpoint === undefined) {
      if (token === undefined) throw new GitHubError(401, "GraphQL requires a token (or a proxy endpoint that holds one).");
      const headers = { ...REST_HEADERS, "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const response = await doFetch(`${API}/graphql`, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
      return unwrapGraphQL<T>(response);
    }
    const response = await doFetch(`${endpoint}?op=${encodeURIComponent(query)}`, {
      method: "POST",
      headers: { ...REST_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ variables }),
    });
    return unwrapGraphQL<T>(response);
  }

  return { rest, graphql };
}
