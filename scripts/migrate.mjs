import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../drizzle");

async function ensureMigrationsTable(db) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      executed_at timestamptz NOT NULL DEFAULT now()
    )
  `));
}

async function getExecutedMigrations(db) {
  const result = await db.execute(
    sql`select filename, checksum from app_migrations order by executed_at asc`
  );

  return new Map(
    result.rows.map((row) => [String(row.filename), String(row.checksum)])
  );
}

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("缺少 DATABASE_URL，请先配置 PostgreSQL 连接。");
  }

  const pool = new Pool({
    connectionString: databaseUrl
  });

  const db = drizzle(pool);

  try {
    await ensureMigrationsTable(db);

    const files = (await readdir(migrationsDir))
      .filter((entry) => entry.endsWith(".sql"))
      .sort();

    const executed = await getExecutedMigrations(db);

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const content = await readFile(fullPath, "utf8");
      const digest = checksum(content);
      const existingChecksum = executed.get(file);

      if (existingChecksum === digest) {
        console.log(`skip ${file}`);
        continue;
      }

      if (existingChecksum && existingChecksum !== digest) {
        throw new Error(`迁移文件已执行但内容发生变化：${file}`);
      }

      console.log(`apply ${file}`);

      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(content));
        await tx.execute(
          sql`insert into app_migrations (filename, checksum) values (${file}, ${digest})`
        );
      });
    }

    console.log("migrations complete");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
