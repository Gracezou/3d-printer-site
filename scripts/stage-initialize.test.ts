import { describe, expect, it } from 'vitest';

import {
  classifyDatabaseState,
  compareStageDatabaseClusters,
  expectedProjectTables,
  safeErrorCode,
  stageConnectionHint,
  supabaseProjectRefFromUrl,
} from './stage-initialize';

describe('stage database target guard', () => {
  const stageDirect =
    'postgresql://postgres:secret@db.stage-ref.supabase.co:5432/postgres';
  const stagePooler =
    'postgresql://postgres.stage-ref:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  const dev =
    'postgresql://postgres.dev-ref:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
  const production =
    'postgresql://postgres:secret@db.production-ref.supabase.co:5432/postgres';

  it('rejects the same Supabase project across direct and pooler URLs', () => {
    expect(
      compareStageDatabaseClusters(stageDirect, stagePooler, production),
    ).toEqual({ sameAsDev: true, sameAsProduction: false });
  });

  it('accepts a stage project distinct from development and production', () => {
    expect(compareStageDatabaseClusters(stageDirect, dev, production)).toEqual({
      sameAsDev: false,
      sameAsProduction: false,
    });
  });
});

describe('stage database state classification', () => {
  const projectTables = expectedProjectTables();

  it('derives the project table set from migrations', () => {
    for (const table of [
      'products',
      'refund_items',
      'return_requests',
      'return_request_items',
    ]) {
      expect(projectTables.has(table)).toBe(true);
    }
  });

  it('accepts an empty database and a partially migrated project database', () => {
    expect(classifyDatabaseState([], 0, projectTables)).toEqual({
      kind: 'empty',
    });
    expect(
      classifyDatabaseState(['products', 'orders'], 3, projectTables),
    ).toEqual({ kind: 'project', migrations: 3 });
  });

  it('rejects foreign tables and tables without migration history', () => {
    expect(
      classifyDatabaseState(['products', 'legacy_lamps'], 9, projectTables),
    ).toEqual({ kind: 'foreign' });
    expect(classifyDatabaseState(['products'], 0, projectTables)).toEqual({
      kind: 'foreign',
    });
    expect(classifyDatabaseState([], 10, projectTables)).toEqual({
      kind: 'foreign',
    });
  });
});

describe('stage storage project guard', () => {
  it('extracts the project ref only from HTTPS supabase.co URLs', () => {
    expect(supabaseProjectRefFromUrl('https://abcref.supabase.co')).toBe(
      'abcref',
    );
    expect(supabaseProjectRefFromUrl('http://abcref.supabase.co')).toBeNull();
    expect(supabaseProjectRefFromUrl('https://storage.example.com')).toBeNull();
  });
});

describe('stage error reporting', () => {
  it('prints only symbolic error codes', () => {
    expect(
      safeErrorCode(
        Object.assign(new Error('getaddrinfo ENOTFOUND db.secret.example'), {
          code: 'ENOTFOUND',
        }),
      ),
    ).toBe('ENOTFOUND');
    expect(
      safeErrorCode(Object.assign(new Error('x'), { code: 'db.secret host' })),
    ).toBe('Error');
  });

  it('suggests Session pooler for an unresolvable direct Supabase host', () => {
    const error = Object.assign(new Error('sensitive host omitted'), {
      code: 'ENOTFOUND',
    });
    expect(
      stageConnectionHint(
        error,
        'postgresql://postgres:secret@db.project-ref.supabase.co/postgres',
      ),
    ).toContain('Session pooler');
    expect(
      stageConnectionHint(
        error,
        'postgresql://postgres.project-ref:secret@region.pooler.supabase.com:5432/postgres',
      ),
    ).toBe('');
  });
});
