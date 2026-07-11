import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { SITE_URL } from "../lib/site";
import appCss from "../styles.css?url";
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import monoWoff2 from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";

const TITLE = "JGengine — build a game by telling your agent";
const DESCRIPTION =
  "A genre-agnostic, pure-TypeScript game engine SDK. Tell your AI agent: Make a game that … with jgengine. That is the whole interface.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#05070d" },
    ],
    links: [
      { rel: "preload", href: interWoff2, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: monoWoff2, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-[#05070d] text-slate-200 antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
