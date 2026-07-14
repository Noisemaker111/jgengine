import type { ReactNode } from "react";
import { useStore } from "@jgengine/react/store";
import { heistStore } from "../../state/heistState";

export function ToastList(): ReactNode {
  const toasts = useStore(heistStore, (heist) => heist.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none flex w-full max-w-md flex-col items-center gap-1.5">
      {[...toasts].reverse().map((toast) => (
        <p
          key={toast.id}
          className="rounded border border-[#c9a227]/50 bg-[#0b0f1c]/85 px-3 py-1.5 text-center font-serif text-sm italic text-[#f2e3c2] shadow"
        >
          {toast.text}
        </p>
      ))}
    </div>
  );
}
