import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMobileAuthUrl, getAppOrigin } from "@/lib/mobile-auth-url";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("getAppOrigin", () => {
  it("returns empty string on the server", () => {
    expect(getAppOrigin()).toBe("");
  });

  it("prefers NEXT_PUBLIC_APP_URL when available in the browser", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    process.env.NEXT_PUBLIC_APP_URL = "https://passkey-auth.example.com/";
    expect(getAppOrigin()).toBe("https://passkey-auth.example.com");
  });

  it("falls back to window.location.origin", () => {
    vi.stubGlobal("window", { location: { origin: "http://10.0.0.5:3000" } });
    expect(getAppOrigin()).toBe("http://10.0.0.5:3000");
  });
});

describe("buildMobileAuthUrl", () => {
  it("builds a QR deep-link with normalized email and optional handoff", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });

    const url = buildMobileAuthUrl({
      mode: "login",
      email: "  User@Example.COM ",
      step: "action",
      handoffId: "handoff-123",
    });

    expect(url).toBe(
      "http://localhost:3000/?mobile=1&tab=login&email=user%40example.com&from=qr&step=action&handoff=handoff-123",
    );
  });
});
