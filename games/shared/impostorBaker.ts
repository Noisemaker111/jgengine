import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import { chromium, type Browser, type Page } from "playwright-core";

import type { BakedImpostorPixels, ImpostorBaker } from "../../packages/assets/src/modelLodBuild";
import { chromeGraphicsArgs, findChromeExecutable } from "../../scripts/browser-lib";

/**
 * Bakes impostor atlases in one headless Chromium page with the engine's own `bakeImpostor`
 * (`impostorBake.page.ts`), so a baked atlas and a runtime bake match pixel for pixel. Files are
 * served to the page from disk under one fake origin; nothing listens on a port. Software GL
 * (SwiftShader) is slow but enough for a bake.
 */
export interface ImpostorBakerHandle {
  readonly bake: ImpostorBaker;
  close(): Promise<void>;
}

const ORIGIN = "http://jg-bake.local";
const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ktx2": "image/ktx2",
  ".webp": "image/webp",
};

async function pageBundle(): Promise<string> {
  const built = await Bun.build({ entrypoints: [join(import.meta.dir, "../../packages/assets/src/impostorBake.page.ts")], target: "browser", minify: false });
  const output = built.outputs[0];
  if (!built.success || output === undefined) throw new Error(`impostor bake page did not build: ${built.logs.map(String).join("\n")}`);
  return output.text();
}

/** Start the baker; `root` is the folder every baked file sits under. */
export async function startImpostorBaker(root: string): Promise<ImpostorBakerHandle> {
  const script = await pageBundle();
  const browser: Browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox", ...chromeGraphicsArgs()] });
  const page: Page = await browser.newPage();
  const base = resolve(root);
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") {
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" });
      return;
    }
    const file = resolve(join(base, path));
    if (!file.startsWith(base) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }
    await route.fulfill({ contentType: TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", body: readFileSync(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ content: script, type: "module" });
  await page.waitForFunction(() => "jgBakeImpostor" in window, undefined, { timeout: 60_000 });
  const bake: ImpostorBaker = async (file, frames, cell) => {
    const relative = resolve(file).slice(base.length).split("\\").join("/");
    const answer = await page.evaluate(
      async ({ url, frames, cell }) => {
        const run: unknown = Reflect.get(window, "jgBakeImpostor");
        if (typeof run !== "function") return null;
        const result: unknown = await run(url, frames, cell);
        return result === null || typeof result !== "object" ? null : JSON.stringify(result);
      },
      { url: `${ORIGIN}${relative}`, frames, cell },
    );
    if (answer === null) return null;
    return decodeAnswer(JSON.parse(answer));
  };
  return {
    bake,
    async close() {
      await browser.close();
    },
  };
}

function decodeAnswer(value: unknown): BakedImpostorPixels | null {
  if (typeof value !== "object" || value === null) return null;
  const size: unknown = Reflect.get(value, "size");
  const albedo: unknown = Reflect.get(value, "albedo");
  const normal: unknown = Reflect.get(value, "normal");
  const center: unknown = Reflect.get(value, "center");
  const radius: unknown = Reflect.get(value, "radius");
  if (typeof size !== "number" || typeof albedo !== "string" || typeof normal !== "string" || typeof radius !== "number") return null;
  if (!Array.isArray(center) || center.length !== 3 || !center.every((part) => typeof part === "number")) return null;
  const [x, y, z] = center;
  return {
    size,
    albedo: new Uint8Array(Buffer.from(albedo, "base64")),
    normal: new Uint8Array(Buffer.from(normal, "base64")),
    center: [Number(x), Number(y), Number(z)],
    radius,
  };
}
