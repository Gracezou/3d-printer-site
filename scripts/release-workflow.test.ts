import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  path.resolve(import.meta.dirname, '..', '.github', 'workflows', 'release-image.yml'),
  'utf8',
);

describe('release image workflow environment guard', () => {
  it('requires an environment marker and all four build-time public variables', () => {
    expect(workflow).toContain('BUILD_ENVIRONMENT: ${{ vars.BUILD_ENVIRONMENT }}');
    expect(workflow).toContain(
      'test "$BUILD_ENVIRONMENT" = "$DEPLOY_ENVIRONMENT"',
    );
    for (const variable of [
      'NEXT_PUBLIC_SITE_URL',
      'NEXT_PUBLIC_ICP_LICENSE',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ]) {
      expect(workflow).toContain(`${variable}: \${{ vars.${variable} }}`);
      expect(workflow).toContain(`test -n "$${variable}"`);
    }
  });
});
