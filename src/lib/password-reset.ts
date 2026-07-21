import { createHash, randomBytes } from "crypto";
import { normalizeEmail } from "@/lib/accounts";
import { getPublicAppOrigin, getSessionSecret } from "@/lib/config";
import { sendPasswordResetEmail } from "@/lib/mail";
import { hashPassword, validatePassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const RESET_TOKEN_MINUTES = 30;

const GENERIC_FORGOT_MESSAGE =
  "Jeśli konto z tym adresem istnieje, wysłaliśmy link do resetu hasła.";

function hashResetToken(token: string): string {
  return createHash("sha256").update(`${token}:${getSessionSecret()}`).digest("hex");
}

export async function cleanupExpiredPasswordResetTokens(): Promise<void> {
  await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lte: new Date() } }, { usedAt: { not: null } }],
    },
  });
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  await cleanupExpiredPasswordResetTokens();

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Always return the same message to avoid account enumeration.
  if (!user?.passwordHash) {
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id },
  });

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + RESET_TOKEN_MINUTES);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: hashResetToken(rawToken),
      expiresAt,
    },
  });

  const resetUrl = new URL("/reset", getPublicAppOrigin());
  resetUrl.searchParams.set("token", rawToken);

  await sendPasswordResetEmail({
    to: normalizedEmail,
    resetUrl: resetUrl.toString(),
    expiresInMinutes: RESET_TOKEN_MINUTES,
  });

  return { message: GENERIC_FORGOT_MESSAGE };
}

export async function resetPasswordWithToken(
  rawToken: string,
  password: string,
  confirmPassword: string,
): Promise<{ email: string }> {
  await cleanupExpiredPasswordResetTokens();

  if (!rawToken?.trim()) {
    throw new Error("Link resetu jest nieprawidłowy lub wygasł.");
  }

  if (!password || !confirmPassword) {
    throw new Error("Hasło i potwierdzenie są wymagane.");
  }

  if (password !== confirmPassword) {
    throw new Error("Hasła nie są identyczne.");
  }

  validatePassword(password);

  const tokenEntry = await prisma.passwordResetToken.findFirst({
    where: {
      token: hashResetToken(rawToken.trim()),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!tokenEntry) {
    throw new Error("Link resetu jest nieprawidłowy lub wygasł.");
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: tokenEntry.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenEntry.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: tokenEntry.userId,
        id: { not: tokenEntry.id },
      },
    }),
    prisma.session.deleteMany({
      where: { userId: tokenEntry.userId },
    }),
  ]);

  return { email: tokenEntry.user.email };
}
