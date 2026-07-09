function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

export function normalizeRpId(value: string): string {
  return stripQuotes(value)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function normalizeOrigin(value: string): string {
  const cleaned = stripQuotes(value).replace(/\/$/, "");

  if (!cleaned) {
    return "http://localhost:3000";
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  return `https://${cleaned}`;
}

export function getWebAuthnConfig() {
  const rpName = process.env.RP_NAME ?? "Passkey Auth";
  const rpID = normalizeRpId(process.env.RP_ID ?? "localhost");
  const origin = normalizeOrigin(process.env.ORIGIN ?? "http://localhost:3000");

  return { rpName, rpID, origin };
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return secret;
}
