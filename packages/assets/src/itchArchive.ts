import type { FetchLike } from "./download";
import type { ItchDownload } from "./manifest";

const USER_AGENT = "Mozilla/5.0 (jgengine asset mirror)";

/** An itch.io JSON reply: a `url` on success, `errors` otherwise. */
function itchReply(body: unknown): { url?: string; errors?: string[] } {
  if (typeof body !== "object" || body === null) return {};
  const url = "url" in body && typeof body.url === "string" ? body.url : undefined;
  const errors = "errors" in body && Array.isArray(body.errors) ? body.errors.filter((error): error is string => typeof error === "string") : undefined;
  return { ...(url === undefined ? {} : { url }), ...(errors === undefined ? {} : { errors }) };
}

/** The `csrf_token` an itch.io page carries in its meta tag or form. @internal */
export function itchCsrfToken(html: string): string | undefined {
  return /name="csrf_token" content="([^"]+)"/.exec(html)?.[1] ?? /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];
}

/** Each upload on an itch.io download page: its id and its title. @internal */
export function itchUploads(html: string): { id: string; title: string }[] {
  const uploads: { id: string; title: string }[] = [];
  for (const match of html.matchAll(/data-upload_id="(\d+)"/g)) {
    const id = match[1];
    if (id === undefined) continue;
    const after = html.slice(match.index, match.index + 1500);
    const title = /class="name"[^>]*>([^<]+)</.exec(after)?.[1] ?? /title="([^"]+)"/.exec(after)?.[1];
    if (title !== undefined) uploads.push({ id, title: title.trim() });
  }
  return uploads;
}

/**
 * The signed file URL for a free itch.io upload. It walks the page's own flow: the game page sets
 * a session cookie and token, `download_url` returns the download page that lists the uploads,
 * and the file endpoint returns a short-lived CDN link for the chosen one. @internal
 */
export async function resolveItchUrl(download: ItchDownload, fetchImpl: FetchLike = fetch): Promise<string> {
  const page = download.itch.replace(/\/+$/, "");
  const cookies = new Map<string, string>();
  const remember = (response: Response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0] ?? "";
      const at = pair.indexOf("=");
      if (at > 0) cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
  };
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    "user-agent": USER_AGENT,
    cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; "),
    ...extra,
  });
  const form = { "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest" };

  const gamePage = await fetchImpl(page, { headers: headers() });
  if (!gamePage.ok) throw new Error(`${page}: HTTP ${gamePage.status}`);
  remember(gamePage);
  const csrf = itchCsrfToken(await gamePage.text());
  if (csrf === undefined) throw new Error(`${page}: no csrf token on the game page`);

  const downloadUrl = await fetchImpl(`${page}/download_url`, { method: "POST", headers: headers(form), body: new URLSearchParams({ csrf_token: csrf }) });
  remember(downloadUrl);
  const listing = itchReply(await downloadUrl.json());
  if (listing.url === undefined) throw new Error(`${page}/download_url: ${listing.errors?.join(", ") ?? "no url"} (is the game free?)`);

  const downloadPage = await fetchImpl(listing.url, { headers: headers() });
  remember(downloadPage);
  const uploads = itchUploads(await downloadPage.text());
  const upload = uploads.find((candidate) => candidate.title === download.upload);
  if (upload === undefined) {
    throw new Error(`${page}: no upload titled "${download.upload}" (found: ${uploads.map((candidate) => candidate.title).join(", ") || "none"})`);
  }

  const file = await fetchImpl(`${page}/file/${upload.id}?source=view_game&as_props=1&after_download_lightbox=true`, {
    method: "POST",
    headers: headers(form),
    body: new URLSearchParams({ csrf_token: csrf }),
  });
  const signed = itchReply(await file.json());
  if (signed.url === undefined) throw new Error(`${page}/file/${upload.id}: ${signed.errors?.join(", ") ?? "no url"}`);
  return signed.url;
}
