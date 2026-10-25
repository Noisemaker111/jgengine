import { createFileRoute, redirect } from "@tanstack/react-router";

import { CharacterDevPreview } from "@/user/components/CharacterDevPreview";

export const Route = createFileRoute("/dev/character")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: CharacterDevPreview,
});
