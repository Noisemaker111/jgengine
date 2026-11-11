import { expect, test } from "bun:test";
import { createRuneFlow, ownRuneFlow, bind, runeFormat, runePulse, runeTween, runeViewportClass } from "./primitives";
import { RuneActivation, runeNextFocus } from "./activation";
import { createGameContext } from "../../runtime/gameContext";
import { defineGameDefinition } from "../../game/defineGame";
import { playControlsActive, suspendPlayControls } from "../../game/controlGate";

const routes = { pause: { layer: "screen",pause:true,capture:true }, bag: { layer:"modal",pause:false,capture:true }, message: {layer:"overlay",pause:false,capture:false} } as const;

test("flow replaces atomically, validates before mutation and round trips the shared stack",() => {
  const flow = createRuneFlow(routes), seen: string[][] = [];
  flow.subscribe(() => seen.push(flow.read().map(e => e.kind)));
  flow.push("pause"); flow.push("bag"); flow.replace("message",{text:"Ready"});
  expect(seen).toEqual([["pause"],["pause","bag"],["pause","message"]]);
  const saved = flow.snapshot();
  expect(() => flow.replace("unknown")).toThrow("Unknown Rune route");
  expect(flow.snapshot()).toEqual(saved);
  flow.clear(); flow.restore(saved);
  expect(flow.read().map(e => e.kind)).toEqual(["pause","message"]);
  expect(flow.read()[1]?.payload).toEqual({text:"Ready"});
  expect(() => flow.restore({...saved,entries:[{record:{id:"bad",kind:"unknown"},openedAt:0}]})).toThrow();
  expect(flow.snapshot()).toEqual(saved);
});

test("nested flows preserve other pause and control owners in either release order",() => {
  for (const prePaused of [true,false]) {
    const ctx = createGameContext({definition:defineGameDefinition({name:"Rune flow",multiplayer:"off",persist:false}),player:{userId:"player",isNew:true}});
    if (prePaused) ctx.time.pause(); else ctx.time.play();
    const outside = suspendPlayControls(ctx), a = createRuneFlow(routes), b = createRuneFlow(routes);
    const releaseA = ownRuneFlow(a,ctx), releaseB = ownRuneFlow(b,ctx);
    a.push("pause"); b.push("pause");
    expect(ctx.time.isPaused()).toBe(true); expect(playControlsActive(ctx)).toBe(false);
    releaseA(); releaseA(); a.pop();
    expect(ctx.time.isPaused()).toBe(true); expect(playControlsActive(ctx)).toBe(false);
    b.clear(); releaseB();
    expect(ctx.time.isPaused()).toBe(prePaused); expect(playControlsActive(ctx)).toBe(false);
    outside(); expect(playControlsActive(ctx)).toBe(true);
  }
});

test("display bindings settle, format at the leaf, and never mutate the underlying value",() => {
  let value = 10, time = 0;
  const tween = runeTween(() => value,100,() => time), pulse = runePulse(() => value,100,() => time);
  const text = runeFormat(bind(() => value),n => `Air ${n}`);
  expect(tween.get()).toBe(10); expect(pulse.get()).toBe(0);
  value = 30;
  expect(tween.get()).toBe(10); expect(pulse.get()).toBe(1); expect(text.get()).toBe("Air 30");
  time = 50; expect(tween.get()).toBe(27.5); expect(pulse.get()).toBe(.5);
  time = 1000; expect(tween.get()).toBe(30); expect(pulse.get()).toBe(0); expect(value).toBe(30);
  expect([390,800,1280].map(n => runeViewportClass(n))).toEqual(["phone","tablet","desktop"]);
});

test("holds reject early release, cancellation and a different control",() => {
  let now = 0; const hold = new RuneActivation(() => now);
  hold.begin("burn",600); now = 599; expect(hold.end("burn")).toBe(false);
  hold.begin("burn",600); now = 1200; expect(hold.end("burn")).toBe(true);
  hold.begin("burn"); expect(hold.end("other")).toBe(false);
  hold.begin("burn"); expect(hold.end("burn",true)).toBe(false);
  hold.begin("burn"); hold.cancel(); expect(hold.end("burn")).toBe(false);
});

test("directional navigation follows the painted grid rather than document order",() => {
  const a = {rect:[0,0,80,40] as const}, b = {rect:[100,0,80,40] as const}, c = {rect:[0,60,80,40] as const};
  expect(runeNextFocus(a,[a,b,c],n => n.rect,"right")).toBe(b);
  expect(runeNextFocus(a,[a,b,c],n => n.rect,"down")).toBe(c);
  expect(runeNextFocus(b,[a,b,c],n => n.rect,"left")).toBe(a);
});
