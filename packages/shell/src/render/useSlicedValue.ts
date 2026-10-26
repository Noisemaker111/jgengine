import { useEffect, useState, type DependencyList } from "react";

import { runSliced, SlicedWorkCancelled, type SlicedJob } from "@jgengine/core/run/slicedWork";

import { trackSceneWork } from "./modelLoad";

/**
 * Build a value in budgeted slices after mount instead of inside render: `null` until the job
 * finishes, then its result. A heavy bake (grass, scatter, terrain colours) stops freezing the
 * page while it runs, so a menu over the scene keeps answering clicks. While it runs it counts as
 * scene loading, so the shader warmup and capture settle wait for it like a streamed model.
 * `deps` restart the job; the previous value stays up until the new one is built.
 * @internal
 */
export function useSlicedValue<T>(label: string, makeJob: () => SlicedJob<T>, deps: DependencyList): T | null {
  const [value, setValue] = useState<{ value: T } | null>(null);
  useEffect(() => {
    const done = trackSceneWork(label);
    const run = runSliced(makeJob());
    let live = true;
    run.done.then(
      (result) => {
        if (live) setValue({ value: result });
        done();
      },
      (error: unknown) => {
        done();
        if (!(error instanceof SlicedWorkCancelled)) console.error(`[jgengine] ${label} failed to build`, error);
      },
    );
    return () => {
      live = false;
      run.cancel();
      done();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value === null ? null : value.value;
}
