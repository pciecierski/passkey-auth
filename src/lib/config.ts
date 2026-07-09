export function getWebAuthnConfig() {
  const rpName = process.env.RP_NAME ?? "Passkey Auth";
  const rpID = process.env.RP_ID ?? "localhost";
  const origin = process.env.ORIGIN ?? "http://localhost:3000";

  return { rpName, rpID, origin };
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return secret;
}
