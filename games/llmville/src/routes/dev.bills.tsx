import { createFileRoute, redirect } from "@tanstack/react-router";

import { BillsDevPreview } from "@/economy/components/BillsDevPreview";

export const Route = createFileRoute("/dev/bills")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: BillsDevPreview,
});
