// One-off migration runner. Not part of the request path (plan.md: "Do not
// run migrations inside request handlers or every build").
//
// Usage:
//   DATABASE_URL_UNPOOLED=... npx tsx scripts/migrate.ts db/001_init.sql
//
// Uses the direct (non-pooled) connection string, as schema changes should
// not go through the PgBouncer transaction-mode pooler.

import { readFileSync } from "node:fs";
import { Client, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx scripts/migrate.ts <path-to-sql-file>");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    console.error("DATABASE_URL_UNPOOLED is not set");
    process.exit(1);
  }

  const sql = readFileSync(file, "utf8");
  const client = new Client(connectionString);
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
