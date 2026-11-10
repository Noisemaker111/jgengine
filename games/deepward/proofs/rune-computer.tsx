/** @jsxImportSource @jgengine/core/ui/jsx */
import { writeFile } from "node:fs/promises";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { DiveComputer } from "../src/game/ui/VisorHud";

const root = new RuneNode("rune-surface");
root.props = { family: "Rajdhani", color: "#e8fbf5" };
const tree = new Root(nativeTreeHost(() => {}), root, "fixture", false);
tree.render(<DiveComputer oxygen={() => 87} health={() => 92} rail={() => 23} tank={110} sealed={false} low={false} hurt={false} body={{ food: () => 70, water: () => 65 }} seal={{ mark: 1, pressure: 1, crushing: false }} />);
const unused = () => { throw new Error("sampled fixture must not allocate slots"); };
const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
const output = process.argv[2];
if (output === undefined) throw new Error("usage: bun games/deepward/proofs/rune-computer.tsx <spec.json>");
await writeFile(output, JSON.stringify(nativeSpec(root, sink, true)));
tree.unmount();
