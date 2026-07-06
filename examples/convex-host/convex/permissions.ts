interface AuthContext {
  auth: {
    getUserIdentity: () => Promise<{ subject: string } | null>;
  };
}

export async function resolveActor(
  ctx: AuthContext,
  fallbackExternalId: string | undefined,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  if (
    fallbackExternalId !== undefined &&
    fallbackExternalId.length > 0 &&
    fallbackExternalId !== identity.subject
  ) {
    return null;
  }
  return identity.subject;
}
