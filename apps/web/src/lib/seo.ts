import { SITE_URL } from "./site";

const OG_IMAGE = `${SITE_URL}/og.png`;

export function seo({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description?: string;
  path?: string;
  image?: string;
}) {
  const url = path === undefined || path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  const img = image ?? OG_IMAGE;
  const meta = [
    { title },
    ...(description ? [{ name: "description", content: description }] : []),
    { property: "og:title", content: title },
    ...(description ? [{ property: "og:description", content: description }] : []),
    { property: "og:url", content: url },
    { property: "og:image", content: img },
    { name: "twitter:title", content: title },
    ...(description ? [{ name: "twitter:description", content: description }] : []),
    { name: "twitter:image", content: img },
  ];
  const links = [{ rel: "canonical", href: url }];
  return { meta, links };
}
