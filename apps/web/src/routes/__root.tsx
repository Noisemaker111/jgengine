import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { SITE_URL } from "../lib/site";
import appCss from "../styles.css?url";
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import monoWoff2 from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";

const TITLE = "JGengine — Build Games With One Prompt";
const DESCRIPTION =
  "Build complete browser games with a single prompt. JGengine is a pure-TypeScript game engine and skill system designed for Claude Code, Cursor, Codex, Copilot, and other AI coding agents.";
const SOCIAL_IMAGE = `${SITE_URL}/og-image.png`;

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "JGengine",
  alternateName: ["jgengine", "@jgengine/core"],
  applicationCategory: "GameEngine",
  applicationSubCategory: "AI-assisted game development",
  operatingSystem: "Web, Node.js",
  programmingLanguage: ["TypeScript", "JavaScript"],
  description: DESCRIPTION,
  url: SITE_URL,
  image: SOCIAL_IMAGE,
  downloadUrl: "https://www.npmjs.com/package/jgengine",
  codeRepository: "https://github.com/Noisemaker111/jgengine",
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
  featureList: [
    "Pure-TypeScript game engine",
    "Skills for AI coding agents",
    "Browser game scaffolding",
    "Automated verification workflow",
    "Composable engine packages",
  ],
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "application-name", content: "JGengine" },
      { name: "author", content: "JGengine" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { name: "keywords", content: "jgengine, TypeScript game engine, AI coding agent, AI game development, browser game engine, Claude Code, Cursor, Codex, Copilot, @jgengine/core" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: "JGengine" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: SOCIAL_IMAGE },
      { property: "og:image:secure_url", content: SOCIAL_IMAGE },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "JGengine — Build games with one prompt" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: SOCIAL_IMAGE },
      { name: "twitter:image:alt", content: "JGengine — Build games with one prompt" },
      { name: "theme-color", content: "#05070d" },
    ],
    links: [
      { rel: "preload", href: interWoff2, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: monoWoff2, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
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
      <body className="min-h-dvh bg-[#05070d] text-slate-200 antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
