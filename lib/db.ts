// Server-only database access. Never import this from client components.
//
// Per plan.md: use the Neon serverless driver's HTTP tagged-template for
// one-shot reads (project-state), and its WebSocket-backed Client for the
// interactive write transaction (the advisory lock + ownership check +
// insert in POST /update). Separate HTTP queries cannot share a transaction.

import "server-only";
import { neon, Client, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

// One-shot HTTP query helper, for reads that don't need a transaction.
export const sql = neon(requireDatabaseUrl());

// A connected, ready-to-use Client for an interactive transaction. Callers
// must call `client.end()` (typically in a `finally` block) once done.
export async function withTransaction<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(requireDatabaseUrl());
  await client.connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}
