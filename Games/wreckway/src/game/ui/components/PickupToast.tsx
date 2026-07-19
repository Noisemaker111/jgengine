import type { Toast } from "@jgengine/core/game/toasts";

interface PickupToastProps {
  toast: Toast<string> | null;
}

export function PickupToast({ toast }: PickupToastProps) {
  if (toast === null) return null;
  return (
    <div key={toast.id} className="flex justify-center">
      <div className="rounded border-2 border-[#f0c419] bg-[#1c1a17]/95 px-5 py-2 text-center shadow-[0_0_24px_rgba(240,196,25,0.35)]">
        <p className="text-sm font-black tracking-wide text-[#fef3e0] sm:text-base">{toast.body}</p>
      </div>
    </div>
  );
}
