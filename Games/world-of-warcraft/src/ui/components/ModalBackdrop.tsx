import type { ReactNode } from "react";
import { X } from "lucide-react";
import { KeybindBadge } from "./KeybindBadge";
import { wowPanel } from "../wowStyles";

export function ModalBackdrop({
  title,
  keybind,
  onClose,
  children,
  widthClassName = "w-[28rem]",
}: {
  title: string;
  keybind?: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <section className={[widthClassName, wowPanel, "max-h-[80vh] overflow-hidden shadow-2xl"].join(" ")}>
        <header className="flex items-center justify-between border-b border-amber-800/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold uppercase tracking-wide text-amber-100">{title}</h2>
            {keybind !== undefined ? <KeybindBadge label={keybind} /> : null}
          </div>
          <button
            type="button"
            title="Close"
            aria-label="Close"
            className="rounded border border-stone-700 bg-stone-900/80 p-1 text-stone-300 transition hover:border-amber-400 hover:text-amber-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
      </section>
    </div>
  );
}