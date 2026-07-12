import { useEffect } from "react";

/** Listens for the engine's F2+<key> chord family and fires on the given code (e.g. "KeyE"). */
export function useF2Chord(code: string, onChord: () => void): void {
  useEffect(() => {
    let f2Held = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "F2") {
        f2Held = true;
        return;
      }
      if (event.code === code && f2Held) {
        event.preventDefault();
        onChord();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = false;
    };
    const onBlur = () => {
      f2Held = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [code, onChord]);
}
