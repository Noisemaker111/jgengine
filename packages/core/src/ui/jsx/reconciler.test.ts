import { describe, expect, test } from "bun:test";

import {
  Component,
  Fragment,
  StrictMode,
  Suspense,
  act,
  createContext,
  createElement as h,
  lazy,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "./index";
import { markupHost, renderToStaticMarkup, treeToMarkup, type MarkupNode } from "./markup";
import { Root } from "./reconciler";
import type { UiNode } from "./element";

function mount(node: UiNode): { root: Root<MarkupNode>; html: () => string } {
  const container: MarkupNode = { tag: "#root", text: "", props: {}, children: [] };
  const root = new Root<MarkupNode>(markupHost, container);
  root.render(node);
  return { root, html: () => treeToMarkup(container.children) };
}

describe("static markup", () => {
  test("writes tags, attributes, styles and escaped text", () => {
    const html = renderToStaticMarkup(
      h("div", { className: "a b", style: { fontSize: 12, opacity: 0.5, "--x": 3 }, "data-on": true, hidden: false, tabIndex: 0 },
        h("span", null, "1 < 2 & ", 3),
        h("input", { disabled: true, value: "q\"" }),
        null,
        false,
      ),
    );
    expect(html).toBe('<div class="a b" style="font-size:12px;opacity:0.5;--x:3" data-on="true" tabindex="0"><span>1 &lt; 2 &amp; 3</span><input disabled="" value="q&quot;"/></div>');
  });

  test("runs components and fragments, not effects", () => {
    let ran = 0;
    const Leaf = ({ label }: { label: string }) => {
      useEffect(() => {
        ran += 1;
      });
      return h(Fragment, null, h("b", null, label), "!");
    };
    expect(renderToStaticMarkup(h("p", null, h(Leaf, { label: "hi" })))).toBe("<p><b>hi</b>!</p>");
    expect(ran).toBe(0);
  });
});

describe("state and effects", () => {
  test("StrictMode rehearses mount effects together and preserves state on updates", async () => {
    const log: string[] = [];
    let bump = () => {};
    const View = () => {
      const [value, setValue] = useState(0);
      bump = () => setValue(value + 1);
      useLayoutEffect(() => {
        log.push("layout setup");
        return () => { log.push("layout cleanup"); };
      }, []);
      useEffect(() => {
        log.push("passive setup");
        return () => { log.push("passive cleanup"); };
      }, []);
      return h("output", null, value);
    };
    const { root, html } = mount(h(StrictMode, null, h(StrictMode, null, h(View, null))));
    expect(log).toEqual([
      "layout setup", "passive setup", "layout cleanup", "passive cleanup", "layout setup", "passive setup",
    ]);
    await act(bump);
    expect(html()).toBe("<output>1</output>");
    expect(log).toHaveLength(6);
    root.unmount();
    expect(log.slice(6)).toEqual(["layout cleanup", "passive cleanup"]);
  });

  test("a state change re-renders only that component", async () => {
    let parentRuns = 0;
    let childRuns = 0;
    let bump: (() => void) | null = null;
    const Child = () => {
      childRuns += 1;
      const [n, setN] = useState(0);
      bump = () => setN((v) => v + 1);
      return h("i", null, n);
    };
    const Parent = () => {
      parentRuns += 1;
      return h("div", null, h(Child, null));
    };
    const { html } = mount(h(Parent, null));
    expect(html()).toBe("<div><i>0</i></div>");
    await act(() => bump?.());
    expect(html()).toBe("<div><i>1</i></div>");
    expect(parentRuns).toBe(1);
    expect(childRuns).toBe(2);
  });

  test("effects run children first, clean up on change and on unmount", async () => {
    const log: string[] = [];
    let set: ((v: number) => void) | null = null;
    const Child = ({ v }: { v: number }) => {
      useEffect(() => {
        log.push(`child ${v}`);
        return () => log.push(`child cleanup ${v}`);
      }, [v]);
      useLayoutEffect(() => {
        log.push(`layout ${v}`);
      }, [v]);
      return null;
    };
    const Parent = () => {
      const [v, setV] = useState(1);
      set = setV;
      useEffect(() => {
        log.push("parent");
      }, []);
      return v === 3 ? null : h(Child, { v });
    };
    mount(h(Parent, null));
    expect(log).toEqual(["layout 1", "child 1", "parent"]);
    await act(() => set?.(2));
    expect(log.slice(3)).toEqual(["layout 2", "child cleanup 1", "child 2"]);
    await act(() => set?.(3));
    expect(log.slice(6)).toEqual(["child cleanup 2"]);
  });

  test("reducer, memo and ref keep their values across renders", async () => {
    let dispatch: ((n: number) => void) | null = null;
    let made = 0;
    const View = () => {
      const [sum, add] = useReducer((s: number, n: number) => s + n, 1);
      dispatch = add;
      const ref = useRef(0);
      ref.current += 1;
      const fixed = useMemo(() => {
        made += 1;
        return "m";
      }, []);
      return h("u", null, `${sum}/${ref.current}/${fixed}`);
    };
    const { html } = mount(h(View, null));
    await act(() => dispatch?.(4));
    expect(html()).toBe("<u>5/2/m</u>");
    expect(made).toBe(1);
  });
});

describe("children", () => {
  test("a hidden sibling does not remount the ones after it", async () => {
    let mounts = 0;
    let show: ((v: boolean) => void) | null = null;
    const Kept = () => {
      useEffect(() => {
        mounts += 1;
      }, []);
      return h("b", null, "kept");
    };
    const View = () => {
      const [on, setOn] = useState(false);
      show = setOn;
      return h("div", null, on ? h("i", null, "first") : null, h(Kept, null));
    };
    const { html } = mount(h(View, null));
    await act(() => show?.(true));
    expect(html()).toBe("<div><i>first</i><b>kept</b></div>");
    expect(mounts).toBe(1);
  });

  test("keyed items move without losing their state", async () => {
    let order: ((ids: string[]) => void) | null = null;
    const Item = ({ id }: { id: string }) => {
      const first = useRef(id);
      return h("li", null, `${id}:${first.current}`);
    };
    const List = () => {
      const [ids, setIds] = useState(["a", "b", "c"]);
      order = setIds;
      return h("ul", null, ids.map((id) => h(Item, { key: id, id })));
    };
    const { html } = mount(h(List, null));
    await act(() => order?.(["c", "a", "d"]));
    expect(html()).toBe("<ul><li>c:c</li><li>a:a</li><li>d:d</li></ul>");
  });
});

describe("context, stores, memo", () => {
  test("a context change reaches a reader under a memo that skipped", async () => {
    const Theme = createContext("light");
    let set: ((v: string) => void) | null = null;
    let middleRuns = 0;
    const Reader = () => h("span", null, useContext(Theme));
    const Middle = memo(() => {
      middleRuns += 1;
      return h(Reader, null);
    });
    const App = () => {
      const [theme, setTheme] = useState("dark");
      set = setTheme;
      return h(Theme, { value: theme }, h(Middle, null));
    };
    const { html } = mount(h(App, null));
    expect(html()).toBe("<span>dark</span>");
    await act(() => set?.("neon"));
    expect(html()).toBe("<span>neon</span>");
    expect(middleRuns).toBe(1);
  });

  test("an external store re-renders its subscriber on change only", async () => {
    let value = 1;
    const listeners = new Set<() => void>();
    const subscribe = (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    };
    let runs = 0;
    const View = () => {
      runs += 1;
      return h("s", null, useSyncExternalStore(subscribe, () => value));
    };
    const { html, root } = mount(h(View, null));
    await act(() => listeners.forEach((fn) => fn()));
    expect(runs).toBe(1);
    value = 2;
    await act(() => listeners.forEach((fn) => fn()));
    expect(html()).toBe("<s>2</s>");
    expect(runs).toBe(2);
    root.unmount();
    expect(listeners.size).toBe(0);
  });
});

describe("suspense and errors", () => {
  test("an external store read failure reaches its component's error boundary", async () => {
    let failed = false;
    const listeners = new Set<() => void>();
    const subscribe = (notify: () => void) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    };
    const View = () => h("span", null, useSyncExternalStore(subscribe, () => {
      if (failed) throw new Error("store read failed");
      return "ready";
    }));
    class Boundary extends Component<{ children?: UiNode }, { failed: boolean }> {
      override state = { failed: false };
      static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
      override render(): UiNode { return this.state.failed ? h("b", null, "store failed") : this.props.children; }
    }
    const { html, root } = mount(h(Boundary, null, h(View, null)));
    expect(html()).toBe("<span>ready</span>");
    failed = true;
    await act(() => listeners.forEach((notify) => notify()));
    expect(html()).toBe("<b>store failed</b>");
    expect(listeners.size).toBe(0);
    root.unmount();
  });

  test("a lazy component shows the fallback, then itself", async () => {
    let load: ((mod: { default: () => UiNode }) => void) | null = null;
    const Late = lazy(() => new Promise<{ default: () => UiNode }>((resolve) => {
      load = resolve;
    }));
    const { html } = mount(h(Suspense, { fallback: h("em", null, "wait") }, h(Late, null)));
    expect(html()).toBe("<em>wait</em>");
    await act(async () => {
      load?.({ default: () => h("b", null, "here") });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(html()).toBe("<b>here</b>");
  });

  test("an error boundary catches a render error below it", async () => {
    class Boundary extends Component<{ children?: UiNode }, { failed: boolean }> {
      override state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      override render() {
        return this.state.failed ? h("p", null, "broken") : this.props.children;
      }
    }
    const Bad = (): UiNode => {
      throw new Error("no");
    };
    const { html } = mount(h(Boundary, null, h(Bad, null)));
    await act(() => {});
    expect(html()).toBe("<p>broken</p>");
  });
});
