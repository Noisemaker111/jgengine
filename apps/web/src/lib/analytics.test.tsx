/** @jsxImportSource @jgengine/core/ui/jsx */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";

import { Document, ROOT_HEAD, type PageAssets } from "../site/root";
import { ANALYTICS_HOST, ANALYTICS_LOADER_SCRIPT, DATABUDDY_CLIENT_ID, DATABUDDY_SCRIPT_SRC, trackEvent } from "./analytics";

const assets = (analytics?: boolean): PageAssets => ({
  stylesheets: [],
  fonts: [],
  modulePreloads: [],
  scripts: [],
  ...(analytics === undefined ? {} : { analytics }),
});

const page = (analytics?: boolean): string =>
  renderToStaticMarkup(
    <Document head={ROOT_HEAD} assets={assets(analytics)}>
      <p>body</p>
    </Document>,
  );

test("production pages carry the Databuddy loader in <head>; dev and test pages do not", () => {
  const built = page(true);
  const head = built.slice(0, built.indexOf("</head>"));
  expect(head).toContain(DATABUDDY_CLIENT_ID);
  expect(head).toContain(DATABUDDY_SCRIPT_SRC);
  expect(page()).not.toContain(DATABUDDY_CLIENT_ID);
  expect(page(false)).not.toContain(DATABUDDY_SCRIPT_SRC);
});

test("the loader runs only on the live host and adds the tag async with Databuddy's attributes", () => {
  expect(ANALYTICS_HOST).toBe("jgengine.com");
  expect(ANALYTICS_LOADER_SCRIPT.startsWith(`if(location.hostname==="jgengine.com")`)).toBe(true);
  expect(ANALYTICS_LOADER_SCRIPT).toContain("s.async=true");
  expect(ANALYTICS_LOADER_SCRIPT).toContain(`s.crossOrigin="anonymous"`);
  expect(ANALYTICS_LOADER_SCRIPT).toContain(`"data-track-web-vitals"`);
  expect(ANALYTICS_LOADER_SCRIPT).toContain(`"data-track-errors"`);
  expect(() => new Function(ANALYTICS_LOADER_SCRIPT)).not.toThrow();
});

test("trackEvent is a no-op where no tracker is loaded", () => {
  expect(() => trackEvent("game_play", { game: "fernwild" })).not.toThrow();
});
