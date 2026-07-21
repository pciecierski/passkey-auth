import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("sendPasswordResetEmail", () => {
  it("logs the reset link when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { sendPasswordResetEmail } = await import("@/lib/mail");

    await sendPasswordResetEmail({
      to: "user@example.com",
      resetUrl: "http://localhost:3000/reset?token=abc",
      expiresInMinutes: 30,
    });

    expect(info).toHaveBeenCalled();
    expect(info.mock.calls[0]?.[2]).toBe("http://localhost:3000/reset?token=abc");
  });
});
