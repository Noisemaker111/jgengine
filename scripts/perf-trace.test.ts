import { expect, test } from "bun:test";
import { TRACE_ANCHOR, traceHitches, type TraceEvent } from "./perf-trace";

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

test("a trace without the anchor mark fails instead of naming the wrong slices", () => {
  expect(() => traceHitches([], [{ atS: 1, ms: 40 }])).toThrow(/jg-hitch-zero/);
});
