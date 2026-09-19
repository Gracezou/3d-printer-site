import { describe, expect, it } from 'vitest';

import { migrationInspectionFailure } from './check-pending-migrations';
import { shouldSuggestSessionPooler } from './deploy-target';

describe('pending migration error reporting', () => {
  it('propagates only ENOTFOUND so deploy-target can suggest Session pooler', () => {
    const error = Object.assign(
      new Error('getaddrinfo ENOTFOUND db.sensitive-project.supabase.co'),
      { code: 'ENOTFOUND' },
    );
    const diagnostic = migrationInspectionFailure(error);

    expect(diagnostic).toContain('(ENOTFOUND)');
    expect(diagnostic).not.toContain('sensitive-project');
    expect(
      shouldSuggestSessionPooler(
        diagnostic,
        'db.fictional-project.supabase.co',
      ),
    ).toBe(true);
  });

  it('falls back to the error type without exposing an unsafe code or message', () => {
    const diagnostic = migrationInspectionFailure(
      Object.assign(new Error('secret connection detail'), {
        code: 'host=secret.example',
      }),
    );
    expect(diagnostic).toContain('(Error)');
    expect(diagnostic).not.toContain('secret');
  });
});
