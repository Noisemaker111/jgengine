import { createFileRoute, redirect } from "@tanstack/react-router";

import { AssetSheetWorkbench } from "@/dev/assets/AssetSheetWorkbench";

export const Route = createFileRoute("/dev/assets")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: AssetSheetWorkbench,
});
