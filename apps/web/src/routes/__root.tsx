import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { SITE_URL } from "../lib/site";
import appCss from "../styles.css?url";
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import monoWoff2 from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";

const TITLE = "jgengine — TypeScript game engine SDK for AI agents";
const DESCRIPTION =
  "jgengine is a pure-TypeScript game engine SDK on npm (@jgengine/core, jgengine CLI). Not automotive. Tell your agent: Make a game that … with jgengine. Site: jgengine.com · GitHub: Noisemaker111/jgengine.";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "jgengine",
  alternateName: ["JGengine", "@jgengine/core"],
  applicationCategory: "GameEngine",
  operatingSystem: "Web, Node.js",
  programmingLanguage: ["TypeScript", "JavaScript"],
  description: DESCRIPTION,
  url: SITE_URL,
  downloadUrl: "https://www.npmjs.com/package/jgengine",
  codeRepository: "https://github.com/Noisemaker111/jgengine",
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "keywords", content: "jgengine, typescript game engine, javascript game engine, three.js, ai agent game engine, @jgengine/core, npm jgengine" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: "jgengine" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "theme-color", content: "#05070d" },
    ],
    links: [
      { rel: "preload", href: interWoff2, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: monoWoff2, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "canonical", href: SITE_URL },
      { rel: "alternate", type: "text/plain", href: `${SITE_URL}/llms.txt`, title: "llms.txt" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(JSON_LD),
      },
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
