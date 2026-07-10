import type { ReactNode } from "react";

import { HAIRLINE, PANEL } from "../theme";

type Run = (action: string, input?: unknown) => void;

const BTN =
  "flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#171916] transition hover:bg-[rgba(20,22,18,0.08)]";

export function MenuBar({ run, onLibrary }: { run: Run; onLibrary: () => void }): ReactNode {
  return (
    <div className={`flex items-stretch ${PANEL}`}>
      <button type="button" onClick={() => run("city.save", {})} className={BTN}>
        <span className="text-[12px] leading-none">↧</span>
        Save
      </button>
      <button type="button" onClick={onLibrary} className={`border-l ${HAIRLINE} ${BTN}`}>
        <span className="text-[12px] leading-none">▤</span>
        Library
      </button>
      <button type="button" onClick={() => run("city.menu", { open: true })} className={`border-l ${HAIRLINE} ${BTN}`}>
        <span className="text-[12px] leading-none">☰</span>
        Menu
      </button>
    </div>
  );
}
