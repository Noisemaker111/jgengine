import { expect, test } from "bun:test";
import { atomicColumns, groupInlineFlow, paintOrder, type WireBox } from "./cssMirror.view";
import { spawnSync } from "node:child_process";

test("computed paint effects reach the wire without moving URL layers above gradients", () => {
  const source = `
    import { GlobalRegistrator } from "@happy-dom/global-registrator";
    GlobalRegistrator.register();
    const { mirrorElement, MirrorReport } = await import(${JSON.stringify(new URL("./cssMirror.view.ts", import.meta.url).href)});
    const el = document.createElement("div");
    el.style.cssText = 'display:block;width:128px;height:80px;color:rgb(255,255,255);font:24px monospace;filter:brightness(.5) drop-shadow(rgb(255,0,0) 3px 4px 2px);text-decoration:underline;text-decoration-color:rgb(0,255,0);text-decoration-thickness:5px;text-underline-offset:3px;background-image:linear-gradient(rgb(255,0,0),rgb(0,0,255)),url("texture.png"),linear-gradient(rgb(0,255,0),rgb(0,0,0));background-size:auto,16px 16px,auto;background-position:0% 0%;background-repeat:repeat;background-blend-mode:normal';
    el.style.mixBlendMode = 'normal';
    el.style.textDecorationLine = 'underline';
    el.textContent = 'RUNE'; document.body.append(el);
    const box = mirrorElement(el,new MirrorReport());
    console.log(JSON.stringify(box));
    await GlobalRegistrator.unregister();
  `;
  const result = spawnSync(process.execPath, ["--eval", source], { encoding: "utf8", timeout: 10_000 });
  expect(result.status).toBe(0);
  const box = JSON.parse(result.stdout.trim());
  expect(box.fx).toEqual([{ kind: 0, n: .5 }, { kind: 2, sh: [3,4,2,0xff0000ff] }]);
  expect(box.ly).toHaveLength(3);
  expect(box.ly[1]).toMatchObject({ url: "texture.png", bs: [16,0,16,0], rp: [true,true] });
  expect(box.t.sp).toContainEqual({ a: 0, b: 4, u: true, uc: 0x00ff00ff, ut: 5, uo: 3 });
});

test("positioned zero and auto levels paint in tree order between negative and positive layers", () => {
  const children: WireBox[] = [
    { k: "x", id: 1 },
    { k: "x", id: 2, pos: 2, z: 0 },
    { k: "x", id: 3, pos: 2 },
    { k: "x", id: 4, pos: 2, z: 2 },
    { k: "x", id: 5, pos: 2, z: -1 },
  ];
  expect(paintOrder(children).map(child => child.id)).toEqual([5, 1, 2, 3, 4]);
});

test("unbreakable columns retain their blocks and draw centered separating rules", () => {
  const box: WireBox = { k: "x", id: 1, d: 1 };
  const children: WireBox[] = [{ k: "x", id: 2 }, { k: "x", id: 3 }];
  expect(atomicColumns(box, children, 2, 22, 1, 0x221a1259)).toBe(true);
  expect(box["d"]).toBe(2);
  expect(box["gtc"]).toEqual([[1, 0, 3, 1], [1, 0, 3, 1]]);
  expect(box["gap"]).toEqual([22, 0]);
  expect(children[2]).toMatchObject({ pos: 2, ins: ["50%", 0, "auto", 0], w: 1, mg: [-0.5, 0, 0, 0] });
});

test("columns requiring balancing across multiple blocks stay explicitly unsupported", () => {
  const box: WireBox = { k: "x", id: 1, d: 1 };
  const children: WireBox[] = [{ k: "x", id: 2 }, { k: "x", id: 3 }, { k: "x", id: 4 }];
  expect(atomicColumns(box, children, 2, 22, 1, 0x221a1259)).toBe(false);
  expect(box["d"]).toBe(1);
  expect(children).toHaveLength(3);
});

test("a block-level subtitle interrupts inline content even at an intrinsic width", () => {
  const title: WireBox = { k: "x", id: 1, inl: 1 };
  const subtitle: WireBox = { k: "x", id: 2, d: 1 };
  const after: WireBox = { k: "x", id: 3, inl: 1 };
  const boxes = groupInlineFlow([title, subtitle, after], 3);
  expect(boxes).toHaveLength(3);
  expect(boxes[0]?.c).toEqual([title]);
  expect(boxes[1]).toBe(subtitle);
  expect(boxes[2]?.c).toEqual([after]);
  expect(boxes[0]?.["jc"]).toBe(3);
  expect(subtitle["fb"]).toBeUndefined();
});

test("an out-of-flow decoration does not split an inline run", () => {
  const label: WireBox = { k: "x", id: 1, inl: 1 };
  const decoration: WireBox = { k: "x", id: 2, pos: 2 };
  const link: WireBox = { k: "x", id: 3, inl: 1 };
  const boxes = groupInlineFlow([label, decoration, link], 0);
  expect(boxes).toContain(decoration);
  expect(boxes.find((box) => box.id === 0)?.c).toEqual([label, link]);
});
