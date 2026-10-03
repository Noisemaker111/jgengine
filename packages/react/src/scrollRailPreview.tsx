import { useState } from "react";
import { ScrollRail } from "./scrollRail";

/** Deterministic preview of caller-owned controls in the shared scrolling chrome. @internal */
export function ScrollRailPreview({ className }: { className?: string }) {
  const [selected, setSelected] = useState("Game");
  return <div className={className} style={{ padding: 24, boxSizing: "border-box", background: "#18252b", color: "#f2e6c9", font: "16px system-ui" }}>
    <h1 style={{ fontSize: 20 }}>Scrolling controls</h1>
    <div style={{ width: "min(100%, 340px)" }}>
      <ScrollRail label="settings categories">
        {["Game", "Graphics", "Audio", "Accessibility", "Controls"].map(label => <button key={label} type="button" onClick={() => setSelected(label)} aria-pressed={selected === label}
          style={{ flexShrink: 0, minHeight: 44, padding: "0 16px", font: "inherit", color: "inherit", border: "1px solid #b2a27e", borderRadius: 2, background: selected === label ? "#526951" : "#20363c" }}>{label}</button>)}
      </ScrollRail>
    </div>
    <p aria-live="polite">Selected: {selected}</p>
  </div>;
}
