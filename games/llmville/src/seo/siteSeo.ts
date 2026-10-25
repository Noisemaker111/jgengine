export const SITE_URL = "https://llmville.com";
export const SITE_NAME = "LLMville";
export const SITE_TAGLINE = "Buy GPUs. Train models. Serve tokens.";

export const DEFAULT_DESCRIPTION =
  "Buy GPUs, train LLM models, and serve tokens in a cozy co-op 3D world. Play free in your browser with friends and agents — from garage startup to datacenter.";

export const DEFAULT_TITLE = "LLMville — Buy GPUs, Train Models, Serve Tokens";

export const HOME_PAGE_DESCRIPTION =
  "Continue your world or start fresh. Buy GPUs, train LLM models, and serve tokens in a cozy co-op 3D world.";

export const ABOUT_PAGE_TITLE = "About LLMville";
export const ABOUT_PAGE_DESCRIPTION =
  "Rack GPUs, train language models, serve inference, and grow from garage to datacenter in a cozy co-op 3D browser game.";

export interface PageHeadOptions {
  /** Full document title (shown in tab and search results). */
  title: string;
  description: string;
  /** Path only, e.g. `/` or `/about`. */
  path: string;
}

/** TanStack Router `head` payload for public marketing routes. */
export function pageHead({ title, description, path }: PageHeadOptions) {
  const url = `${SITE_URL}${path}`;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}