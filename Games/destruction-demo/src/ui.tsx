import { useEffect, useState } from "react";

import { currentDemo } from "./state";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-white/50">{label}</span>
      <span className="tabular-nums text-amber-200">{value}</span>
    </div>
  );
}

export function DestructionUI() {
  const [debris, setDebris] = useState(0);
  const [fell, setFell] = useState<readonly string[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const demo = currentDemo();
      if (demo === null) return;
      setDebris(demo.debrisCount);
      setFell(demo.collapsedIds);
    }, 200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute left-4 top-4 w-72 rounded-lg border border-amber-400/30 bg-neutral-950/80 p-4 text-sm shadow-xl backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-base font-semibold text-amber-300">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
          Traversal &amp; Destruction
        </div>
        <div className="space-y-1.5">
          <Row label="Craters carved" value="2 + 1 mound" />
          <Row label="Collapsed pieces" value={String(fell.length)} />
          <Row label="Debris bodies" value={String(debris)} />
          <Row label="Grapple rope" value="attached" />
        </div>
        <p className="mt-3 border-t border-white/10 pt-2 text-xs leading-relaxed text-white/40">
          Structural graph severed a weak stem; the disconnected crown fell into a blast crater written
          back into the terrain field. A grapple rope hangs from a fired anchor.
        </p>
      </div>
    </div>
  );
}
