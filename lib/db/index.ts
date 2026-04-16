import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { userProfiles } from "@/lib/db/schema";

declare global {
  var __dietAgentPgPool: Pool | undefined;
  var __dietAgentDb:
    | ReturnType<typeof drizzle<typeof import("@/lib/db/schema")>>
    | undefined;
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

function getPool() {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    throw new Error("缺少 DATABASE_URL，请先配置 PostgreSQL 连接。");
  }

  if (!globalThis.__dietAgentPgPool) {
    globalThis.__dietAgentPgPool = new Pool({
      connectionString
    });
  }

  return globalThis.__dietAgentPgPool;
}

export function getDb() {
  if (!globalThis.__dietAgentDb) {
    globalThis.__dietAgentDb = drizzle(getPool(), {
      schema: { userProfiles }
    });
  }

  return globalThis.__dietAgentDb;
}
