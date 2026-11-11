import { expect, test } from "bun:test";

import { fillPath, matchRoute, mergeHead, pageFile, prerenderPaths } from "./routes";

test("every page path matches its own route, with and without a trailing slash", () => {
  expect(matchRoute("/")?.route.path).toBe("/");
  expect(matchRoute("/why")?.route.path).toBe("/why");
  expect(matchRoute("/games/")?.route.path).toBe("/games");
  expect(matchRoute("/games/deepward")).toMatchObject({ route: { path: "/games/$id" }, params: { id: "deepward" } });
  expect(matchRoute("/nowhere")).toBeNull();
  expect(matchRoute("/games/a/b")).toBeNull();
  expect(matchRoute("/why/more")).toBeNull();
});

test("prerendered pages are written where the asset server finds them without a redirect", () => {
  const paths = prerenderPaths(["deepward", "fernwild"]);
  expect(paths).toContain("/");
  expect(paths).toContain("/games/fernwild");
  expect(paths.every((path) => matchRoute(path) !== null)).toBe(true);
  expect(pageFile("/")).toBe("index.html");
  expect(pageFile("/games")).toBe("games.html");
  expect(pageFile("/games/deepward")).toBe("games/deepward.html");
  expect(fillPath("/games/$id", { id: "odd orbit" })).toBe("/games/odd%20orbit");
});

test("a page's head tags replace the root's by key and keep the rest", () => {
  const merged = mergeHead(
    {
      meta: [{ title: "Root" }, { name: "description", content: "root" }, { name: "theme-color", content: "#000", media: "dark" }, { name: "theme-color", content: "#fff", media: "light" }],
      links: [{ rel: "icon", href: "/favicon.svg" }],
    },
    { meta: [{ title: "Page" }, { property: "og:url", content: "u" }], links: [{ rel: "canonical", href: "https://x/page" }] },
  );
  expect(merged.meta.filter((tag) => "title" in tag)).toEqual([{ title: "Page" }]);
  expect(merged.meta.filter((tag) => tag["name"] === "theme-color")).toHaveLength(2);
  expect(merged.meta).toContainEqual({ name: "description", content: "root" });
  expect(merged.links).toEqual([{ rel: "icon", href: "/favicon.svg" }, { rel: "canonical", href: "https://x/page" }]);
});
