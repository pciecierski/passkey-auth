import { afterEach, describe, expect, it, vi } from "vitest";
import { isDesktopBrowser, isIPadBrowser } from "@/lib/device";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isIPadBrowser", () => {
  it("detects classic iPad user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
      maxTouchPoints: 5,
    });
    expect(isIPadBrowser()).toBe(true);
  });

  it("detects iPadOS desktop-mode Safari", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 5,
    });
    expect(isIPadBrowser()).toBe(true);
  });
});

describe("isDesktopBrowser", () => {
  it("returns true for desktop Chrome", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      maxTouchPoints: 0,
    });
    expect(isDesktopBrowser()).toBe(true);
  });

  it("returns false for iPhone", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      maxTouchPoints: 5,
    });
    expect(isDesktopBrowser()).toBe(false);
  });
});
