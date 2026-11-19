/** @jsxImportSource @jgengine/core/ui/jsx */
import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";

import { NotFound } from "../components/NotFound";
import { GAME_IDS } from "../lib/games";
import { buildSitemap } from "../lib/sitemap";
import { Document, ROOT_HEAD, SiteRoot, type PageAssets } from "./root";
import { matchRoute, mergeHead, prerenderPaths } from "./routes";

export type { PageAssets };

export interface RenderedPage {
  status: number;
  html: string;
  source: string | null;
}

export async function renderPage(pathname: string, assets: (source: string | null) => PageAssets): Promise<RenderedPage> {
  const match = matchRoute(pathname);
  const page = match === null ? null : (await match.route.load()).Route;
  const params = match?.params ?? {};
  const head = page === null ? ROOT_HEAD : mergeHead(ROOT_HEAD, page.head({ params }));
  const source = match?.route.source ?? null;
  const Body = page?.component ?? NotFound;
  const markup = renderToStaticMarkup(
    <Document head={head} assets={assets(source)}>
      <SiteRoot location={{ pathname, params }}>
        <Body />
      </SiteRoot>
    </Document>,
  );
  return { status: page === null ? 404 : 200, html: `<!DOCTYPE html>${markup}`, source };
}

export function pagePaths(): string[] {
  return prerenderPaths(GAME_IDS);
}

/** `/sitemap.xml`: exactly the pages the build prerenders, so every game page is listed as soon as it exists. */
export function renderSitemap(): string {
  return buildSitemap(pagePaths());
}
