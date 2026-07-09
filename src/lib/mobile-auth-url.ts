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
}): string {
  const url = new URL("/", getAppOrigin());
  url.searchParams.set("mobile", "1");
  url.searchParams.set("tab", params.mode);
  url.searchParams.set("email", params.email.trim().toLowerCase());

  if (params.step) {
    url.searchParams.set("step", params.step);
  }

  return url.toString();
}
