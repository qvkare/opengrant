import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export * from "./schema.js";

// Type for the database instance
export type Database = ReturnType<typeof createDb>;

// Create database connection with pool
export function createDb(connectionString: string, poolSize = 10) {
  const pool = new Pool({
    connectionString,
    max: poolSize,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Handle pool errors
  pool.on("error", (err: Error) => {
    console.error("Unexpected database pool error:", err);
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async testConnection(): Promise<boolean> {
      try {
        const client = await pool.connect();
        await client.query("SELECT 1");
        client.release();
        return true;
      } catch (error) {
        console.error("Database connection failed:", error);
        return false;
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

// Singleton instance for server-side usage
let dbInstance: ReturnType<typeof createDb> | null = null;

export function initDb(connectionString: string, poolSize = 10): ReturnType<typeof createDb> {
  if (!dbInstance) {
    dbInstance = createDb(connectionString, poolSize);
  }
  return dbInstance;
}

export function getDb(): ReturnType<typeof createDb>["db"] {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    dbInstance = createDb(connectionString);
  }
  return dbInstance.db;
}

export function getDbInstance(): ReturnType<typeof createDb> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    dbInstance = createDb(connectionString);
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
