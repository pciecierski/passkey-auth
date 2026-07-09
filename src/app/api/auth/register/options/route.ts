import { NextResponse } from "next/server";
import { beginRegistration } from "@/lib/webauthn";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      password?: string;
      confirmPassword?: string;
      allowExistingAccount?: boolean;
    };

    if (!body.allowExistingAccount) {
      if (!body.password || !body.confirmPassword) {
        return NextResponse.json({ error: "Hasło i potwierdzenie są wymagane." }, { status: 400 });
      }

      if (body.password !== body.confirmPassword) {
        return NextResponse.json({ error: "Hasła nie są identyczne." }, { status: 400 });
      }
    }

    const options = await beginRegistration(body.email ?? "", body.name, {
      allowExistingAccount: body.allowExistingAccount,
      password: body.password,
    });
    return NextResponse.json(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
