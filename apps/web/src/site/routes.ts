import type { ReactNode } from "@jgengine/core/ui/jsx";

export type Params = Readonly<Record<string, string>>;

export type Tag = Readonly<Record<string, string>>;

export interface HeadTags {
  meta: readonly Tag[];
  links: readonly Tag[];
}

export interface PageDefinition {
  head: (input: { params: Params }) => HeadTags;
  component: () => ReactNode;
}

export function definePage(page: PageDefinition): PageDefinition {
  return page;
}

export interface SiteRoute {
  path: string;
  source: string;
  load: () => Promise<{ Route: PageDefinition }>;
}

export const PAGE_ROUTES: readonly SiteRoute[] = [
  { path: "/", source: "src/routes/index.tsx", load: () => import("../routes/index") },
  { path: "/why", source: "src/routes/why.tsx", load: () => import("../routes/why") },
  { path: "/decisions", source: "src/routes/decisions.tsx", load: () => import("../routes/decisions") },
  { path: "/playground", source: "src/routes/playground.tsx", load: () => import("../routes/playground") },
  { path: "/games", source: "src/routes/games.index.tsx", load: () => import("../routes/games.index") },
  { path: "/games/$id", source: "src/routes/games.$id.tsx", load: () => import("../routes/games.$id") },
  { path: "/docs", source: "src/routes/docs.tsx", load: () => import("../routes/docs") },
  { path: "/adopt", source: "src/routes/adopt.tsx", load: () => import("../routes/adopt") },
  { path: "/cookbook", source: "src/routes/cookbook.tsx", load: () => import("../routes/cookbook") },
];

export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** The page at `pathname` and its `$` parameters, or null when no page is there. */
export function matchRoute(pathname: string): { route: SiteRoute; params: Params } | null {
  const segments = (path: string): string[] => (path === "/" ? [""] : path.split("/"));
  const parts = segments(normalizePath(pathname));
  for (const route of PAGE_ROUTES) {
    const pattern = segments(route.path);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pattern.length; i += 1) {
      const want = pattern[i] as string;
      const part = parts[i] as string;
      if (want.startsWith("$")) {
        if (part === "") ok = false;
        else params[want.slice(1)] = decodeURIComponent(part);
      } else if (want !== part) ok = false;
      if (!ok) break;
    }
    if (ok) return { route, params };
  }
  return null;
}

export function fillPath(to: string, params: Params = {}): string {
  return to.replace(/\$([A-Za-z0-9_]+)/g, (_all, name: string) => encodeURIComponent(params[name] ?? ""));
}

export function prerenderPaths(gameIds: readonly string[]): string[] {
  return PAGE_ROUTES.flatMap((route) =>
    route.path.includes("$") ? gameIds.map((id) => fillPath(route.path, { id })) : [route.path],
  );
}

/** The file a prerendered page is written to under the client output: `/` is index.html, `/why` is why.html. */
export function pageFile(path: string): string {
  return path === "/" ? "index.html" : `${normalizePath(path).slice(1)}.html`;
}

export function mergeHead(root: HeadTags, page: HeadTags): HeadTags {
  const metaKey = (tag: Tag): string =>
    "title" in tag ? "title" : "charSet" in tag ? "charSet" : `${tag["name"] ?? tag["property"] ?? ""}|${tag["media"] ?? ""}`;
  const meta = new Map<string, Tag>();
  for (const tag of [...root.meta, ...page.meta]) {
    const key = metaKey(tag);
    meta.delete(key);
    meta.set(key, tag);
  }
  const linkKey = (tag: Tag): string => (tag["rel"] === "canonical" ? "canonical" : `${tag["rel"] ?? ""}|${tag["href"] ?? ""}`);
  const links = new Map<string, Tag>();
  for (const tag of [...root.links, ...page.links]) links.set(linkKey(tag), tag);
  return { meta: [...meta.values()], links: [...links.values()] };
}
