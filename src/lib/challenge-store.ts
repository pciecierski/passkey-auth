import { prisma } from "@/lib/prisma";

export type ChallengeEntry = {
  challenge: string;
  userId?: string;
  email?: string;
  name?: string;
  passwordHash?: string;
};

const TTL_MS = 5 * 60 * 1000;

async function cleanupExpired(): Promise<void> {
  await prisma.webAuthnChallenge.deleteMany({
    where: {
      expiresAt: { lte: new Date() },
    },
  });
}

export async function storeChallenge(key: string, data: ChallengeEntry): Promise<void> {
  await cleanupExpired();

  await prisma.webAuthnChallenge.upsert({
    where: { challenge: key },
    update: {
      userId: data.userId,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
    create: {
      challenge: key,
      userId: data.userId,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
}

export async function consumeChallenge(key: string): Promise<ChallengeEntry | null> {
  await cleanupExpired();

  const entry = await prisma.webAuthnChallenge.findUnique({
    where: { challenge: key },
  });

  if (!entry || entry.expiresAt <= new Date()) {
    if (entry) {
      await prisma.webAuthnChallenge.delete({ where: { id: entry.id } });
    }
    return null;
  }

  await prisma.webAuthnChallenge.delete({ where: { id: entry.id } });

  return {
    challenge: entry.challenge,
    userId: entry.userId ?? undefined,
    email: entry.email ?? undefined,
    name: entry.name ?? undefined,
    passwordHash: entry.passwordHash ?? undefined,
  };
}

export function getChallengeFromClientData(clientDataJSON: string): string {
  const clientData = JSON.parse(
    Buffer.from(clientDataJSON, "base64url").toString("utf8"),
  ) as { challenge?: string };

  if (!clientData.challenge) {
    throw new Error("Missing challenge in client data");
  }

  return clientData.challenge;
}
