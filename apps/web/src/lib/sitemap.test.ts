import { expect, test } from "bun:test";

import { listGameIds } from "../../vite.site";
import { PAGE_ROUTES, prerenderPaths } from "../site/routes";
import { buildSitemap } from "./sitemap";
import { SITE_URL } from "./site";

// The same inputs the build's sitemap uses: the page table and the games index that `/games` lists.
const gameIds = listGameIds();
const xml = buildSitemap(prerenderPaths(gameIds));
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] as string);

test("the sitemap lists every game page the /games page links", () => {
  expect(gameIds.length).toBeGreaterThan(0);
  for (const id of gameIds) expect(locs).toContain(`${SITE_URL}/games/${id}`);
});

test("the sitemap lists every fixed public page, /decisions included", () => {
  for (const route of PAGE_ROUTES.filter((page) => !page.path.includes("$"))) {
    expect(locs).toContain(route.path === "/" ? SITE_URL : `${SITE_URL}${route.path}`);
  }
  expect(locs).toContain(`${SITE_URL}/decisions`);
  expect(locs).toHaveLength(new Set(locs).size);
});

test("the sitemap leaves out the runner, the API, agent files, route patterns and the not-found page", () => {
  for (const loc of locs) {
    const path = loc.slice(SITE_URL.length);
    expect(path).not.toMatch(/^\/(play|api|404|llms[^/]*|agents\.md)(\/|$)/);
    expect(path).not.toContain("$");
    expect(path).not.toMatch(/\.[a-z]+$/);
  }
});

test("a new game is listed without touching the sitemap", () => {
  const grown = buildSitemap(prerenderPaths([...gameIds, "brand-new-game"]));
  expect(grown).toContain(`<loc>${SITE_URL}/games/brand-new-game</loc>`);
});
