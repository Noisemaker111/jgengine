const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function normalizeLoginUsername(identifier: string): string {
  return identifier.trim().replace(/^@/, "").toLowerCase();
}

export function isValidGameUsername(username: string): boolean {
  return USERNAME_PATTERN.test(normalizeLoginUsername(username));
}

function sanitizeUsernameBase(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function deriveUsernameFromEmail(email: string, randomSuffix = Math.floor(100000 + Math.random() * 900000)): string {
  const localPart = email.split("@")[0] ?? "";
  const base = sanitizeUsernameBase(localPart).slice(0, 18);
  const suffix = String(randomSuffix);

  const buildCandidate = (prefix: string) => {
    let candidate = `${prefix}${suffix}`;
    if (candidate.length > 24) {
      candidate = `${prefix.slice(0, 24 - suffix.length)}${suffix}`;
    }
    return candidate;
  };

  if (base.length > 0) {
    const shortCandidate = buildCandidate(base);
    if (isValidGameUsername(shortCandidate)) {
      return shortCandidate;
    }
  }

  const prefix = base.length >= 3 ? base : "player";
  const candidate = buildCandidate(prefix);
  if (isValidGameUsername(candidate)) {
    return candidate;
  }
  return `player${suffix}`;
}
