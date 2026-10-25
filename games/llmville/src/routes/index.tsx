import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/branding/components/LandingPage";
import { DEFAULT_TITLE, HOME_PAGE_DESCRIPTION, pageHead } from "@/seo/siteSeo";
import { parseHomeRouteSearch } from "@/settings/settings";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      title: DEFAULT_TITLE,
      description: HOME_PAGE_DESCRIPTION,
      path: "/",
    }),
  validateSearch: parseHomeRouteSearch,
  component: LandingRoute,
});

function LandingRoute() {
  return <LandingPage />;
}
