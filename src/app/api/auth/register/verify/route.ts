import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { finishRegistration } from "@/lib/webauthn";
import { completeAuthHandoff } from "@/lib/handoff";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegistrationResponseJSON & {
      handoffId?: string;
    };
    const { handoffId, ...attestation } = body;
    const user = await finishRegistration(attestation);
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
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
