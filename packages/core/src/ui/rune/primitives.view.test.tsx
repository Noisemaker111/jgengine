/** @jsxImportSource @jgengine/core/ui/jsx */
import { expect, test } from "bun:test";
import { act, useState } from "../jsx";
import { Root } from "../jsx/reconciler";
import { RuneAction, RuneField, RuneFor, RuneLabel, RuneLayers, RuneRoot, RuneView, RuneWorldAnchor, type RuneRootProps } from "./primitives.view";
import { bind, createRuneFlow, type RuneSource, type RuneTheme } from "./primitives";
import { RuneViewport } from "./elements.view";
import { nativeEnabled, nativeLabel, nativeSpec, nativeTreeHost, RuneNode, visibleNativeNodes, type RuneTreeSink } from "./nativeTree";
import type { ReactNode } from "../jsx";
import { createGameContext } from "../../runtime/gameContext";
import { defineGameDefinition } from "../../game/defineGame";

const theme: RuneTheme = {colors:{ink:"#abcdef"},text:{body:{size:16,color:"#abcdef"},label:{size:12}},variants:{surface:{fill:"#123456",padding:12}},motion:{duration:0,distance:0,bounce:0}};
function fixture(children: ReactNode, project?: (target: {entity?: string}) => {x:number;y:number;visible:boolean}, options: Pick<RuneRootProps,"context" | "localise"> = {}) {
  const container = new RuneNode("container"), root = new Root(nativeTreeHost(() => {}),container);
  root.render(<RuneViewport width={390} height={844}><RuneRoot theme={theme} safeArea={[10,20,30,40]} {...options} {...(project === undefined ? {} : {project})}>{children}</RuneRoot></RuneViewport>);
  const surface = container.children[0];
  if (surface === undefined) throw new Error("Missing native surface");
  const numbers = new Map<string,() => number>(), texts = new Map<string,() => string>(), props = new Map<string,() => unknown>();
  const sink: RuneTreeSink = {setSpec:() => {},bindNumber:(id,read) => {numbers.set(id,read);return numbers.size;},writeNumber:() => 0,bindText:(id,read) => {texts.set(id,read);return {n:0,u:[]};},bindProp:(id,field,read) => {props.set(`${id}:${field}`,read);return read();}};
  return {root,surface,numbers,texts,props,spec:() => nativeSpec(surface,sink)};
}

test("all visual properties bind at their own leaves without component renders",() => {
  let value = 1, enabled = true, runs = 0;
  function Game() {
    runs++;
    return <RuneView variant="surface" width={bind(() => ({fraction:value/10}))} border={bind(() => ({width:value,color:"#abcdef"}))}>
      <RuneLabel value={bind(() => value)} format={n => `Life ${n}`} size={bind(() => value*10)} />
      <RuneAction disabled={bind(() => !enabled)} run={() => {value++;}}>Act</RuneAction>
    </RuneView>;
  }
  const f = fixture(<Game />), wire = f.spec();
  expect(wire.children.length).toBe(1);
  const reads = () => [...f.props].map(([id,get]) => [id.split(":").pop(),get()]);
  expect(reads()).toContainEqual(["width",{fraction:.1}]);
  value = 2; enabled = false;
  expect(reads()).toContainEqual(["width",{fraction:.2}]);
  expect(reads()).toContainEqual(["size",20]);
  expect(reads()).toContainEqual(["disabled",true]);
  expect([...f.texts.values()].map(get => get())).toContain("Life 2");
  expect(runs).toBe(1);
  const action = visibleNativeNodes(f.surface).find(n => nativeLabel(n) === "Act");
  expect(action === undefined ? true : nativeEnabled(action)).toBe(false);
  f.root.unmount();
});

test("screen transitions hide covered screens, restore back input, and update restored payloads",async () => {
  const flow = createRuneFlow({first:{layer:"screen",pause:false,capture:true},second:{layer:"screen",pause:false,capture:true}});
  flow.push("first","Original");
  const f = fixture(<RuneLayers flow={flow}>{entry => <RuneLabel value={String(entry.payload ?? entry.kind)} />}</RuneLayers>);
  await act(() => flow.push("second"));
  expect(JSON.stringify(f.spec())).not.toContain("Original");
  await act(() => flow.pop());
  await act(async () => {await new Promise(resolve => setTimeout(resolve,5));});
  expect(JSON.stringify(f.spec())).toContain("Original");
  const saved = flow.snapshot();
  flow.restore({...saved,entries:saved.entries.map(e => ({...e,record:{...e.record,payload:"Restored"}}))});
  await act(() => {});
  expect(JSON.stringify(f.spec())).toContain("Restored");
  const back = visibleNativeNodes(f.surface).find(n => n.props.onBack !== undefined);
  await act(() => back?.props.onBack?.());
  await act(async () => {await new Promise(resolve => setTimeout(resolve,5));});
  expect(flow.read()).toHaveLength(0);
  f.root.unmount();
});

test("commands, translated rich text and mixed text children stay in the native subtree",() => {
  const ctx = createGameContext({definition:defineGameDefinition({name:"Native commands",multiplayer:"off",persist:false}),player:{userId:"player",isNew:true}});
  let equipped = "";
  ctx.game.commands.define<{id:string}>("equip",{apply:(_ctx,input) => {equipped = input.id;}});
  const f = fixture(<><RuneAction command={{name:"equip",input:{id:"rifle"}}}>{"Equip"} ›</RuneAction><RuneLabel message="welcome" params={{name:"Marrow"}} rich={[{start:0,end:7,color:"#abcdef"}]} /></>,undefined,{context:ctx,localise:(key,p) => key === "welcome" ? `Welcome ${p?.["name"]}` : key});
  const controls = visibleNativeNodes(f.surface).filter(n => n.props.onPress !== undefined);
  expect(controls).toHaveLength(1);
  const action = controls[0];
  expect(action?.children).toHaveLength(1);
  expect(action === undefined ? "" : nativeLabel(action)).toBe("Equip ›");
  action?.props.onPress?.();expect(equipped).toBe("rifle");
  expect(JSON.stringify(f.spec())).toContain("Welcome Marrow");
  f.root.unmount();
});

test("responsive safe anchoring and projected visibility use native layout points",() => {
  let visible = true;
  const f = fixture(<><RuneView anchor="bottom-left" safe inset={5} layout="grid" columns={4} responsive={{phone:{columns:2}}}><RuneLabel value="Bag" /></RuneView><RuneWorldAnchor entity="target"><RuneLabel value="World" /></RuneWorldAnchor></>,target => ({x:target.entity === "target" ? 80 : 0,y:40,visible}));
  const wire = f.spec();
  const holder = wire.children[0]?.children[0];
  expect(holder?.props["pin"]).toEqual([45,15,25,35]);
  expect(holder?.children[0]?.props["columns"]).toBe(2);
  expect([...f.numbers.values()].map(get => get())).toEqual([80,40]);
  visible = false;
  expect([...f.props.values()].map(get => get())).toContain(true);
  const world = visibleNativeNodes(f.surface).find(n => nativeLabel(n) === "World");
  expect(world).toBeUndefined();
  f.root.unmount();
});

test("subscribed collection edits preserve keyed nodes and leave unrelated components alone",async () => {
  let items = [{id:"a",label:"A"},{id:"b",label:"B"}], runs = 0;
  const listeners = new Set<() => void>();
  const source: RuneSource<{id:string;label:string}> = {read:() => items,subscribe:fn => {listeners.add(fn);return () => {listeners.delete(fn);};}};
  function Unrelated() {runs++;return <RuneLabel value="Untouched" />;}
  const f = fixture(<><Unrelated /><RuneView><RuneFor source={source} keyBy={i => i.id}>{i => <RuneLabel value={i.label} />}</RuneFor></RuneView></>);
  const first = visibleNativeNodes(f.surface).find(n => n.tag === "rune-text" && nativeLabel(n) === "A");
  await act(() => {items = [...items].reverse();for (const listener of listeners) listener();});
  expect(visibleNativeNodes(f.surface).filter(n => n.tag === "rune-text").map(nativeLabel)).toEqual(["Untouched","B","A"]);
  expect(visibleNativeNodes(f.surface).find(n => n.tag === "rune-text" && nativeLabel(n) === "A")).toBe(first);
  expect(runs).toBe(1);
  f.root.unmount();expect(listeners.size).toBe(0);
});

test("a native field is controlled: typing echoes without a rev, game replacements and cuts take a new rev",async () => {
  const changes: string[] = [], submits: string[] = [];
  let set: (text: string) => void = () => {};
  function Chat() {
    const [text,setText] = useState("");
    set = setText;
    return <RuneField value={text} maxLength={5} placeholder="Say" label="Chat" onChange={next => {changes.push(next);setText(next);}} onSubmit={line => submits.push(line)} />;
  }
  const f = fixture(<Chat />);
  const field = () => {
    const node = visibleNativeNodes(f.surface).find(n => n.tag === "rune-field");
    if (node === undefined) throw new Error("Missing native field");
    return node;
  };
  const wire = () => JSON.stringify(f.spec());
  const props = () => { const spec = f.spec(); const find = (nodes: typeof spec.children): Record<string, unknown> | undefined => { for (const n of nodes) { if (n.kind === "field") return n.props; const hit = find(n.children); if (hit) return hit; } return undefined; }; return find(spec.children) ?? {}; };
  expect(props()["rev"]).toBe(0);
  expect(props()["placeholder"]).toBe("Say");
  // Only wire props Rune accepts: no callbacks, no maxLength.
  for (const leaked of ["onChange","onSubmit","onReplace","onEdit","maxLength"]) expect(wire()).not.toContain(leaked);
  // Rune's first edit event echoes the seeded text; nothing changes.
  await act(() => field().props.onEdit?.(""));
  expect(changes).toEqual([]);
  await act(() => field().props.onEdit?.("hey"));
  expect(changes).toEqual(["hey"]);
  expect(props()["rev"]).toBe(0);
  expect(props()["value"]).toBe("hey");
  // The game clears the line after a send: Rune must take the empty text.
  await act(() => set(""));
  expect(props()["rev"]).toBe(1);
  expect(props()["value"]).toBe("");
  // Longer than maxLength: the game gets the cut text and Rune is told to show it.
  await act(() => field().props.onEdit?.("abcdefg"));
  expect(changes.at(-1)).toBe("abcde");
  expect(props()["rev"]).toBe(2);
  // The phone proxy's text replaces Rune's.
  await act(() => field().props.onReplace?.("yo"));
  expect(changes.at(-1)).toBe("yo");
  expect(props()["rev"]).toBe(3);
  field().props.onSubmit?.("hello world");
  expect(submits).toEqual(["hello"]);
  f.root.unmount();
});
