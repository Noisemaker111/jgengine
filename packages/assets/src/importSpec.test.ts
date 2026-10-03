import { describe, expect, test } from "bun:test";
import { classifyAssetFile, validateImportSpec, type AssetImportKind } from "./importSpec";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const concat = (...parts: Uint8Array[]): Uint8Array => new Uint8Array(parts.flatMap((part) => [...part]));

function header(length: number, magic: Uint8Array, write: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(magic);
  write(new DataView(bytes.buffer));
  return bytes;
}

const gltfJson = '{"asset":{"version":"2.0"}}';
const gltf = text(gltfJson.padEnd(Math.ceil(gltfJson.length / 4) * 4, " "));
const glb = concat(header(20, text("glTF"), (v) => {
  v.setUint32(4, 2, true);
  v.setUint32(8, 20 + gltf.length, true);
  v.setUint32(12, gltf.length, true);
  v.setUint32(16, 0x4e4f534a, true);
}), gltf);
const png = header(33, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), (v) => {
  v.setUint32(8, 13);
  v.setUint32(12, 0x49484452);
  v.setUint32(16, 1);
  v.setUint32(20, 1);
});
const ktx = header(104, new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]), (v) => {
  v.setUint32(20, 1, true);
  v.setUint32(40, 1, true);
});
const wav = header(46, text("RIFF"), (v) => {
  v.setUint32(4, 38, true);
  v.setUint32(8, 0x57415645);
  v.setUint32(12, 0x666d7420);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 44100, true);
  v.setUint32(36, 0x64617461);
  v.setUint32(40, 2, true);
});
const ogg = header(29, text("OggS"), (v) => {
  v.setUint8(26, 1);
  v.setUint8(27, 1);
});
const mp3 = header(417, new Uint8Array([0xff, 0xfb, 0x90, 0]), () => {});
const ttf = header(32, new Uint8Array([0, 1, 0, 0]), (v) => {
  v.setUint16(4, 1);
  v.setUint32(20, 28);
  v.setUint32(24, 4);
});
const otf = ttf.slice();
otf.set(text("OTTO"));
const woff = header(65, text("wOFF"), (v) => { v.setUint32(8, 65); v.setUint16(12, 1); });
const woff2 = header(49, text("wOF2"), (v) => { v.setUint32(8, 49); v.setUint16(12, 1); });
function attribute(name: string, type: string, size: number): Uint8Array {
  return concat(text(`${name}\0${type}\0`), header(4 + size, new Uint8Array(), (v) => v.setUint32(0, size, true)));
}
const exr = concat(header(8, new Uint8Array([0x76, 0x2f, 0x31, 0x01]), (v) => v.setUint32(4, 2, true)), attribute("channels", "chlist", 1), attribute("compression", "compression", 1), attribute("dataWindow", "box2i", 16), new Uint8Array(9));
const hdr = concat(text("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n"), new Uint8Array(4));

const fixtures: [string, Uint8Array, AssetImportKind, number][] = [
  ["GLB", glb, "model", 20], ["glTF JSON", gltf, "model", 15],
  ["PNG", png, "texture", 32], ["JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "texture", 3],
  ["KTX2", ktx, "texture", 80], ["WAV", wav, "audio", 45], ["Ogg", ogg, "audio", 28],
  ["MP3 frame", mp3, "audio", 416], ["ID3 + MP3", concat(text("ID3"), new Uint8Array([4, 0, 0, 0, 0, 0, 0]), mp3), "audio", 10],
  ["TTF", ttf, "font", 28], ["OTF", otf, "font", 28], ["WOFF", woff, "font", 44], ["WOFF2", woff2, "font", 48],
  ["HDR", hdr, "hdri", hdr.length - 4], ["EXR", exr, "hdri", exr.length - 1],
  ["sprite sheet object", text('{"frames":{"hero":{"frame":{"x":0,"y":0}}}}'), "spriteSheet", 10],
  ["sprite sheet array", text('{"frames":[{"filename":"hero"}]}'), "spriteSheet", 10],
];

describe("asset import spec", () => {
  test("preserves game-owned paths, custom roles and independent JSON metadata", () => {
    const meta = { license: "custom", author: "game", tags: ["hero"], placement: { anchor: [0, 1, 0] } };
    const spec = { id: "my-game/hero.v2", kind: "material", files: [{ path: "materials/My Hero/base.color.png", role: "base color" }, { path: "materials/My Hero/normal.png", role: "custom-normal" }], meta };
    const result = validateImportSpec(spec);
    expect(result).toEqual({ ok: true, entry: spec });
    if (!result.ok) throw new Error(result.reason);
    meta.tags.push("changed");
    spec.files[0]!.path = "changed.png";
    expect(result.entry.meta!.tags).toEqual(["hero"]);
    expect(result.entry.files[0]!.path).toBe("materials/My Hero/base.color.png");
    expect(JSON.parse(JSON.stringify(result.entry))).toEqual(result.entry);
  });

  for (const kind of ["model", "texture", "material", "sprite", "spriteSheet", "audio", "font", "hdri"]) {
    test(`accepts authored ${kind} imports without rewriting`, () => {
      expect(validateImportSpec({ id: "hero", kind, files: [{ path: "game/hero.bin" }] }).ok).toBe(true);
    });
  }

  test("rejects malformed untrusted shapes", () => {
    const valid = { id: "hero", kind: "model", files: [{ path: "hero.glb" }] };
    for (const value of [null, 42, [], { ...valid, kind: "unknown" }, { ...valid, files: [] }, { ...valid, files: [null] }, { ...valid, files: [{ path: 12 }] }, { ...valid, files: Array(1) }]) {
      expect(validateImportSpec(value).ok).toBe(false);
    }
  });

  test("rejects unsafe ids and file paths without rejecting dotted filenames", () => {
    for (const id of ["", "../hero", "hero/../escape", "hero/./file", "hero//file", "hero/", "hero\\file"]) {
      expect(validateImportSpec({ id, kind: "model", files: [{ path: "hero.glb" }] }).ok).toBe(false);
    }
    for (const path of ["", "/root.glb", "C:/root.glb", "C:\\root.glb", "//host/file.glb", "../escape.glb", "a/../escape.glb", "a/./file.glb", "a//file.glb", "a/", "a\\file.glb", "%2e%2e/file.glb", "file.glb?x", "file.glb#x", " file.glb", "file\0.glb"]) {
      expect(validateImportSpec({ id: "hero", kind: "model", files: [{ path }] }).ok).toBe(false);
    }
    expect(validateImportSpec({ id: "hero..v2", kind: "model", files: [{ path: "models/hero..v2.glb" }] }).ok).toBe(true);
  });

  test("rejects duplicate paths and malformed roles", () => {
    for (const role of [null, 2, {}, "", " role", "role\n"]) {
      expect(validateImportSpec({ id: "hero", kind: "model", files: [{ path: "hero.glb", role }] }).ok).toBe(false);
    }
    expect(validateImportSpec({ id: "hero", kind: "model", files: [{ path: "hero.glb" }, { path: "hero.glb", role: "other" }] }).ok).toBe(false);
  });

  test("rejects lossy, cyclic and non-JSON metadata", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const accessor = { get value() { throw new Error("must not execute"); } };
    const accessorArray = [0];
    Object.defineProperty(accessorArray, "0", { enumerable: true, get() { throw new Error("must not execute"); } });
    for (const meta of [null, [], new Date(), { value: undefined }, { value: NaN }, { value: Infinity }, { value: 1n }, { value: () => {} }, { value: Symbol() }, { value: new Date() }, { value: Array(1) }, { [Symbol()]: 1 }, cycle, accessor, { value: accessorArray }]) {
      expect(validateImportSpec({ id: "hero", kind: "model", files: [{ path: "hero.glb" }], meta }).ok).toBe(false);
    }
  });

  test("accepts shared JSON values but bounds nested metadata", () => {
    const shared = { tags: ["hero"] };
    expect(validateImportSpec({ id: "hero", kind: "model", files: [{ path: "hero.glb" }], meta: { left: shared, right: shared } }).ok).toBe(true);
    let nested: Record<string, unknown> = {};
    for (let i = 0; i < 66; i += 1) nested = { child: nested };
    expect(validateImportSpec({ id: "hero", kind: "model", files: [{ path: "hero.glb" }], meta: nested }).ok).toBe(false);
  });
});

describe("asset byte classification", () => {
  for (const [name, bytes, kind, truncated] of fixtures) {
    test(`${name}: bytes win over absent or wrong extensions`, () => {
      for (const filename of ["asset", "wrong.exe", "wrong.png", "wrong.mp3"]) expect(classifyAssetFile(bytes, filename)).toBe(kind);
    });
    test(`${name}: rejects truncated header/container`, () => {
      expect(classifyAssetFile(bytes.subarray(0, truncated), "pretend.png")).toBeNull();
    });
  }

  test("extensions never classify corrupt bytes, empty files or HTML fallbacks", () => {
    for (const extension of ["glb", "gltf", "png", "jpg", "jpeg", "ktx2", "wav", "ogg", "mp3", "ttf", "otf", "woff", "woff2", "hdr", "exr", "json"]) {
      for (const bytes of [new Uint8Array(), new Uint8Array([1, 2, 3]), text("<!doctype html><html>fallback</html>")]) {
        expect(classifyAssetFile(bytes, `asset.${extension}`)).toBeNull();
      }
    }
  });

  test("JSON requires valid glTF version or non-null, nonempty frame data", () => {
    for (const value of [{}, { asset: {} }, { asset: { version: "1.0" } }, { asset: { version: 2 } }, { frames: null }, { frames: "hero" }, { frames: {} }, { frames: [] }]) {
      expect(classifyAssetFile(text(JSON.stringify(value)), "asset.gltf")).toBeNull();
    }
    expect(classifyAssetFile(concat(new Uint8Array([0xef, 0xbb, 0xbf]), text(" \n"), gltf), "asset.bin")).toBe("model");
    expect(classifyAssetFile(new Uint8Array([0x7b, 0xff, 0x7d]), "asset.json")).toBeNull();
  });

  test("rejects malformed binary headers", () => {
    const corrupt = (bytes: Uint8Array, change: (view: DataView) => void): void => {
      const copy = bytes.slice();
      change(new DataView(copy.buffer));
      expect(classifyAssetFile(copy, "asset.bin")).toBeNull();
    };
    corrupt(glb, (v) => v.setUint32(4, 1, true));
    corrupt(glb, (v) => v.setUint32(8, 9999, true));
    corrupt(glb, (v) => v.setUint32(16, 0, true));
    corrupt(png, (v) => v.setUint32(16, 0));
    corrupt(ktx, (v) => v.setUint32(40, 9999, true));
    corrupt(wav, (v) => v.setUint32(40, 100, true));
    corrupt(ogg, (v) => v.setUint8(4, 1));
    corrupt(ttf, (v) => v.setUint32(20, 1000));
    corrupt(woff2, (v) => v.setUint16(14, 1));
    corrupt(exr, (v) => v.setUint32(4, 1, true));
    for (const sync of [[0xff, 0xff, 0xff, 0xff], [0xff, 0xe0, 0, 0], [0xff, 0xfb, 0, 0], [0xff, 0xfb, 0x9c, 0]]) expect(classifyAssetFile(new Uint8Array(sync), "asset.mp3")).toBeNull();
    expect(classifyAssetFile(concat(text("ID3"), new Uint8Array([4, 0, 0, 0xff, 0, 0, 0]), mp3), "asset.mp3")).toBeNull();
  });

  test("handles views into larger buffers", () => {
    const wrapped = concat(new Uint8Array([9, 9, 9]), glb, new Uint8Array([9]));
    expect(classifyAssetFile(wrapped.subarray(3, 3 + glb.length), "hero.glb")).toBe("model");
  });
});
