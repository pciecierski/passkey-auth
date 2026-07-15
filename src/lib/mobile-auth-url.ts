export function getAppOrigin(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return window.location.origin;
}

export function buildMobileAuthUrl(params: {
  mode: "login" | "register";
  email: string;
  step?: "action";
  handoffId?: string;
}): string {
  const url = new URL("/", getAppOrigin());
  url.searchParams.set("mobile", "1");
  url.searchParams.set("tab", params.mode);
  url.searchParams.set("email", params.email.trim().toLowerCase());
  url.searchParams.set("from", "qr");

  if (params.step) {
    url.searchParams.set("step", params.step);
  }

  if (params.handoffId) {
    url.searchParams.set("handoff", params.handoffId);
  }

  return url.toString();
}
