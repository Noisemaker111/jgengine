/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, type ReactNode } from "@jgengine/core/ui/jsx";

import { ANALYTICS_LOADER_SCRIPT } from "../lib/analytics";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "../lib/site";
import { THEME_INIT_SCRIPT } from "../lib/theme";
import { LocationContext, type SiteLocation } from "./link";
import type { HeadTags, Tag } from "./routes";

const OG_IMAGE = `${SITE_URL}/og.png`;

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "jgengine",
  alternateName: ["JGengine", "@jgengine/core"],
  applicationCategory: "GameEngine",
  operatingSystem: "Web, Node.js",
  programmingLanguage: ["TypeScript", "JavaScript"],
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  downloadUrl: "https://www.npmjs.com/package/jgengine",
  codeRepository: "https://github.com/Noisemaker111/jgengine",
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

/** The tags every page carries; a page's own `head` replaces the ones it names again. */
export const ROOT_HEAD: HeadTags = {
  meta: [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    { title: SITE_TITLE },
    { name: "description", content: SITE_DESCRIPTION },
    { name: "keywords", content: "jgengine, typescript game engine, javascript game engine, three.js, ai agent game engine, @jgengine/core, npm jgengine" },
    { property: "og:title", content: SITE_TITLE },
    { property: "og:description", content: SITE_DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:url", content: SITE_URL },
    { property: "og:site_name", content: "jgengine" },
    { property: "og:image", content: OG_IMAGE },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: SITE_TITLE },
    { name: "twitter:description", content: SITE_DESCRIPTION },
    { name: "twitter:image", content: OG_IMAGE },
    { name: "theme-color", content: "#0a0c0f", media: "(prefers-color-scheme: dark)" },
    { name: "theme-color", content: "#f2f3f5", media: "(prefers-color-scheme: light)" },
  ],
  links: [
    { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  ],
};

/** The files a page loads: built and hashed in production, Vite's source URLs in dev. */
export interface PageAssets {
  stylesheets: readonly string[];
  fonts: readonly string[];
  modulePreloads: readonly string[];
  /** Module scripts run at the end of `<body>`. */
  scripts: readonly string[];
  /** Production pages only: load the visitor analytics tag on the live host (`src/lib/analytics.ts`). */
  analytics?: boolean;
}

function HeadTag({ tag }: { tag: Tag }) {
  const title = tag["title"];
  if (title !== undefined) return <title>{title}</title>;
  return <meta {...tag} />;
}

/** `</script>` inside inline JSON would end the tag early. */
const inlineJson = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

/** The whole HTML document of one page; the body is drawn again on the client by `SiteRoot`. */
export function Document({ head, assets, children }: { head: HeadTags; assets: PageAssets; children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {head.meta.map((tag, i) => <HeadTag key={`m${i}`} tag={tag} />)}
        {assets.fonts.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        {assets.stylesheets.map((href) => <link key={href} rel="stylesheet" href={href} />)}
        {assets.modulePreloads.map((href) => <link key={href} rel="modulepreload" href={href} />)}
        {head.links.map((tag, i) => <link key={`l${i}`} {...tag} />)}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: inlineJson(JSON_LD) }} />
        {assets.analytics === true ? <script dangerouslySetInnerHTML={{ __html: ANALYTICS_LOADER_SCRIPT }} /> : null}
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        {children}
        {assets.scripts.map((src) => <script key={src} type="module" src={src} />)}
      </body>
    </html>
  );
}

/** Every page's body: provides the location and flags the page ready for screenshot tooling. */
export function SiteRoot({ location, children }: { location: SiteLocation; children: ReactNode }) {
  // Screenshot tooling (jgengine-verify) waits for data-jg-capture="ready". Live canvases
  // mark themselves "pending" in their own (earlier-running) effects and flag ready when drawn.
  useEffect(() => {
    const flags = document.documentElement.dataset;
    if (flags["jgCapture"] !== undefined) return;
    void document.fonts.ready.then(() => {
      flags["jgCapture"] ??= "ready";
    });
  }, []);
  return <LocationContext value={location}>{children}</LocationContext>;
}
