import { useState } from "react";
import type { ReactNode } from "react";

export function Credit(): ReactNode {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href="https://x.com/emollick"
      target="_blank"
      rel="noreferrer"
      className="pointer-events-auto flex items-center gap-2 border border-[rgba(20,22,18,0.19)] bg-[rgba(235,232,222,0.92)] px-3 py-1.5 text-[#171916] shadow-[0_8px_22px_rgba(25,26,22,0.12)] backdrop-blur-[18px] transition hover:bg-[#d7ff43]"
    >
      {failed ? (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#171916] text-[10px] font-semibold text-[#eeeae0]">
          EM
        </span>
      ) : (
        <img
          src="https://unavatar.io/x/emollick"
          alt="Ethan Mollick"
          width={24}
          height={24}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-6 w-6 rounded-full object-cover ring-1 ring-[rgba(20,22,18,0.25)]"
        />
      )}
      <span className="text-[11px]">
        From <b className="font-semibold">Monument</b> by{" "}
        <span className="font-semibold text-[#171916]">Ethan Mollick</span>
      </span>
    </a>
  );
}
