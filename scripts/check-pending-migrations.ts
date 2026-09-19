import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { assertMigrationDatabaseUrl } from './assert-local-database';
import { safeErrorCode } from './safe-error-code';

type Journal = {
  entries: Array<{ when: number }>;
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  assertMigrationDatabaseUrl(databaseUrl);

  const journalPath = path.resolve(
    process.cwd(),
    'src/lib/db/migrations/meta/_journal.json',
  );
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as Journal;
  const latestLocal = Math.max(0, ...journal.entries.map((entry) => entry.when));
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const [table] = await sql<{ exists: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists
    `;
    if (!table?.exists) {
      process.stdout.write('pending\n');
      return;
    }

    const [migration] = await sql<{ createdAt: string | null }[]>`
      select created_at::text as "createdAt"
      from drizzle.__drizzle_migrations
      order by created_at desc
      limit 1
    `;
    const latestRemote = Number(migration?.createdAt ?? 0);
    process.stdout.write(latestRemote < latestLocal ? 'pending\n' : 'current\n');
  } finally {
    await sql.end();
  }
}

export function migrationInspectionFailure(error: unknown): string {
  return `Unable to inspect migration state (${safeErrorCode(error)}); target details were intentionally omitted.`;
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  main().catch((error: unknown) => {
    process.stderr.write(`${migrationInspectionFailure(error)}\n`);
    process.exitCode = 1;
  });
}
