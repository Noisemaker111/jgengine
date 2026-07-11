import type { ReactNode } from "react";

export function Kbd({ label, active = false }: { label: string; active?: boolean }): ReactNode {
  return (
    <kbd
      className={`grid h-5 min-w-[1.25rem] place-items-center border px-1 text-[11px] font-medium leading-none ${
        active
          ? "border-[#d7ff43] bg-[#d7ff43] text-[#171916]"
          : "border-[rgba(20,22,18,0.3)] bg-[rgba(255,255,255,0.35)] text-[#4b4e47]"
      }`}
    >
      {label}
    </kbd>
  );
}
