import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

interface DatabaseState {
  queryClient?: Sql;
  database?: PostgresJsDatabase;
}

const globalDatabase = globalThis as typeof globalThis & {
  databaseState?: DatabaseState;
};
const databaseState = (globalDatabase.databaseState ??= {});

function getPoolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX ?? 5);
  return Number.isInteger(configured) && configured > 0 ? configured : 5;
}

export function getDb(): PostgresJsDatabase {
  if (databaseState.database) {
    return databaseState.database;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  databaseState.queryClient = postgres(databaseUrl, {
    max: getPoolMax(),
    prepare: false,
  });
  databaseState.database = drizzle(databaseState.queryClient);
  return databaseState.database;
}

export async function checkDatabaseConnection(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client =
    databaseState.queryClient ??
    postgres(databaseUrl, { max: 1, prepare: false });

  try {
    await client`SELECT 1`;
  } finally {
    if (!databaseState.queryClient) {
      await client.end();
    }
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (databaseState.queryClient) {
    await databaseState.queryClient.end();
    databaseState.queryClient = undefined;
    databaseState.database = undefined;
  }
}
