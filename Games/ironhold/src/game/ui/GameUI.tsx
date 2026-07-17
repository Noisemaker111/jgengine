import { RtsHud } from "./components/Hud";
import { Minimap } from "./components/Minimap";

/** Ironhold HUD: resource/objective bar, command card, controls hint, and a live minimap. Unit
 * selection rings and marquee are drawn by the shell (pointer.select), so the HUD stays chrome. */
export function GameUI() {
  return (
    <div className="absolute inset-0 z-10 select-none">
      <RtsHud />
      <div className="pointer-events-none absolute right-4 top-4 z-20">
        <Minimap />
      </div>
    </div>
  );
}
