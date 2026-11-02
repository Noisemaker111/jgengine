import { describe, expect, test } from "bun:test";

import type { FetchLike } from "./download";
import { itchCsrfToken, itchUploads, resolveItchUrl } from "./itchArchive";

const GAME = "https://kaylousberg.itch.io/kaykit-forest";
const gamePage = `<head><meta name="csrf_token" content="tok123"/></head>`;
const downloadPage = `<div class="upload"><a data-upload_id="13520330" class="button download_btn">Download</a><div class="upload_name"><strong title="Free" class="name">Free</strong></div></div><div class="upload"><a data-upload_id="99" class="button">Download</a><strong title="Source" class="name">Source</strong></div>`;

describe("itch page parsing", () => {
  test("reads the csrf token and each upload's title", () => {
    expect(itchCsrfToken(gamePage)).toBe("tok123");
    expect(itchUploads(downloadPage)).toEqual([
      { id: "13520330", title: "Free" },
      { id: "99", title: "Source" },
    ]);
  });
});

describe("resolveItchUrl", () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === GAME) return new Response(gamePage, { headers: { "set-cookie": "itchio_token=abc; Path=/" } });
    if (url === `${GAME}/download_url`) return Response.json({ url: `${GAME}/download/KEY` });
    if (url === `${GAME}/download/KEY`) return new Response(downloadPage);
    if (url.startsWith(`${GAME}/file/13520330`)) {
      const cookie = new Headers(init?.headers).get("cookie");
      return Response.json(cookie === "itchio_token=abc" ? { url: "https://cdn.example/forest.zip" } : { errors: ["no session"] });
    }
    return new Response("", { status: 404 });
  }) as FetchLike;

  test("walks the page flow to the chosen upload's signed URL", async () => {
    expect(await resolveItchUrl({ itch: GAME, upload: "Free" }, fetchImpl)).toBe("https://cdn.example/forest.zip");
    expect(calls.at(-1)).toStartWith(`POST ${GAME}/file/13520330`);
  });

  test("names the uploads it found when the title is missing", async () => {
    await expect(resolveItchUrl({ itch: GAME, upload: "Paid" }, fetchImpl)).rejects.toThrow('no upload titled "Paid" (found: Free, Source)');
  });
});
