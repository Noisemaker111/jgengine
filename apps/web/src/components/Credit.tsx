import { useState } from "react";

import type { GameCredit } from "../content/games";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CreditAvatar({
  credit,
  size = 32,
  className = "",
}: {
  credit: GameCredit;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dims = { width: size, height: size };
  if (failed) {
    return (
      <span
        style={dims}
        className={`grid shrink-0 place-items-center rounded-full bg-white/10 text-[0.6rem] font-semibold text-slate-200 ring-1 ring-white/15 ${className}`}
        aria-hidden
      >
        {initials(credit.name)}
      </span>
    );
  }
  return (
    <img
      src={credit.avatar}
      alt={credit.name}
      style={dims}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover ring-1 ring-white/15 ${className}`}
    />
  );
}

export function CreditTag({ credit, hue }: { credit: GameCredit; hue: string }) {
  return (
    <a
      href={credit.href}
      target="_blank"
      rel="noreferrer"
      className="group flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-slate-100"
      title={`${credit.label} ${credit.name}`}
    >
      <CreditAvatar credit={credit} size={22} />
      <span className="hidden font-medium sm:inline" style={{ color: hue }}>
        {credit.handle}
      </span>
    </a>
  );
}

export function CreditCard({ credit, hue }: { credit: GameCredit; hue: string }) {
  return (
    <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-left backdrop-blur-sm">
      <CreditAvatar credit={credit} size={44} />
      <div className="min-w-0">
        <p className="text-[0.7rem] font-medium uppercase tracking-wider text-slate-500">{credit.label}</p>
        <a
          href={credit.href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-slate-100 transition hover:brightness-110"
          style={{ color: hue }}
        >
          {credit.name} <span className="font-normal text-slate-500">{credit.handle}</span>
        </a>
        {credit.source !== undefined && (
          <p className="truncate text-xs text-slate-400">
            via{" "}
            <a
              href={credit.source.href}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-slate-600 underline-offset-2 transition hover:text-slate-200"
            >
              {credit.source.name}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
