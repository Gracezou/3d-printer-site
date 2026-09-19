import { describe, expect, it } from 'vitest';

import {
  githubEnvironmentLines,
  parseBuildConfig,
} from './resolve-build-config';

const stageConfig = {
  environment: 'stage',
  NEXT_PUBLIC_SITE_URL: 'https://stage.example.invalid',
  NEXT_PUBLIC_ICP_LICENSE: 'STAGE-NOT-APPLICABLE',
  NEXT_PUBLIC_SUPABASE_URL: 'https://stage-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-stage-anon-key',
};

describe('build config resolver', () => {
  it('accepts one complete JSON config for the selected environment', () => {
    const parsed = parseBuildConfig(JSON.stringify(stageConfig), 'stage');
    expect(parsed).toEqual(stageConfig);
    expect(githubEnvironmentLines(parsed)).toContain(
      'NEXT_PUBLIC_SITE_URL=https://stage.example.invalid\n',
    );
    expect(githubEnvironmentLines(parsed)).not.toContain('environment=');
  });

  it('rejects a repository-level fallback for another environment', () => {
    expect(() =>
      parseBuildConfig(JSON.stringify(stageConfig), 'production'),
    ).toThrow(/environment 与构建目标不一致/u);
  });

  it.each([
    { name: 'missing config', value: undefined },
    { name: 'invalid JSON', value: '{' },
    {
      name: 'missing field',
      value: JSON.stringify({ ...stageConfig, NEXT_PUBLIC_SITE_URL: '' }),
    },
    {
      name: 'newline injection',
      value: JSON.stringify({
        ...stageConfig,
        NEXT_PUBLIC_SITE_URL: 'https://safe.invalid\nINJECTED=value',
      }),
    },
    {
      name: 'unknown field',
      value: JSON.stringify({ ...stageConfig, EXTRA: 'unexpected' }),
    },
  ])('rejects $name', ({ value }) => {
    expect(() => parseBuildConfig(value, 'stage')).toThrow();
  });
});
