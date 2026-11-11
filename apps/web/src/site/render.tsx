/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * Server side of the site: renders one page to a full HTML document with the engine's own JSX
 * renderer. The dev server calls it per request; the build calls it once per page (prerender).
 */
import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";

import { NotFound } from "../components/NotFound";
import { GAME_IDS } from "../lib/games";
import { Document, ROOT_HEAD, SiteRoot, type PageAssets } from "./root";
import { matchRoute, mergeHead, prerenderPaths } from "./routes";

export type { PageAssets };

export interface RenderedPage {
  status: number;
  html: string;
  /** The page module's source path (`src/routes/…`), or null for the not-found page. */
  source: string | null;
}

/** The document for `pathname`; an unknown path draws the not-found page with status 404. */
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

/** Every page path the build prerenders. */
export function pagePaths(): string[] {
  return prerenderPaths(GAME_IDS);
}
