import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "../lib/site";

const STATIC_PATHS = ["/", "/why", "/capabilities", "/editor"];

function buildSitemap(): string {
  const body = STATIC_PATHS.map((path) => {
    const loc = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
    return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(buildSitemap(), {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        }),
    },
  },
});
