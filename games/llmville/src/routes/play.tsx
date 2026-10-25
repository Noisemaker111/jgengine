import { createFileRoute, redirect } from "@tanstack/react-router";

import { parseHomeRouteSearch } from "@/settings/settings";

export const Route = createFileRoute("/play")({
  validateSearch: parseHomeRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search });
  },
  component: () => null,
});
