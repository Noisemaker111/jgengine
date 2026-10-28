import { describe, expect, test } from "bun:test";
import { NodeIO } from "@gltf-transform/core";
import { strToU8, zipSync } from "fflate";

import { readGlbDims } from "./dims";
import { extractPackModels } from "./packModelConvert";

const CUBE_OBJ = `mtllib Crate.mtl
v 0 0 0
v 1 0 0
v 1 2 0
v 0 2 0
v 0 0 1
v 1 0 1
v 1 2 1
v 0 2 1
usemtl Wood
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 4 3 7 8
`;

const CRATE_MTL = `newmtl Wood
Kd 0.8 0.4 0.1
map_Kd Textures/wood.png
`;

describe("extractPackModels", () => {
  test("an OBJ-only pack becomes one GLB per model, in metres, with its MTL colour", async () => {
    const archive = zipSync({
      "Pack/OBJ/Crate.obj": strToU8(CUBE_OBJ),
      "Pack/OBJ/Crate.mtl": strToU8(CRATE_MTL),
      "Pack/Blends/Crate.blend": strToU8("not a model"),
    });
    const { models, images } = await extractPackModels(archive);
    expect(models.map((model) => model.file)).toEqual(["Crate.glb"]);
    expect(images).toEqual([]);
    const glb = models[0]?.bytes ?? new Uint8Array();
    const dims = readGlbDims(glb);
    expect(dims?.maxY).toBeCloseTo(2, 5);
    expect(dims?.footprint.w).toBeCloseTo(1, 5);
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0];
    expect(material?.getName()).toBe("Wood");
    // MTL colours are sRGB; glTF stores linear.
    expect(material?.getBaseColorFactor()[0]).toBeCloseTo(0.604, 2);
    // The map's file is not in the archive, so the colour stays and no texture is invented.
    expect(material?.getBaseColorTexture()).toBeNull();
  });

  test("a pack that ships glTF is taken as it is, never converted", async () => {
    const gltf = { asset: { version: "2.0" }, scenes: [{ nodes: [0] }], scene: 0, nodes: [{ name: "Empty" }] };
    const archive = zipSync({ "glTF/Thing.gltf": strToU8(JSON.stringify(gltf)), "OBJ/Thing.obj": strToU8(CUBE_OBJ) });
    const { models } = await extractPackModels(archive);
    expect(models.map((model) => model.file)).toEqual(["Thing.glb"]);
    expect(readGlbDims(models[0]?.bytes ?? new Uint8Array())).toBeNull();
  });
});
