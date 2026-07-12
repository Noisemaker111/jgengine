import { createFileRoute } from "@tanstack/react-router";

import { GAMES } from "../content/games";
import { SKILL_SLUGS } from "../content/skills";
import { PACKAGES, SITE_URL } from "../lib/site";

const STATIC_PATHS = ["/", "/games", "/skills", "/api", "/components", "/llms.txt"];

function packageSlug(name: string): string {
  return name.replace(/^@jgengine\//, "");
}

function buildSitemap(): string {
  const paths = [
    ...STATIC_PATHS,
    ...GAMES.map((game) => `/games/${game.id}`),
    ...SKILL_SLUGS.map((slug) => `/skills/${slug}`),
    ...PACKAGES.map((pkg) => `/api/${packageSlug(pkg.name)}`),
  ];
  const body = paths
    .map((path) => {
      const loc = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
      return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
    })
    .join("\n");
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
