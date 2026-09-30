import { describe, expect, test } from "bun:test";
import { createPresentationDiagnosticOwnership, createPresentationRetryRegistry, deferUnhandledPresentationError, PresentationRecovery } from "./presentationRecovery";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

describe("presentation retry ownership", () => {
  test("recovered presentation retires only its exact error diagnostics", () => {
    const owned = createPresentationDiagnosticOwnership();
    const error = new Error("asset failed");
    const other = new Error("asset failed");
    owned.register(error, 1, "presentation"); owned.register(error, 2, "presentation");
    owned.register(error, 3, "driver"); owned.register(other, 4, "presentation");
    expect([...owned.recovered(error)]).toEqual([1, 2]);
    expect([...owned.recovered(error)]).toEqual([]);
    expect([...owned.recovered(other)]).toEqual([4]);
  });

  test("only the restored owner's draw retires its error, once; replacement and another failure retain diagnostics", () => {
    const ctx = {} as GameContext;
    const recovered: unknown[] = [];
    const props = { ctx, children: null, onRuntimeError: () => {}, onRecoveredDraw: (error: unknown) => recovered.push(error) };
    const boundary = new PresentationRecovery(props);
    boundary.setState = (next) => { boundary.state = { ...boundary.state, ...(typeof next === "function" ? next(boundary.state, boundary.props) : next) }; };
    const scope = () => (boundary.render() as { props: { value: { recoveredDraw(): void; fail(error: unknown): void } } }).props.value;
    const retry = () => (boundary.render() as { props: { retry(): void } }).props.retry();
    const initial = scope();
    initial.recoveredDraw(); expect(recovered).toEqual([]);
    const first = new Error("first material failure");
    initial.fail(first); retry(); initial.recoveredDraw(); initial.recoveredDraw();
    expect(recovered).toEqual([first]);
    const replaced = new Error("previous context material failure");
    initial.fail(replaced); retry();
    boundary.props = { ...props, ctx: {} as GameContext };
    const reset = PresentationRecovery.getDerivedStateFromProps(boundary.props, boundary.state);
    boundary.state = { ...boundary.state, ...reset }; initial.recoveredDraw(); scope().recoveredDraw();
    expect(recovered).toEqual([first]);
    const current = scope(); current.fail(new Error("retried material failure")); retry();
    const final = new Error("a second failure before drawing"); current.fail(final); current.recoveredDraw();
    expect(recovered).toEqual([first]); retry(); current.recoveredDraw();
    expect(recovered).toEqual([first, final]);
  });

  test("only a committed retry of the same live owner restores gameplay focus", () => {
    const ctx = {} as GameContext;
    let restored = 0;
    const props = { ctx, children: null, onRuntimeError: () => {}, onRetryCommitted: () => { restored++; } };
    const boundary = new PresentationRecovery(props);
    const failed = { ...boundary.state, failed: true, error: new Error("terrain failed") };
    boundary.componentDidUpdate(props, boundary.state);
    expect(restored).toBe(0);
    boundary.componentDidUpdate(props, failed);
    expect(restored).toBe(1);
    boundary.componentDidUpdate({ ...props, ctx: {} as GameContext }, failed);
    boundary.componentDidUpdate(props, { ...failed, owner: {} as GameContext });
    expect(restored).toBe(1);
  });

  test("a committed presentation boundary owns only its exact reported error", async () => {
    const error = new Error("terrain failed");
    const unhandled: unknown[] = [];
    deferUnhandledPresentationError(error, () => unhandled.push(error));
    const boundary = new PresentationRecovery({ ctx: {} as GameContext, children: null, onRuntimeError: () => {} });
    boundary.state = { ...boundary.state, failed: true, error };
    boundary.componentDidCatch(error, { componentStack: "terrain" });
    const different = new Error("terrain failed");
    deferUnhandledPresentationError(different, () => unhandled.push(different));
    deferUnhandledPresentationError("terrain failed", () => unhandled.push("terrain failed"));
    await Promise.resolve();
    expect(unhandled).toEqual([different, "terrain failed"]);
    boundary.componentWillUnmount();
    deferUnhandledPresentationError(error, () => unhandled.push(error));
    await Promise.resolve();
    expect(unhandled[2]).toBe(error);
  });
  test("clears the exact suspended grouped key before any effect commits, preserving loaded and other-host groups", () => {
    const cleared: string[][] = [];
    const first = createPresentationRetryRegistry((inputs) => cleared.push(inputs));
    const other = createPresentationRetryRegistry((inputs) => cleared.push(inputs));
    const maps = ["/color.jpg", "/normal.jpg", "/roughness.jpg", "/ao.jpg"];
    first.register(maps);
    first.register(["/already-loaded.jpg"])();
    other.register(["/other-host.jpg"]);
    maps[0] = "/mutated.jpg";
    first.retry();
    expect(cleared).toEqual([["/color.jpg", "/normal.jpg", "/roughness.jpg", "/ao.jpg"]]);
    first.retry();
    expect(cleared).toHaveLength(1);
    other.retry();
    expect(cleared[1]).toEqual(["/other-host.jpg"]);
  });
  test("keeps group input order and allows a newly rejected retry to clear again", () => {
    const cleared: string[][] = [];
    const registry = createPresentationRetryRegistry((inputs) => cleared.push(inputs));
    registry.register(["a", "b"]);
    registry.register(["a", "b"]);
    registry.register(["b", "a"]);
    registry.retry();
    expect(cleared).toEqual([["a", "b"], ["b", "a"]]);
    registry.register(["a", "b"]);
    registry.retry();
    expect(cleared).toHaveLength(3);
  });
  test("context replacement discards the previous presentation failure and registry", () => {
    const previous = {} as GameContext;
    const next = {} as GameContext;
    const registry = createPresentationRetryRegistry(() => {});
    const state = { owner: previous, failed: true, error: new Error("terrain failed"), registry };
    const props = { ctx: next, children: null, onRuntimeError: () => {} };
    const reset = PresentationRecovery.getDerivedStateFromProps(props, state)!;
    expect(reset.owner).toBe(next);
    expect(reset.failed).toBe(false);
    expect(reset.registry).not.toBe(registry);
    expect(PresentationRecovery.getDerivedStateFromProps({ ...props, ctx: previous }, state)).toBeNull();
  });
});
