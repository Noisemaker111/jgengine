/**
 * The site's Cloudflare Worker. Pages and files are static assets, served before the Worker runs;
 * the Worker answers the GitHub API proxy, the agent text files (`/llms.txt`, `/llms-full.txt`,
 * `/agents.md`, `/sitemap.xml`), and anything else with the prerendered not-found page and a 404.
 */
import { githubContributions, githubProxy } from "./api/github";
import { buildLlmsFullTxt, buildLlmsTxt } from "./lib/agentDocs";
import { buildSitemap } from "./lib/sitemap";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const text = (build: () => string, type: string) => (): Response =>
  new Response(build(), { headers: { "Content-Type": `${type}; charset=utf-8` } });

type Handler = (request: Request) => Response | Promise<Response>;

/** Path → method → handler. */
const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/github-proxy": { GET: githubProxy, POST: githubProxy },
  "/api/github-contributions": { GET: githubContributions },
  "/llms.txt": { GET: text(buildLlmsTxt, "text/plain") },
  "/llms-full.txt": { GET: text(buildLlmsFullTxt, "text/plain") },
  // The agent brief as markdown (the AGENTS.md convention), from the same source as llms-full.txt.
  "/agents.md": { GET: text(buildLlmsFullTxt, "text/markdown") },
  "/sitemap.xml": { GET: text(buildSitemap, "application/xml") },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];
    if (route !== undefined) {
      const handler = route[request.method] ?? (request.method === "HEAD" ? route["GET"] : undefined);
      if (handler === undefined) return new Response("Method Not Allowed", { status: 405, headers: { Allow: Object.keys(route).join(", ") } });
      return handler(request);
    }
    // `/404` (not `/404.html`): the asset server would redirect the .html name to it.
    const page = await env.ASSETS.fetch(new Request(new URL("/404", url), { headers: request.headers }));
    return new Response(page.body, { status: 404, headers: page.headers });
  },
};
