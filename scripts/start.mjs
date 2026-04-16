import { spawn } from "node:child_process";
import process from "node:process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.log("Running database migrations...");
    await run("node", ["scripts/migrate.mjs"]);
  } else {
    console.log("DATABASE_URL is not set, skipping migrations.");
  }

  console.log("Starting Next.js server...");
  await run("node", ["server.js"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
