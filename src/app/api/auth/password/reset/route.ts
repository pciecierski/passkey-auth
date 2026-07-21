import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/password-reset";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      password?: string;
      confirmPassword?: string;
    };

    const result = await resetPasswordWithToken(
      body.token ?? "",
      body.password ?? "",
      body.confirmPassword ?? "",
    );

    return NextResponse.json({
      message: "Hasło zostało zmienione. Możesz teraz odzyskać dostęp Passkey.",
      email: result.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
