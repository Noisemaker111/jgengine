/** @jsxImportSource @jgengine/core/ui/jsx */
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
