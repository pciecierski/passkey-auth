import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishAuthentication } from "@/lib/webauthn";
import { completeAuthHandoff } from "@/lib/handoff";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AuthenticationResponseJSON & {
      handoffId?: string;
    };
    const { handoffId, ...assertion } = body;
    const user = await finishAuthentication(assertion);
    await createSession(user.id);
    await completeAuthHandoff(handoffId, user.id, user.email);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
