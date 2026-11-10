import { expect, test, spyOn } from "bun:test";
import { copyBrowserFrame } from "./platform.js";

test("a video copy without backing retains the previous texture and can recover", () => {
    let ready = false;
    const source = { videoWidth: 64, videoHeight: 32 };
    const texture = {};
    const copies = [];
    const queue = { copyExternalImageToTexture(from, to, size) {
        if (!ready) throw new DOMException("video doesn't have back resource", "OperationError");
        copies.push([from, to, size]);
    } };
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    try {
        expect(copyBrowserFrame(queue, texture, source, 64, 32)).toBe(false);
        expect(warning).toHaveBeenCalledWith(expect.stringContaining("degraded:"));
        expect(copies).toHaveLength(0);
        ready = true;
        expect(copyBrowserFrame(queue, texture, source, 64, 32)).toBe(true);
        expect(copies).toEqual([[{ source }, { texture, colorSpace: "srgb", premultipliedAlpha: false }, [64, 32]]]);
    } finally { warning.mockRestore(); }
});

test("unexpected browser image copy errors still fail", () => {
    const queue = { copyExternalImageToTexture() { throw new DOMException("tainted", "SecurityError"); } };
    expect(() => copyBrowserFrame(queue, {}, { videoWidth: 64 }, 64, 32)).toThrow("tainted");
    const brokenCanvas = { copyExternalImageToTexture() { throw new DOMException("canvas lost", "OperationError"); } };
    expect(() => copyBrowserFrame(brokenCanvas, {}, {}, 64, 32)).toThrow("canvas lost");
});
