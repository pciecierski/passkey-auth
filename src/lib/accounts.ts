import { prisma } from "@/lib/prisma";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function lookupAccount(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      passkeys: {
        select: { id: true },
      },
    },
  });

  if (!user) {
    return {
      exists: false as const,
      hasPasskey: false,
    };
  }

  return {
    exists: true as const,
    hasPasskey: user.passkeys.length > 0,
    name: user.name,
  };
}
