import { NextResponse } from "next/server";
import { claimAuthHandoff, cleanupAuthHandoff } from "@/lib/handoff";
import { createSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { handoffId?: string };
    if (!body.handoffId) {
      return NextResponse.json({ error: "handoffId is required" }, { status: 400 });
    }

    const result = await claimAuthHandoff(body.handoffId);

    if (result.status === "pending") {
      return NextResponse.json({ status: "pending" }, { status: 202 });
    }

    if (result.status === "expired") {
      return NextResponse.json({ error: "Handoff expired" }, { status: 410 });
    }

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      include: {
        passkeys: {
          select: {
            id: true,
            deviceType: true,
            backedUp: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      await cleanupAuthHandoff(body.handoffId);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await createSession(user.id);
    await cleanupAuthHandoff(body.handoffId);

    return NextResponse.json({
      status: "complete",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        passkeys: user.passkeys,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handoff claim failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
