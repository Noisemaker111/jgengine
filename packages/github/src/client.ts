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
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

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
    const url = endpoint === undefined ? `${API}/graphql` : `${endpoint}?path=/graphql`;
    if (endpoint === undefined && token === undefined) {
      throw new GitHubError(401, "GraphQL requires a token (or a proxy endpoint that holds one).");
    }
    const headers: Record<string, string> = { ...REST_HEADERS, "Content-Type": "application/json" };
    if (endpoint === undefined && token !== undefined) headers.Authorization = `Bearer ${token}`;
    const response = await doFetch(url, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
    if (!response.ok) throw new GitHubError(response.status, `GitHub GraphQL failed (${response.status})`);
    const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
    if (payload.errors?.length) throw new GitHubError(502, payload.errors.map((e) => e.message).join("; "));
    return payload.data as T;
  }

  return { rest, graphql };
}
