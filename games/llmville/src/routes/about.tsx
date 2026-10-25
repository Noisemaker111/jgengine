import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { ABOUT_PAGE_DESCRIPTION, ABOUT_PAGE_TITLE, pageHead } from "@/seo/siteSeo";

const AboutScreen = lazy(async () =>
  import("@/branding/components/AboutScreen").then((module) => ({
    default: module.AboutScreen,
  })),
);

export const Route = createFileRoute("/about")({
  head: () =>
    pageHead({
      title: ABOUT_PAGE_TITLE,
      description: ABOUT_PAGE_DESCRIPTION,
      path: "/about",
    }),
  component: AboutRoute,
});

function AboutRoute() {
  return (
    <Suspense fallback={null}>
      <AboutScreen />
    </Suspense>
  );
}
