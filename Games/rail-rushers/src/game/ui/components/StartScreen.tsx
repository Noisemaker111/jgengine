import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { PALETTE } from "../theme";

const CONTROLS: readonly { action: keyof typeof keybinds; help: string }[] = [
  { action: "pump", help: "Pump / hold speed" },
  { action: "brake", help: "Brake" },
  { action: "throwJunction", help: "Throw next junction" },
  { action: "expandDiagram", help: "Expand dispatcher board" },
  { action: "restart", help: "Restart" },
  { action: "confirm", help: "Start" },
];

export interface StartScreenProps {
  deadlineSeconds: number;
  onStart: () => void;
}

export function StartScreen({ deadlineSeconds, onStart }: StartScreenProps) {
  return (
    <div data-jg-menu className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1a160f]/92 p-4">
      <div className="flex w-full max-w-[560px] flex-col gap-4 rounded-sm border-2 border-[#a98467] bg-[#211d14] p-6 shadow-[0_8px_0_rgba(0,0,0,0.5)]">
        <div className="flex flex-col items-center gap-1 border-b-2 border-[#a98467] pb-3 text-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#a98467]">Mountain Rail Network</span>
          <h1 className="text-3xl font-bold uppercase tracking-[0.08em]" style={{ color: PALETTE.cream }}>
            Rail Rushers
          </h1>
          <p className="max-w-[460px] font-mono text-[12px] leading-relaxed text-[#f2e8cf]/80">
            Pump the handcar from Depot to Summit Terminus before the Evening Express arrives — throw junctions ahead of
            you, dodge freights on the spurs, and squeeze the single-track tunnel and trestle clean.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: PALETTE.signalRed }}>
            Express due at Terminus — {Math.round(deadlineSeconds)} seconds
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {CONTROLS.map(({ action, help }) => (
            <div key={action} className="flex items-center justify-between gap-3 font-mono text-[11px] text-[#f2e8cf]/85">
              <span>{help}</span>
              <span className="rounded-sm border border-[#a98467] bg-[#1a160f] px-1.5 py-0.5 text-[10px] uppercase text-[#f2e8cf]">
                {actionLabel(keybinds, action)}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onStart}
          className="mt-1 rounded-sm border-2 border-[#f2e8cf] bg-[#386641] px-4 py-2.5 font-mono text-sm uppercase tracking-[0.16em] text-[#f2e8cf] shadow-[0_4px_0_rgba(0,0,0,0.4)] hover:brightness-110"
        >
          Depart — Clear Running
        </button>
      </div>
    </div>
  );
}
