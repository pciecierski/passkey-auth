import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

/**
 * Prefer cross-device (phone) passkeys so the browser shows a native FIDO QR.
 * Scanning that QR suggests the site passkey in the phone OS UI — it does not open a webpage.
 */
export function withHybridPreference<
  T extends PublicKeyCredentialRequestOptionsJSON | PublicKeyCredentialCreationOptionsJSON,
>(options: T): T {
  const next = { ...options, hints: ["hybrid"] as const };

  if ("allowCredentials" in next && Array.isArray(next.allowCredentials)) {
    next.allowCredentials = next.allowCredentials.map((credential) => ({
      ...credential,
      transports: Array.from(
        new Set([...(credential.transports ?? []), "hybrid"]),
      ) as NonNullable<(typeof credential)["transports"]>,
    }));
  }

  return next;
}

export async function startHybridAuthentication(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  return startAuthentication({
    optionsJSON: withHybridPreference(optionsJSON),
  });
}

export async function startHybridRegistration(
  optionsJSON: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  return startRegistration({
    optionsJSON: withHybridPreference(optionsJSON),
  });
}
