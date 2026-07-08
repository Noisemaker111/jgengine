import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { SITE_URL } from "../lib/site";
import appCss from "../styles.css?url";

const TITLE = "JGengine — build a game by telling your agent";
const DESCRIPTION =
  "A genre-agnostic, pure-TypeScript game engine SDK. Install the skills, prompt your AI agent, and it builds the whole game. Point your agent at this site to load the skills.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
