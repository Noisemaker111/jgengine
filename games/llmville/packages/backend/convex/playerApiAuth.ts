import { decodeJwt } from "jose";

export function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * The `sub` claim as presented, with no signature check. Only ever a routing hint: every caller must
 * prove the subject separately — bot tokens by their stored token hash, humans by `ctx.auth`.
 */
export function unverifiedTokenSubject(token: string): string | null {
  try {
    const subject = decodeJwt(token).sub;
    return typeof subject === "string" && subject.length > 0 ? subject : null;
  } catch {
    return null;
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function errorResponse(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}
