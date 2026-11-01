import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { gzipSync } from "fflate";

import { curatedJobsIn, lookMirrorName, lookServedPath, parseLookTarget, pullCuratedLook, untarFile } from "./curatedPull";

function tarOf(path: string, body: Uint8Array): Uint8Array {
  const header = new Uint8Array(512);
  header.set(new TextEncoder().encode(path));
  header.set(new TextEncoder().encode(`${body.length.toString(8).padStart(11, "0")}\0`), 124);
  const padded = new Uint8Array(Math.ceil(body.length / 512) * 512);
  padded.set(body);
  return new Uint8Array([...header, ...padded, ...new Uint8Array(1024)]);
}

describe("curated pulls", () => {
  test("finds the looks a game's source names", () => {
    const jobs = curatedJobsIn(`environment: hdriEnvironment("golden-hour"), grade: { lut: lutGrade("cold-teal") }, fonts: libraryFontPairing("oswald", "barlow"), x: lutGrade("nope")`);
    expect(jobs.map((job) => job.target).sort()).toEqual(["look:font/barlow", "look:font/oswald", "look:hdri/golden-hour", "look:lut/cold-teal"]);
    expect(parseLookTarget("look:font/oswald")).toEqual({ kind: "font", id: "oswald" });
    expect(parseLookTarget("polyhaven:x")).toBeUndefined();
  });
  test("pulls a grade locally, an HDRI from the mirror and a font from the npm tarball on a mirror miss", async () => {
    const out = mkdtempSync(join(tmpdir(), "jg-look-"));
    try {
      const woff = new Uint8Array([119, 79, 70, 50, 1, 2, 3]);
      const requested: string[] = [];
      const fetchImpl = Object.assign(async (url: string) => {
        requested.push(url);
        if (url.endsWith(lookMirrorName("hdri", "snow"))) return new Response(new Uint8Array([1, 2, 3]));
        if (url.endsWith(".tgz")) return new Response(gzipSync(tarOf("package/files/oswald-latin-400-normal.woff2", woff)));
        return new Response("no", { status: 404 });
      }, { preconnect: () => undefined });
      await pullCuratedLook("lut", "sepia", { outRoot: out, fetchImpl });
      expect(readFileSync(join(out, lookServedPath("lut", "sepia")), "utf8")).toContain("LUT_3D_SIZE 32");
      await pullCuratedLook("hdri", "snow", { outRoot: out, fetchImpl });
      expect([...readFileSync(join(out, lookServedPath("hdri", "snow")))]).toEqual([1, 2, 3]);
      await pullCuratedLook("font", "oswald", { outRoot: out, fetchImpl });
      expect([...readFileSync(join(out, lookServedPath("font", "oswald")))]).toEqual([...woff]);
      expect(requested.some((url) => url.includes("/@fontsource/oswald/-/oswald-5.3.0.tgz"))).toBe(true);
      expect(() => untarFile(tarOf("a", woff), "b")).toThrow("not in the archive");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
