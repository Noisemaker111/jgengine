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

export interface PageHead {
  title: string;
  description: string;
  path: string;
}

export const DEFAULT_PAGE_HEAD: PageHead = { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, path: "" };

function setMeta(attribute: "name" | "property", key: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (meta === null) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.append(meta);
  }
  meta.content = content;
}

export function applyPageHead({ title, description, path }: PageHead): void {
  const url = `${SITE_URL}${path}`;
  document.title = title;
  setMeta("name", "description", description);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical === null) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = url;
}

export function applyStructuredData(id: string, data: unknown): () => void {
  let script = document.getElementById(id);
  if (script === null) {
    script = document.createElement("script");
    script.id = id;
    script.setAttribute("type", "application/ld+json");
    document.head.append(script);
  }
  script.textContent = JSON.stringify(data);
  return () => script.remove();
}
