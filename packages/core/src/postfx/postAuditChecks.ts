/** The draws the post chain does differently from three's passes; `bun run perf post-audit` redraws each three's way and compares. @internal */
export const POST_AUDIT_CHECKS = ["composite", "atmosphere", "bloom"] as const;

/** One of {@link POST_AUDIT_CHECKS}. @internal */
export type PostAuditCheck = (typeof POST_AUDIT_CHECKS)[number];
