import { useCallback, useMemo, useState } from "react";

import { LiveSpecimen } from "../components/LiveSpecimen";
import { CodeBlock } from "../components/marketing";
import type { DemoKey } from "./demoParts";
import { ENGINE_DEMOS, engineDemoCode } from "./engineDemos";
import { liveCode, type DialSet } from "./liveCode";
import { createTrace } from "./trace";

/** A demo that plays itself, with the code that drives it lighting up and changing as it runs. */
export function TracedDemo({ demo, layout = "side" }: { demo: DemoKey; layout?: "stack" | "side" }) {
  const spec = ENGINE_DEMOS[demo];
  const trace = useMemo(() => createTrace(), []);
  const [dials, setDials] = useState<DialSet>({});
  const onDials = useCallback((next: DialSet) => setDials(next), []);
  const codeTrace = useMemo(() => ({ channel: trace, lines: spec.lines }), [trace, spec]);
  return (
    <div className="min-w-0">
      <LiveSpecimen specimen={demo} trace={trace} onDials={onDials} layout={layout} />
      <div className="mt-4">
        <CodeBlock code={liveCode(engineDemoCode(demo), dials, spec.live)} filename={spec.filename} tone="good" trace={codeTrace} />
      </div>
    </div>
  );
}
