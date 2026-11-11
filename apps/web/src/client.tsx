/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * The site's browser entry: finds the page for this URL and draws it into `<body>` over the
 * prerendered HTML, which brings the page's buttons, live demos and menus to life.
 */
import { hydrateRoot } from "@jgengine/core/ui/jsx/client.view";

import { NotFound } from "./components/NotFound";
import { SiteRoot } from "./site/root";
import { matchRoute } from "./site/routes";

const { pathname } = window.location;
const match = matchRoute(pathname);
const page = match === null ? null : (await match.route.load()).Route;
const Body = page?.component ?? NotFound;

hydrateRoot(
  document.body,
  <SiteRoot location={{ pathname, params: match?.params ?? {} }}>
    <Body />
  </SiteRoot>,
);
