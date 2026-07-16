import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(() => validatePassword("short")).toThrow(
      "Hasło musi mieć co najmniej 8 znaków.",
    );
  });

  it("accepts passwords with at least 8 characters", () => {
    expect(() => validatePassword("long-enough")).not.toThrow();
  });
});

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies a valid password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(hash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    await expect(verifyPassword("correct-horse", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("returns false for missing or malformed stored hashes", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-hash")).resolves.toBe(false);
  });
});
