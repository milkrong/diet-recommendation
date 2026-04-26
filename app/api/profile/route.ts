import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { captureException, logEvent } from "@/lib/observability/sentry";
import { plannerProfileSchema } from "@/lib/schema";

export async function GET() {
  try {
    logEvent("info", "Profile load request received", {
      area: "api",
      route: "/api/profile",
      method: "GET"
    });
    const { userId } = await auth();

    if (!userId) {
      logEvent("warn", "Profile load rejected without auth", {
        area: "api",
        route: "/api/profile",
        method: "GET",
        status_code: 401
      });
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

    logEvent("info", "Profile load completed", {
      area: "api",
      route: "/api/profile",
      method: "GET",
      status_code: 200,
      has_profile: Boolean(profile)
    });

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
    logEvent("info", "Profile save request received", {
      area: "api",
      route: "/api/profile",
      method: "PUT"
    });
    const { userId } = await auth();

    if (!userId) {
      logEvent("warn", "Profile save rejected without auth", {
        area: "api",
        route: "/api/profile",
        method: "PUT",
        status_code: 401
      });
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await request.json();
    const profile = plannerProfileSchema.parse(body);
    logEvent("info", "Profile save payload validated", {
      area: "api",
      route: "/api/profile",
      method: "PUT",
      goals_count: profile.goals.length,
      preferences_count: profile.preferences.length,
      conditions_count: profile.conditions.length
    });

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

    logEvent("info", "Profile save completed", {
      area: "api",
      route: "/api/profile",
      method: "PUT",
      status_code: 200
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
