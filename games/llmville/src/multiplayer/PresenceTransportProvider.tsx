import { createContext, useContext, type ReactNode } from "react";

import { convexPresenceTransport } from "@/multiplayer/convexPresenceTransport";
import type { PresenceTransport } from "@/multiplayer/presenceTransport";

// A transport's members are hooks, so the mounted transport must not change
// identity while a game session is mounted — remount the subtree (key change)
// to switch backends at runtime.
const PresenceTransportContext = createContext<PresenceTransport>(convexPresenceTransport);

export function PresenceTransportProvider({
  transport,
  children,
}: {
  transport: PresenceTransport;
  children: ReactNode;
}) {
  return <PresenceTransportContext.Provider value={transport}>{children}</PresenceTransportContext.Provider>;
}

export function usePresenceTransport(): PresenceTransport {
  return useContext(PresenceTransportContext);
}
