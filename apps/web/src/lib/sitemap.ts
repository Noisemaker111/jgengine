import { SITE_URL } from "./site";

const STATIC_PATHS = ["/", "/why", "/decisions", "/playground", "/games", "/docs", "/adopt", "/cookbook"];

/** `/sitemap.xml`: the site's fixed pages. */
export function buildSitemap(): string {
  const body = STATIC_PATHS.map((path) => {
    const loc = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
    return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
