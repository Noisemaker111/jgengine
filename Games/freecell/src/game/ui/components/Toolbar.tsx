import { useEffect, useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { freecellStore, type FreeCellSnapshot } from "../../freecell/store";
import { btn, btnActive, chromePanel, keyBadge } from "../theme";

function KeyBadge({ action }: { action: string }) {
  return <kbd className={keyBadge}>{actionLabel(keybinds, action)}</kbd>;
}

export function Toolbar({ snapshot }: { snapshot: FreeCellSnapshot }) {
  const [dealInput, setDealInput] = useState(String(snapshot.dealNumber));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDealInput(String(snapshot.dealNumber));
  }, [snapshot.dealNumber]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const deal = () => {
    const n = Number.parseInt(dealInput, 10);
    freecellStore.newDeal(Number.isFinite(n) ? n : 1);
  };

  const copyLink = () => {
    const link = freecellStore.shareLink();
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => undefined);
    }
  };

  return (
    <div className={`${chromePanel} w-[15rem] max-w-[80vw]`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-black uppercase tracking-[0.28em] text-slate-100">FreeCell</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-300/80">Solitaire</span>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400" htmlFor="deal">
          Deal #
        </label>
        <input
          id="deal"
          type="number"
          min={1}
          value={dealInput}
          onChange={(e) => setDealInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") deal();
          }}
          className="pointer-events-auto w-20 rounded-md border border-slate-300/25 bg-slate-900/80 px-2 py-1 font-mono text-sm text-slate-100 outline-none focus:border-sky-300/70"
        />
        <button type="button" className={btn} onClick={deal}>
          Go
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className={btn} onClick={() => freecellStore.randomDeal()}>
          New <KeyBadge action="newDeal" />
        </button>
        <button type="button" className={btn} onClick={() => freecellStore.restart()}>
          Restart <KeyBadge action="restart" />
        </button>
        <button type="button" className={btn} disabled={!snapshot.canUndo} onClick={() => freecellStore.undo()}>
          Undo <KeyBadge action="undo" />
        </button>
        <button
          type="button"
          className={snapshot.autoPlay ? btnActive : btn}
          onClick={() => freecellStore.toggleAutoPlay()}
        >
          Auto {snapshot.autoPlay ? "On" : "Off"} <KeyBadge action="toggleAuto" />
        </button>
        <button type="button" className={`${btn} col-span-2`} onClick={copyLink}>
          {copied ? "Link copied" : "Copy deal link"}
        </button>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-slate-400/80">
        Click a card, then a destination. Double-click to auto-play.
      </p>
    </div>
  );
}
