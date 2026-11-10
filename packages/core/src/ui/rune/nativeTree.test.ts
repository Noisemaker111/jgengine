import { describe, expect, test } from "bun:test";
import { createContext, createElement as h, useContext } from "../jsx";
import { Root } from "../jsx/reconciler";
import { live } from "../liveValue";
import { RuneValueSlots } from "./valueSlots";
import { RuneNode, nativeLabel, nativeSpec, nativeTreeHost, visibleNativeNodes, type RuneTreeSink } from "./nativeTree";

function fixture() {
  const values = new Float32Array(8192);
  const slots = new RuneValueSlots(() => values);
  const numbers = new Map<string, () => number>();
  const texts = new Map<string, () => string>();
  const sink: RuneTreeSink = {
    setSpec: () => {},
    bindNumber(name, read) { numbers.set(name, read); return slots.slot(name); },
    writeNumber(name, value) { slots.write(name, value); return slots.slot(name); },
    bindText(name, read) { texts.set(name, read); return slots.writeText(name, read()).slots; },
  };
  const surface = new RuneNode("rune-surface");
  let commits = 0;
  const host = nativeTreeHost(() => {});
  const root = new Root({ ...host, commitDone() { commits += 1; } }, surface);
  return { root, surface, sink, slots, numbers, texts, values, commits: () => commits };
}

describe("direct native JSX host", () => {
  test("the top visible modal owns input, and unmounting it restores the previous scope", () => {
    const f = fixture();
    const render = (open: boolean) => f.root.render(h("rune-box", { modal: true },
      h("rune-box", { onPress: () => {}, label: "Menu" }),
      open ? h("rune-box", { modal: true }, h("rune-box", { onPress: () => {}, label: "Close sheet" })) : null,
      h("rune-box", { modal: true, hidden: true }, h("rune-box", { onPress: () => {}, label: "Hidden" }))));
    const controls = () => visibleNativeNodes(f.surface).filter(node => node.props.onPress).map(nativeLabel);
    render(true);
    expect(controls()).toEqual(["Close sheet"]);
    render(false);
    expect(controls()).toEqual(["Menu"]);
    f.root.unmount();
    expect(controls()).toEqual([]);
  });

  test("surface inheritance carries only font props into child elements", () => {
    const f = fixture();
    f.surface.props = { label: "Game", family: "Rajdhani", color: "#ffffff", fill: "#112233", children: "never on the wire" };
    f.root.render(h("rune-box", null, h("rune-text", { color: "#abcdef" }, "Visible")));
    const box = nativeSpec(f.surface, f.sink).children[0];
    expect(box?.props).toEqual({ family: "Rajdhani", color: "#ffffff", interactive: false, focused: false });
    expect(box?.children[0]?.props["color"]).toBe("#abcdef");
    f.root.unmount();
  });

  test("retains context, keyed nodes and text without a DOM or CSS calculation", () => {
    const f = fixture();
    const context = createContext("missing");
    const Label = () => h("rune-text", { size: 20 }, useContext(context));
    const render = (label: string, reverse: boolean) => f.root.render(h(context.Provider, { value: label },
      h("rune-box", { fill: "#123456", padding: [1,2,3,4] },
        ...(reverse ? [h("rune-text", { key: "b" }, "B"), h(Label, { key: "a" })] : [h(Label, { key: "a" }), h("rune-text", { key: "b" }, "B")]))));
    render("A", false);
    const box = f.surface.children[0];
    const first = box?.children[0];
    render("changed", true);
    expect(box?.children[1]).toBe(first);
    const wire = nativeSpec(f.surface, f.sink);
    expect(wire.children[0]?.children.map(child => child.props["text"])).toEqual(["B", "changed"]);
    expect(JSON.stringify(wire)).not.toMatch(/className|cssText|getComputedStyle/);
    f.root.unmount();
    expect(f.surface.children).toHaveLength(0);
  });

  test("live label and meter updates use slots without another component render or commit", () => {
    const f = fixture();
    let value = 9;
    let runs = 0;
    const Hud = () => {
      runs += 1;
      return h("rune-box", null, h("rune-text", { text: live(() => `AIR ${value}`) }), h("rune-dial", { value: live(() => value), max: 110 }));
    };
    f.root.render(h(Hud, null));
    const wire = nativeSpec(f.surface, f.sink);
    const commits = f.commits();
    value = 10;
    for (const [name, read] of f.numbers) f.slots.write(name, read());
    for (const [name, read] of f.texts) f.slots.writeText(name, read());
    expect(runs).toBe(1);
    expect(f.commits()).toBe(commits);
    const dial = wire.children[0]?.children[1];
    const slot = dial?.props["valueSlot"];
    expect(typeof slot).toBe("number");
    if (typeof slot === "number") expect(f.values[slot]).toBe(10);
    f.root.unmount();
  });

  test("hidden trees cannot make a surface modal or bind live values", () => {
    const f = fixture();
    f.root.render(h("rune-box", { hidden: true, modal: true }, h("rune-text", { text: live(() => { throw new Error("hidden binding ran"); }) })));
    expect(nativeSpec(f.surface, f.sink)).toEqual({ children: [], modal: false });
    f.root.unmount();
  });
});
