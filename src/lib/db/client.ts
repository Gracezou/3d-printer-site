import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

let queryClient: Sql | undefined;
let database: PostgresJsDatabase | undefined;

export function getDb(): PostgresJsDatabase {
  if (database) {
    return database;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  queryClient = postgres(databaseUrl, { max: 10, prepare: false });
  database = drizzle(queryClient);
  return database;
}

export async function checkDatabaseConnection(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client =
    queryClient ?? postgres(databaseUrl, { max: 1, prepare: false });

  try {
    await client`SELECT 1`;
  } finally {
    if (!queryClient) {
      await client.end();
    }
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (queryClient) {
    await queryClient.end();
    queryClient = undefined;
    database = undefined;
  }
}
