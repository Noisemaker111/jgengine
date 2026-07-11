import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://jgengine.com/sitemap.xml",
    host: "https://jgengine.com",
  };
}
