import type { ControllerToast } from "../../race/session";
import { PALETTE } from "./theme";

export function ControllerToastLayer({ toast }: { toast: ControllerToast | null }) {
  if (toast === null) return null;
  return (
    <div className="pointer-events-none px-4 py-2 text-center">
      <span className="text-sm font-semibold italic tracking-wide" style={{ color: PALETTE.cloudWhite, textShadow: `0 0 12px ${PALETTE.skyTeal}` }}>
        “{toast.message}”
      </span>
    </div>
  );
}
