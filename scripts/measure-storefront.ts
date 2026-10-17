import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { addresses, cartItems, preview } from '../tests/e2e/fixtures';

// Only deterministic local production builds may be measured. No real accounts,
// SMTP, payment providers or shared database writes are used by this runner.
async function main() {
  const base = new URL(process.argv[2] ?? '');
  const label = process.argv[3];
  if (base.hostname !== '127.0.0.1' || !/^[a-z0-9-]+$/.test(label ?? ''))
    throw new Error('Use http://127.0.0.1:<port> and a safe report label');

  const browser = await chromium.launch({
    channel:
      process.env.E2E_BROWSER_CHANNEL === 'chrome' ? 'chrome' : 'chromium',
  });
  const rows: unknown[] = [];
  try {
    for (const width of [390, 1440]) {
      for (const route of [
        '/',
        '/products',
        '/products/e2e-v031-case',
        '/cart',
        '/checkout',
      ]) {
        for (let sample = 0; sample < 4; sample++) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
          });
          const page = await context.newPage();
          await page.addInitScript(() => {
            const state = window as unknown as { localLcp: number };
            state.localLcp = 0;
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries())
                state.localLcp = entry.startTime;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
            sessionStorage.setItem(
              'checkout-selection',
              JSON.stringify({
                items: [
                  {
                    variantId: 'f0310000-0000-4000-8000-000000000004',
                    quantity: 1,
                  },
                ],
                fromCart: true,
              }),
            );
          });
          await page.route('**/_next/image?*', (request) =>
            request.fulfill({
              contentType: 'image/svg+xml',
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e5e7eb"/></svg>',
            }),
          );
          await page.route('**/api/**', async (request) => {
            const pathname = new URL(request.request().url()).pathname;
            await new Promise((resolve) => setTimeout(resolve, 80));
            const data =
              pathname === '/api/cart'
                ? { items: cartItems }
                : pathname === '/api/auth/me'
                  ? { email: 'perf@example.invalid', nickname: '本地测量' }
                  : pathname === '/api/addresses'
                    ? { addresses }
                    : pathname === '/api/orders/preview'
                      ? preview
                      : { cartCount: 3, quantity: 2 };
            await request.fulfill({ json: { code: 0, data, message: 'ok' } });
          });
          await page.goto(new URL(route, base).href, {
            waitUntil: 'networkidle',
          });
          const paints = await page.evaluate(() => ({
            fcp:
              performance.getEntriesByName('first-contentful-paint')[0]
                ?.startTime ?? null,
            lcp: (window as unknown as { localLcp: number }).localLcp,
            ttfb: (
              performance.getEntriesByType(
                'navigation',
              )[0] as PerformanceNavigationTiming
            ).responseStart,
          }));
          let cartFeedback: number | null = null;
          if (route === '/cart') {
            const button = page
              .getByRole('button', { name: '增加数量', exact: true })
              .first();
            await button.waitFor();
            cartFeedback = await button.evaluate(async (node) => {
              const start = performance.now();
              (node as HTMLButtonElement).click();
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              );
              return performance.now() - start;
            });
          }
          // Sample zero warms server-side caches and is not part of medians.
          if (sample > 0)
            rows.push({ width, route, sample, ...paints, cartFeedback });
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  const directory = path.resolve('test-results/performance');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, `${label}.json`),
    JSON.stringify(
      {
        label,
        browser: browser.version(),
        at: new Date().toISOString(),
        samplesPerCase: 3,
        conditions:
          'Same host, Chromium, local production build, no throttling; fresh context; fixed 80ms mocked APIs; placeholder images; not field CWV/INP',
        rows,
      },
      null,
      2,
    ),
  );
  console.log(
    `Saved ${rows.length} local production measurements for ${label}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
