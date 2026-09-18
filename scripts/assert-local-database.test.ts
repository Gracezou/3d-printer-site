import { describe, expect, it } from 'vitest';

import {
  assertLocalDatabaseUrl,
  assertMigrationDatabaseUrl,
} from './assert-local-database';

describe('assertLocalDatabaseUrl', () => {
  it.each(['postgres://u:p@localhost/db', 'postgres://u:p@127.0.0.1:5432/db'])(
    'allows local database %s',
    (url) => expect(() => assertLocalDatabaseUrl(url)).not.toThrow(),
  );

  it('rejects remote databases unless explicitly overridden', () => {
    expect(() =>
      assertLocalDatabaseUrl('postgres://u:p@db.example.supabase.co/db'),
    ).toThrow(/only run against localhost/);
    expect(() =>
      assertLocalDatabaseUrl('postgres://u:p@db.example.supabase.co/db', true),
    ).not.toThrow();
  });

  it('requires a dedicated flag and exact host confirmation for remote migrations', () => {
    const remote = 'postgres://u:p@db.example.supabase.co/db';
    expect(() => assertMigrationDatabaseUrl(remote)).toThrow(
      /only run against localhost/,
    );
    expect(() => assertMigrationDatabaseUrl(remote, true)).toThrow(
      /CONFIRM_REMOTE_DATABASE_HOST to match/,
    );
    expect(
      assertMigrationDatabaseUrl(remote, true, 'db.example.supabase.co'),
    ).toBe('db.example.supabase.co');
  });
});
