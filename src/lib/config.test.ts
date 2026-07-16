import { afterEach, describe, expect, it } from "vitest";
import {
  getSessionSecret,
  getWebAuthnConfig,
  normalizeOrigin,
  normalizeRpId,
} from "@/lib/config";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("normalizeRpId", () => {
  it("strips protocol, path, and port", () => {
    expect(normalizeRpId("https://passkey-auth.example.com:443/app")).toBe(
      "passkey-auth.example.com",
    );
  });

  it("removes surrounding quotes and whitespace", () => {
    expect(normalizeRpId('  "localhost"  ')).toBe("localhost");
  });
});

describe("normalizeOrigin", () => {
  it("keeps an absolute http(s) origin without trailing slash", () => {
    expect(normalizeOrigin("https://passkey-auth.example.com/")).toBe(
      "https://passkey-auth.example.com",
    );
  });

  it("adds https when protocol is missing", () => {
    expect(normalizeOrigin("passkey-auth.example.com")).toBe(
      "https://passkey-auth.example.com",
    );
  });

  it("falls back to localhost for empty values", () => {
    expect(normalizeOrigin("   ")).toBe("http://localhost:3000");
  });
});

describe("getWebAuthnConfig", () => {
  it("reads RP settings from env with defaults", () => {
    delete process.env.RP_NAME;
    process.env.RP_ID = "https://example.com/path";
    process.env.ORIGIN = "example.com";

    expect(getWebAuthnConfig()).toEqual({
      rpName: "Passkey Auth",
      rpID: "example.com",
      origin: "https://example.com",
    });
  });
});

describe("getSessionSecret", () => {
  it("returns the configured secret", () => {
    process.env.SESSION_SECRET = "test-secret";
    expect(getSessionSecret()).toBe("test-secret");
  });

  it("throws when SESSION_SECRET is missing", () => {
    delete process.env.SESSION_SECRET;
    expect(() => getSessionSecret()).toThrow("SESSION_SECRET is not set");
  });
});
