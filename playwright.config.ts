import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { assertLocalDatabaseUrl } from './scripts/assert-local-database';

assertLocalDatabaseUrl(process.env.DATABASE_URL, false);
process.env.E2E_ADMIN_SECRET ??= randomBytes(32).toString('hex');
process.env.ADMIN_JWT_SECRET = process.env.E2E_ADMIN_SECRET;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5103',
    channel: 'chromium',
    trace: 'retain-on-failure',
  },
  globalSetup: './tests/e2e/setup.ts',
  globalTeardown: './tests/e2e/teardown.ts',
  webServer: {
    command: 'pnpm exec next dev --port 5103 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:5103/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      ADMIN_JWT_SECRET: process.env.E2E_ADMIN_SECRET,
      NEXT_PUBLIC_ICP_LICENSE: '',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:5103',
      NEXT_PUBLIC_SUPABASE_URL: 'https://browser-test.invalid',
      SUPABASE_URL: 'https://browser-test.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'browser-test-placeholder',
      SUPABASE_SERVICE_ROLE_KEY: 'browser-test-placeholder',
      BUSINESS_MAIL_ENABLED: 'false',
      APP_ENV: 'development',
    },
  },
});
