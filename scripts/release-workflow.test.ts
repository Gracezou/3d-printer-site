import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  path.resolve(
    import.meta.dirname,
    '..',
    '.github',
    'workflows',
    'release-image.yml',
  ),
  'utf8',
);

describe('release image workflow environment guard', () => {
  it('loads all public build variables from one Environment JSON value', () => {
    expect(workflow).toContain('BUILD_CONFIG: ${{ vars.BUILD_CONFIG }}');
    expect(workflow).toContain(
      'scripts/resolve-build-config.ts "$DEPLOY_ENVIRONMENT"',
    );
    for (const variable of [
      'NEXT_PUBLIC_SITE_URL',
      'NEXT_PUBLIC_ICP_LICENSE',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ]) {
      expect(workflow).toContain(`${variable}=\${{ env.${variable} }}`);
      expect(workflow).not.toContain(`vars.${variable}`);
    }
    expect(workflow).not.toContain('vars.BUILD_ENVIRONMENT');
  });
});
