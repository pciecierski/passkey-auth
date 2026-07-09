import { NextResponse } from "next/server";
import { createAuthHandoff } from "@/lib/handoff";
import { normalizeEmail } from "@/lib/accounts";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const handoffId = await createAuthHandoff(
      body.email ? normalizeEmail(body.email) : undefined,
    );

    return NextResponse.json({ handoffId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handoff creation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
