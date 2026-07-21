import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/password-reset";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const result = await requestPasswordReset(body.email ?? "");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
