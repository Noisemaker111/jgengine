/**
 * Decides whether a dev request for a `.md` path should be nudged toward SSR.
 *
 * Background: nitro's dev middleware treats any request whose extension matches
 * its `ASSET_EXT_RE` (which includes `mdx?`, i.e. `.md`) as a static asset unless
 * the request looks like a document navigation. A `.md` SSR *route* fetched by
 * curl / `fetch` / a coding agent then 404s before SSR runs, while `.txt`/`.xml`
 * routes work. `mdSsrRoutesDevPlugin` in `vite.config.ts` tags matching requests
 * as document navigations so nitro routes them to SSR; this pure predicate holds
 * the decision so it can be unit-tested without a live dev server.
 *
 * A `.md` request is routed to SSR only when it is a *virtual* route — nothing on
 * disk backs it. Real `.md` files (a `/src/*.md` module import, a static markdown
 * file, a root README) and Vite-internal URLs keep their normal Vite/nitro handling.
 *
 * @param pathname request path with query/hash already stripped
 * @param fileExists resolves whether the decoded, root-relative path exists on disk
 */
export function shouldRouteMdRequestToSsr(
  pathname: string,
  fileExists: (relPath: string) => boolean,
): boolean {
  if (!pathname.endsWith(".md")) return false;
  // Vite-internal module/fs URLs (`/@vite`, `/@fs`, `/@id`, `/__…`) are never SSR routes.
  if (pathname.startsWith("/@") || pathname.startsWith("/__")) return false;
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.replace(/^\/+/, ""));
  } catch {
    return false;
  }
  if (rel === "" || rel.includes("\0")) return false;
  return !fileExists(rel);
}
