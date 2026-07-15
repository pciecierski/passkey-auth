import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/accounts";

const HANDOFF_TTL_MS = 10 * 60 * 1000;

export async function createAuthHandoff(email?: string): Promise<string> {
  await prisma.authHandoff.deleteMany({
    where: {
      expiresAt: { lte: new Date() },
    },
  });

  const handoff = await prisma.authHandoff.create({
    data: {
      email: email ? normalizeEmail(email) : null,
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    },
  });

  return handoff.id;
}

export async function completeAuthHandoff(
  handoffId: string | undefined,
  userId: string,
  email: string,
): Promise<void> {
  if (!handoffId) {
    return;
  }

  const handoff = await prisma.authHandoff.findUnique({
    where: { id: handoffId },
  });

  if (!handoff || handoff.expiresAt <= new Date() || handoff.userId) {
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  if (handoff.email && handoff.email !== normalizedEmail) {
    return;
  }

  await prisma.authHandoff.update({
    where: { id: handoffId },
    data: { userId },
  });
}

export async function claimAuthHandoff(handoffId: string) {
  const handoff = await prisma.authHandoff.findUnique({
    where: { id: handoffId },
  });

  if (!handoff || handoff.expiresAt <= new Date()) {
    await prisma.authHandoff.deleteMany({ where: { id: handoffId } });
    return { status: "expired" as const };
  }

  if (!handoff.userId) {
    return { status: "pending" as const };
  }

  await prisma.authHandoff.update({
    where: { id: handoffId },
    data: { claimedAt: new Date() },
  });

  return { status: "ready" as const, userId: handoff.userId };
}

export async function cleanupAuthHandoff(handoffId: string): Promise<void> {
  await prisma.authHandoff.deleteMany({ where: { id: handoffId } });
}
