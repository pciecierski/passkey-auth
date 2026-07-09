import { NextResponse } from "next/server";
import { lookupAccount } from "@/lib/accounts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const result = await lookupAccount(body.email ?? "");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
