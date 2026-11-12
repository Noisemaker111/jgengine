import { SITE_URL } from "./site";

/**
 * `/sitemap.xml` for the given page paths. The build passes every page it prerenders
 * (`pagePaths()` in `src/site/render.tsx`: the page table plus one page per game under `games/`),
 * so a new page or game is listed the moment it is built. Only public pages are in that table;
 * the game runner (`/play`), the API and the agent text files are not pages.
 */
export function buildSitemap(paths: readonly string[]): string {
  const body = paths
    .map((path) => {
      const loc = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
