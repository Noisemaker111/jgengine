import { useState, type ReactNode } from "react";

import { GameCursor, type GameCursorStyle } from "./gameCursor";
import { GameFrame, type GameCut, type GameMaterial } from "./gameFrame";
import { GameSlider } from "./gameSlider";
import { useMenuNav } from "./menuNav";

const MATERIALS: readonly { material: GameMaterial; cut: GameCut; label: string; tint?: string }[] = [
  { material: "steel", cut: "chamfer", label: "Steel · chamfer" },
  { material: "brass", cut: "notch", label: "Brass · notch" },
  { material: "hull", cut: "box", label: "Hull · rivets" },
  { material: "wood", cut: "banner", label: "Wood · banner" },
  { material: "stone", cut: "shield", label: "Stone · shield" },
  { material: "paper", cut: "torn", label: "Paper · torn" },
  { material: "enamel", cut: "ticket", label: "Enamel · ticket" },
  { material: "glass", cut: "chamfer", label: "Glass · visor" },
  { material: "carbon", cut: "slant", label: "Carbon · slant" },
  { material: "leather", cut: "tab", label: "Leather · tab" },
];

const BACKDROP =
  "radial-gradient(120% 90% at 70% 10%, #f4b860 0%, #c0603a 30%, #3a2440 62%, #10131c 100%)";

function CursorMenu({ variant, material, cut, tint }: { variant: GameCursorStyle; material: GameMaterial; cut: GameCut; tint?: string }): ReactNode {
  const items = ["Continue", "New game", "Settings"];
  const nav = useMenuNav({ ids: items, gamepad: false });
  return (
    <nav {...nav.containerProps} style={{ position: "relative", display: "grid", gap: 12, padding: 18, width: 220 }}>
      {items.map((item) => (
        <GameFrame key={item} as="button" material={material} cut={cut} tint={tint} depth={10} padding="8px 18px" {...nav.itemProps(item)}>
          <span style={{ fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{item}</span>
        </GameFrame>
      ))}
      <GameCursor variant={variant} />
    </nav>
  );
}

/**
 * Contact sheet for the game-UI building blocks: every material and cut, game buttons with each
 * cursor, and the drawn sliders, over a sunset backdrop.
 */
export function GameFramesPreview({ className }: { className?: string }): ReactNode {
  const [volume, setVolume] = useState(0.7);
  const [power, setPower] = useState(0.4);
  return (
    <div className={className} style={{ minHeight: "100vh", padding: 28, background: BACKDROP, color: "#fff", fontFamily: '"Bahnschrift", "Segoe UI", sans-serif', boxSizing: "border-box" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 26 }}>
        {MATERIALS.map(({ material, cut, label, tint }) => (
          <GameFrame key={material} material={material} cut={cut} tint={tint} padding="18px 20px 26px" style={{ minHeight: 120 }}>
            <div style={{ fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
            <div style={{ opacity: 0.8, marginTop: 6, fontSize: 14 }}>Generated texture, no art files.</div>
          </GameFrame>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 30, alignItems: "flex-start" }}>
        <CursorMenu variant="brackets" material="steel" cut="chamfer" />
        <CursorMenu variant="chevron" material="enamel" cut="hex" tint="#1f6feb" />
        <CursorMenu variant="diamond" material="wood" cut="slant" />
        <CursorMenu variant="bar" material="carbon" cut="notch" />
        <GameFrame material="glass" cut="chamfer" padding="18px 20px" style={{ width: 300 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 70 }}>Volume</span>
              <GameSlider label="Volume" value={volume} onChange={setVolume} valueText={`${Math.round(volume * 100)}%`} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 70 }}>Power</span>
              <GameSlider label="Power" variant="pips" value={power} onChange={setPower} step={0.1} />
            </label>
          </div>
        </GameFrame>
      </div>
    </div>
  );
}
