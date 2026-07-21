export type PasswordResetEmailParams = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  const subject = "Reset hasła — Passkey Auth";
  const text = [
    "Otrzymaliśmy prośbę o reset hasła do Twojego konta.",
    "",
    `Ustaw nowe hasło, otwierając ten link (ważny ${params.expiresInMinutes} min):`,
    params.resetUrl,
    "",
    "Jeśli to nie Ty, zignoruj tę wiadomość.",
  ].join("\n");

  const html = `
    <p>Otrzymaliśmy prośbę o reset hasła do Twojego konta.</p>
    <p>
      <a href="${params.resetUrl}">Ustaw nowe hasło</a>
      (link ważny ${params.expiresInMinutes} min).
    </p>
    <p>Jeśli to nie Ty, zignoruj tę wiadomość.</p>
  `.trim();

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[password-reset] RESEND_API_KEY not set — reset link for %s:\n%s", params.to, params.resetUrl);
    return;
  }

  const from = process.env.EMAIL_FROM?.trim() || "Passkey Auth <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[password-reset] Resend failed:", response.status, detail);
    throw new Error("Nie udało się wysłać wiadomości e-mail. Spróbuj ponownie później.");
  }
}
