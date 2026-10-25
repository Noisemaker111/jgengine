import { createFileRoute, redirect } from "@tanstack/react-router";

/** Tablet preview merged into /dev/hud — keep redirect for old bookmarks. */
export const Route = createFileRoute("/dev/tablet")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
    throw redirect({ to: "/dev/hud" });
  },
  component: () => null,
});