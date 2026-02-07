import { initDb, getDb, getDbInstance, closeDb } from "@opengrant/database";
import { config } from "../config/index.js";

// Initialize database on first import
const dbInstance = initDb(config.database.url, config.database.poolSize);

// Export the drizzle instance for queries
export const db = dbInstance.db;

// Export utility functions
export async function testConnection(): Promise<boolean> {
  return dbInstance.testConnection();
}

export async function closeDatabase(): Promise<void> {
  return closeDb();
}

// Re-export for convenience
export { getDb, getDbInstance, closeDb };
