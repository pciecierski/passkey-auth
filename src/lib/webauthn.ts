import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/accounts";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/password";
import { getWebAuthnConfig } from "@/lib/config";
import { consumeChallenge, getChallengeFromClientData, storeChallenge } from "@/lib/challenge-store";

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  return value.split(",").filter(Boolean) as AuthenticatorTransportFuture[];
}

export async function beginRegistration(
  email: string,
  name?: string,
  settings?: {
    allowExistingAccount?: boolean;
    password?: string;
    preferHybrid?: boolean;
  },
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { passkeys: true },
  });

  let passwordHash: string | undefined;

  if (existingUser) {
    if (existingUser.passkeys.length > 0) {
      throw new Error("Konto już istnieje. Zaloguj się.");
    }

    if (settings?.allowExistingAccount) {
      // Logowanie: dodanie Passkey bez hasła (flow z zakładki logowania).
    } else {
      if (!settings?.password) {
        throw new Error("Podaj aktualne hasło do tego konta.");
      }

      if (!existingUser.passwordHash) {
        throw new Error("To konto nie ma ustawionego hasła. Skontaktuj się z administratorem.");
      }

      const passwordValid = await verifyPassword(settings.password, existingUser.passwordHash);
      if (!passwordValid) {
        throw new Error("Nieprawidłowe hasło.");
      }
    }
  } else {
    if (!settings?.password) {
      throw new Error("Hasło jest wymagane.");
    }

    validatePassword(settings.password);
    passwordHash = await hashPassword(settings.password);
  }

  const { rpName, rpID } = getWebAuthnConfig();

  const registrationOptions = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: normalizedEmail,
    userDisplayName: name?.trim() || existingUser?.name || normalizedEmail,
    attestationType: "none",
    excludeCredentials: existingUser?.passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: parseTransports(passkey.transports),
    })) ?? [],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    // Desktop: remoteDevice → native FIDO QR for creating the passkey on a phone.
    // Mobile: localDevice → Face ID / fingerprint on this device.
    preferredAuthenticatorType: settings?.preferHybrid ? "remoteDevice" : "localDevice",
  });

  await storeChallenge(registrationOptions.challenge, {
    challenge: registrationOptions.challenge,
    userId: existingUser?.id,
    email: normalizedEmail,
    name: name?.trim() || existingUser?.name || normalizedEmail,
    passwordHash,
  });

  return registrationOptions;
}

export async function finishRegistration(response: RegistrationResponseJSON) {
  const challengeKey = getChallengeFromClientData(response.response.clientDataJSON);
  const challengeEntry = await consumeChallenge(challengeKey);

  if (!challengeEntry?.email) {
    throw new Error("Registration challenge expired or invalid");
  }

  const { rpID, origin } = getWebAuthnConfig();

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeEntry.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey verification failed");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  let user = challengeEntry.userId
    ? await prisma.user.findUnique({ where: { id: challengeEntry.userId } })
    : null;

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: challengeEntry.email,
        name: challengeEntry.name,
        passwordHash: challengeEntry.passwordHash,
      },
    });
  }

  await prisma.passkey.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports?.join(",") ?? null,
    },
  });

  return user;
}

export async function beginAuthentication(
  email: string,
  settings?: { preferHybrid?: boolean },
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  const { rpID } = getWebAuthnConfig();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { passkeys: true },
  });

  if (!user) {
    throw new Error("Account not found. Register first.");
  }

  if (user.passkeys.length === 0) {
    throw new Error("No passkey found for this account. Create one first.");
  }

  const allowCredentials = user.passkeys.map((passkey) => {
    const transports = parseTransports(passkey.transports) ?? [];
    if (settings?.preferHybrid && !transports.includes("hybrid")) {
      transports.push("hybrid");
    }
    return {
      id: passkey.credentialId,
      transports: transports.length > 0 ? transports : undefined,
    };
  });

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: "preferred",
  });

  await storeChallenge(options.challenge, {
    challenge: options.challenge,
    email: normalizedEmail,
  });

  if (settings?.preferHybrid) {
    return {
      ...options,
      hints: ["hybrid"] as const,
    };
  }

  return options;
}

export async function finishAuthentication(response: AuthenticationResponseJSON) {
  const challengeKey = getChallengeFromClientData(response.response.clientDataJSON);
  const challengeEntry = await consumeChallenge(challengeKey);

  if (!challengeEntry) {
    throw new Error("Authentication challenge expired or invalid");
  }

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });

  if (!passkey) {
    throw new Error("Unknown passkey");
  }

  if (challengeEntry.email && passkey.user.email !== challengeEntry.email) {
    throw new Error("Passkey does not belong to this account");
  }

  const { rpID, origin } = getWebAuthnConfig();

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeEntry.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: Number(passkey.counter),
      transports: parseTransports(passkey.transports),
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw new Error("Passkey verification failed");
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  });

  return passkey.user;
}
