import { createFileRoute } from "@tanstack/react-router";

import { ProfileScreen } from "@/user/components/ProfileScreen";

export const Route = createFileRoute("/profile/$username")({
  component: ProfileRoute,
});

function ProfileRoute() {
  const { username: usernameParam } = Route.useParams();
  return <ProfileScreen username={usernameParam} />;
}