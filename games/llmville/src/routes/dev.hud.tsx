import { createFileRoute, redirect } from "@tanstack/react-router";

import { HudDevPreview } from "@/runtime/components/HudDevPreview";

export const Route = createFileRoute("/dev/hud")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: HudDevPreview,
});
