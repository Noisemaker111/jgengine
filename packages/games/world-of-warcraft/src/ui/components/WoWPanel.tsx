import type { ReactNode } from "react";
import { wowPanel, wowPanelHeader } from "../wowStyles";

export function WoWPanel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[wowPanel, "p-3", className].filter(Boolean).join(" ")}>
      {title !== undefined ? <div className={[wowPanelHeader, "mb-2"].join(" ")}>{title}</div> : null}
      {children}
    </div>
  );
}