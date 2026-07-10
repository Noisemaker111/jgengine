import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { Toast as ToastData } from "../../city/state";

export function Toast({ toast }: { toast: ToastData | null }): ReactNode {
  const [visible, setVisible] = useState(false);
  const at = toast?.at ?? null;

  useEffect(() => {
    if (at === null) return undefined;
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(id);
  }, [at]);

  if (toast === null) return null;

  return (
    <div
      className={`flex items-center gap-2.5 bg-[#171916] px-4 py-2.5 text-[#eeeae0] shadow-[0_12px_34px_rgba(0,0,0,0.22)] transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
      }`}
    >
      <span className="h-1.5 w-1.5 shrink-0 bg-[#d7ff43]" />
      <span className="text-[11px] font-medium tracking-[0.02em]">{toast.text}</span>
    </div>
  );
}
