import { useEffect, useRef } from "react";
import { useInputDevice } from "@jgengine/react/inputDevice";
import { KitButton } from "@jgengine/react/uiKitRoot";

/** Touch-only camera keys: they feed the published RTS rig's existing DOM input boundary. */
export function CameraPad() {
  const touch = useInputDevice() === "touch";
  const held = useRef(new Set<string>());
  const release = () => {
    for (const code of held.current) window.dispatchEvent(new KeyboardEvent("keyup", { code }));
    held.current.clear();
  };
  const press = (code: string) => { release(); held.current.add(code); window.dispatchEvent(new KeyboardEvent("keydown", { code })); };
  useEffect(() => { window.addEventListener("blur", release); return () => { release(); window.removeEventListener("blur", release); }; }, []);
  if (!touch) return null;
  const key = (label: string, glyph: string, code: string) => <KitButton key={code} size="sm" aria-label={label}
    onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press(code); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>{glyph}</KitButton>;
  const zoom = (deltaY: number) => document.querySelector("canvas")?.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }));
  return <nav className="bw-camera" aria-label="Camera navigation">
    {key("Rotate camera left", "↶", "KeyQ")}{key("Pan camera up", "↑", "ArrowUp")}{key("Rotate camera right", "↷", "KeyE")}
    {key("Pan camera left", "←", "ArrowLeft")}<KitButton size="sm" aria-label="Zoom camera in" onClick={() => zoom(-100)}>＋</KitButton>{key("Pan camera right", "→", "ArrowRight")}
    <KitButton size="sm" aria-label="Zoom camera out" onClick={() => zoom(100)}>−</KitButton>{key("Pan camera down", "↓", "ArrowDown")}
  </nav>;
}
