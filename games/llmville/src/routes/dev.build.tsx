import { createFileRoute, redirect } from "@tanstack/react-router";

import { BuildWorkbench } from "@/dev/builder/components/BuildWorkbench";

export const Route = createFileRoute("/dev/build")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: BuildWorkbench,
});
