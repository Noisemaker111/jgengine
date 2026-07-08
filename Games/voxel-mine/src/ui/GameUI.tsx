import { Hotbar } from "./Hotbar";

export function GameUI() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6">
      <Hotbar />
    </div>
  );
}
