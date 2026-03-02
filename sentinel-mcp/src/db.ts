/**
 * Database connection pool for Sentinel MCP server.
 *
 * Safety features:
 * - Every query wrapped in BEGIN READ ONLY transaction
 * - 10-second statement timeout
 * - Max 3 connections (read-only query tool, not high-throughput)
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 10_000,
      ssl: { rejectUnauthorized: false },
    });

    pool.on("error", (err) => {
      console.error("[sentinel-mcp] Unexpected pool error:", err.message);
    });
  }
  return pool;
}

/**
 * Execute a read-only query with safety enforcement.
 * Wraps in a read-only transaction with 10s timeout.
 */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query("SET statement_timeout = '10s'");
    await client.query("BEGIN READ ONLY");
    const result = await client.query<T>(sql, params);
    await client.query("COMMIT");
    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function shutdown(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
