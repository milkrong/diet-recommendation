import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { captureException } from "@/lib/observability/sentry";
import { plannerProfileSchema } from "@/lib/schema";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const db = getDb();

    const [profile] = await db
      .select({
        name: userProfiles.name,
        age: userProfiles.age,
        goals: userProfiles.goals,
        schedule: userProfiles.schedule,
        preferences: userProfiles.preferences,
        conditions: userProfiles.conditions,
        trainingFrequency: userProfiles.trainingFrequency,
        notes: userProfiles.notes
      })
      .from(userProfiles)
      .where(eq(userProfiles.clerkUserId, userId))
      .orderBy(desc(userProfiles.updatedAt))
      .limit(1);

    return NextResponse.json({ profile: profile ?? null });
  } catch (error) {
    captureException(error, {
      tags: {
        area: "api",
        route: "/api/profile",
        method: "GET"
      }
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取用户画像失败。"
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await request.json();
    const profile = plannerProfileSchema.parse(body);

    const db = getDb();

    await db
      .insert(userProfiles)
      .values({
        clerkUserId: userId,
        ...profile,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: userProfiles.clerkUserId,
        set: {
          ...profile,
          updatedAt: new Date()
        }
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureException(error, {
      tags: {
        area: "api",
        route: "/api/profile",
        method: "PUT"
      }
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "保存用户画像失败。"
      },
      { status: 500 }
    );
  }
}
