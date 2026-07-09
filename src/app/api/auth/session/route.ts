import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      passkeys: user.passkeys,
    },
  });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
