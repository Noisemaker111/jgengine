import type { CSSProperties, ReactNode } from "react";

import { blasterStore } from "../../blaster/store";
import type { Controls } from "../../blaster/logic";

const BTN: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 66,
  height: 66,
  borderRadius: "50%",
  background: "rgba(10, 20, 40, 0.55)",
  border: "1px solid rgba(150, 190, 255, 0.4)",
  color: "#e8f1ff",
  fontSize: 24,
  userSelect: "none",
  touchAction: "none",
};

function HoldButton({ control, glyph }: { control: keyof Controls; glyph: ReactNode }) {
  const down = () => blasterStore.setTouch(control, true);
  const up = () => blasterStore.setTouch(control, false);
  return (
    <div
      className="pointer-events-auto"
      style={BTN}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        down();
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
    >
      {glyph}
    </div>
  );
}

function TapButton({ onTap, glyph }: { onTap: () => void; glyph: ReactNode }) {
  return (
    <div
      className="pointer-events-auto"
      style={{ ...BTN, background: "rgba(40, 24, 60, 0.55)" }}
      onPointerDown={(e) => {
        e.preventDefault();
        onTap();
      }}
    >
      {glyph}
    </div>
  );
}

export function TouchControls() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-4">
      <div className="flex gap-3">
        <HoldButton control="left" glyph="⟲" />
        <HoldButton control="right" glyph="⟳" />
      </div>
      <div className="flex items-end gap-3">
        <TapButton onTap={() => blasterStore.hyperspace()} glyph="✦" />
        <HoldButton control="fire" glyph="●" />
        <HoldButton control="thrust" glyph="▲" />
      </div>
    </div>
  );
}
