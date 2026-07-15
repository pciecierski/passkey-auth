import { NextResponse } from "next/server";
import { beginAuthentication } from "@/lib/webauthn";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      preferHybrid?: boolean;
    };
    if (!body.email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const options = await beginAuthentication(body.email, {
      preferHybrid: body.preferHybrid === true,
    });
    return NextResponse.json(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
