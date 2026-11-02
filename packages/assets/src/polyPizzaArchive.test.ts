import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";

import type { FetchLike } from "./download";
import { parsePolyPizzaBundle, polyPizzaBundleArchive } from "./polyPizzaArchive";

const RES_A = "1083c1d3-d1d4-4682-adf6-bc516d06ac84";
const RES_B = "a8624e73-27bd-4878-a17b-f5d9af209c85";

function card(resource: string, title: string, id: string, license: string): string {
  return `<div><img src="https://static.poly.pizza/${resource}.webp" class="w-full" alt="${title}"/></div><span class="x" to="/m/${id}">${title}</span><a href="/u/Quaternius">Quaternius</a><div class="MuiChip-root"><span class="MuiChip-label MuiChip-labelSmall">${license}</span></div>`;
}

const bundle = (licenseB: string) => `<html>${card(RES_A, "Character Soldier", "PpLF4rt4ah", "CC0")}${card(RES_B, "Sci Fi Character", "4pUXv5V8kq", licenseB)}</html>`;

function fakeFetch(html: string): FetchLike {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://poly.pizza/bundle/")) return new Response(html);
    if (url.endsWith(".glb")) return new Response(new Uint8Array([1, 2, 3]));
    return new Response("", { status: 404 });
  }) as FetchLike;
}

describe("parsePolyPizzaBundle", () => {
  test("reads id, title, resource and licence from each card", () => {
    expect(parsePolyPizzaBundle(bundle("CC-BY"))).toEqual([
      { id: "PpLF4rt4ah", title: "Character Soldier", resource: RES_A, license: "CC0" },
      { id: "4pUXv5V8kq", title: "Sci Fi Character", resource: RES_B, license: "CC-BY" },
    ]);
  });
});

describe("polyPizzaBundleArchive", () => {
  test("zips one glb per model with a licence file", async () => {
    const archive = await polyPizzaBundleArchive({ polyPizzaBundle: "x" }, "CC-BY", 1024, fakeFetch(bundle("CC-BY")));
    const files = unzipSync(archive);
    expect(Object.keys(files).sort()).toEqual(["Character_Soldier.glb", "LICENSE.txt", "Sci_Fi_Character.glb"]);
    expect(strFromU8(files["LICENSE.txt"] ?? new Uint8Array())).toContain("https://poly.pizza/m/4pUXv5V8kq  CC-BY");
  });

  test("refuses a CC0 pack holding a model under another licence", async () => {
    await expect(polyPizzaBundleArchive({ polyPizzaBundle: "x" }, "CC0", 1024, fakeFetch(bundle("CC-BY")))).rejects.toThrow(
      "Sci Fi Character is CC-BY",
    );
  });

  test("refuses a bundle past the byte cap", async () => {
    await expect(polyPizzaBundleArchive({ polyPizzaBundle: "x" }, "CC0", 4, fakeFetch(bundle("CC0")))).rejects.toThrow("byte cap");
  });
});
