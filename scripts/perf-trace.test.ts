import { expect, test } from "bun:test";
import { renderTracedHitches, TRACE_ANCHOR, traceHitches, type TraceEvent } from "./perf-trace";

const meta = (pid: number, tid: number, kind: "process_name" | "thread_name", name: string): TraceEvent => ({ name: kind, ph: "M", ts: 0, pid, tid, args: { name } });

test("a hitch the page could not explain is named by the GPU process slice that spanned it", () => {
  const anchor = 1_000_000;
  const events: TraceEvent[] = [
    meta(2, 1, "process_name", "GPU Process"),
    meta(2, 1, "thread_name", "CrGpuMain"),
    meta(3, 7, "process_name", "Renderer"),
    meta(3, 7, "thread_name", "CrRendererMain"),
    { name: TRACE_ANCHOR, ph: "R", ts: anchor, pid: 3, tid: 7 },
    // The hitch: 300 ms ending 10 s after the anchor. The GPU main thread ran a task the whole time.
    { name: "ThreadControllerImpl::RunTask", ph: "X", ts: anchor + 9_700_000, dur: 300_000, pid: 2, tid: 1 },
    { name: "GpuChannel::ExecuteDeferredRequest", ph: "X", ts: anchor + 9_701_000, dur: 298_000, pid: 2, tid: 1 },
    { name: "ProgramD3D::getVertexExecutableForCachedInputLayout", ph: "X", ts: anchor + 9_702_000, dur: 290_000, pid: 2, tid: 1 },
    // The page's own short frame task is under the floor and is not named.
    { name: "ThreadControllerImpl::RunTask", ph: "X", ts: anchor + 9_710_000, dur: 6_000, pid: 3, tid: 7 },
    // A slice well outside the hitch is ignored.
    { name: "ThreadControllerImpl::RunTask", ph: "X", ts: anchor + 2_000_000, dur: 500_000, pid: 2, tid: 1 },
  ];
  const [traced] = traceHitches(events, [{ atS: 10, ms: 300 }]);
  expect(traced!.busy).toEqual([
    { thread: "GPU Process / CrGpuMain", ms: 300, chain: "ThreadControllerImpl::RunTask > GpuChannel::ExecuteDeferredRequest > ProgramD3D::getVertexExecutableForCachedInputLayout" },
  ]);
});

test("a hitch lists the elements first painted just before it, not ones painted every frame", () => {
  const anchor = 1_000_000;
  const paint = (ts: number, nodeId: number): TraceEvent => ({ name: "Paint", ph: "X", ts, dur: 200, pid: 3, tid: 7, args: { data: { nodeId, layerId: 1 } } });
  const events: TraceEvent[] = [
    { name: TRACE_ANCHOR, ph: "R", ts: anchor, pid: 3, tid: 7 },
    // The dial repaints every frame from the start: never a first paint near the hitch.
    paint(anchor + 1_000_000, 11), paint(anchor + 9_900_000, 11),
    // The hurt wash first paints 200 ms before the 300 ms hitch that ends at 10 s.
    paint(anchor + 9_500_000, 42),
    // Something first painted long before is not named.
    paint(anchor + 5_000_000, 7),
  ];
  const [traced] = traceHitches(events, [{ atS: 10, ms: 300 }]);
  expect(traced!.firstPaints).toEqual([42]);
  expect(renderTracedHitches([traced!], new Map([[42, "div.dw-hurtwash"]]))).toContain("first painted: div.dw-hurtwash");
});

test("a trace without the anchor mark fails instead of naming the wrong slices", () => {
  expect(() => traceHitches([], [{ atS: 1, ms: 40 }])).toThrow(/jg-hitch-zero/);
});
