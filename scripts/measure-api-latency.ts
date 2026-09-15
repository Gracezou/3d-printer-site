import assert from 'node:assert/strict';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { productVariants, products, userProfiles } from '@/lib/db/schema';

interface StoredCookie {
  name: string;
  value: string;
  options?: CookieOptions;
}

interface Measurement {
  label: string;
  path: string;
  samples: number;
  status: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  serverTimingMetric: string | null;
  serverP95Ms: number | null;
  cacheControl: string | null;
  cacheStatus: string | null;
  responseBytes: number;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return Math.round((sorted[index] ?? 0) * 100) / 100;
}

function parseServerTiming(value: string | null): {
  metric: string | null;
  durationMs: number | null;
} {
  if (!value) return { metric: null, durationMs: null };
  const match = /^([a-z0-9_-]+);dur=([0-9.]+)$/i.exec(value.trim());
  if (!match) return { metric: value, durationMs: null };
  return { metric: match[1] ?? null, durationMs: Number(match[2]) };
}

async function measure(
  baseUrl: string,
  label: string,
  path: string,
  cookieHeader: string,
  sampleCount: number,
): Promise<Measurement> {
  const durations: number[] = [];
  const serverDurations: number[] = [];
  let status = 0;
  let responseBytes = 0;
  let cacheControl: string | null = null;
  let cacheStatus: string | null = null;
  let serverTimingMetric: string | null = null;

  for (let index = 0; index < sampleCount + 5; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Cookie: cookieHeader,
        'Cache-Control': 'no-cache',
      },
    });
    const duration = performance.now() - startedAt;
    const body = await response.text();
    const parsed = JSON.parse(body) as { code?: number };
    assert.equal(
      response.status,
      200,
      `${label} returned HTTP ${response.status}`,
    );
    assert.equal(
      parsed.code,
      0,
      `${label} returned business code ${parsed.code}`,
    );

    if (index < 5) continue;
    durations.push(duration);
    status = response.status;
    responseBytes = Buffer.byteLength(body);
    cacheControl = response.headers.get('cache-control');
    cacheStatus =
      response.headers.get('x-nextjs-cache') ?? response.headers.get('age');
    const serverTiming = parseServerTiming(
      response.headers.get('server-timing'),
    );
    serverTimingMetric = serverTiming.metric;
    if (serverTiming.durationMs !== null) {
      serverDurations.push(serverTiming.durationMs);
    }
  }

  return {
    label,
    path,
    samples: durations.length,
    status,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    minMs: Math.round(Math.min(...durations) * 100) / 100,
    maxMs: Math.round(Math.max(...durations) * 100) / 100,
    serverTimingMetric,
    serverP95Ms: serverDurations.length
      ? percentile(serverDurations, 0.95)
      : null,
    cacheControl,
    cacheStatus,
    responseBytes,
  };
}

async function main(): Promise<void> {
  const baseUrl = (
    process.env['MEASURE_BASE_URL'] ?? 'http://127.0.0.1:3000'
  ).replace(/\/$/, '');
  const location = process.env['MEASURE_LOCATION'] ?? 'unknown';
  const sampleCount = Number.parseInt(
    process.env['MEASURE_SAMPLES'] ?? '30',
    10,
  );
  assert.ok(
    Number.isInteger(sampleCount) && sampleCount >= 10 && sampleCount <= 100,
    'MEASURE_SAMPLES must be an integer from 10 to 100',
  );

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  assert.ok(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required');
  assert.ok(anonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required');

  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `v023-api-${suffix}@daxiaoxiang.com`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = getDb();
  let authUserId = '';

  try {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    assert.ifError(createError);
    assert.ok(created.user);
    authUserId = created.user.id;
    await db.insert(userProfiles).values({
      id: authUserId,
      email,
      nickname: `v0.2.3 ${location} API probe`,
    });

    const auth = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signedIn, error: signInError } =
      await auth.auth.signInWithPassword({ email, password });
    assert.ifError(signInError);
    assert.ok(signedIn.session);

    const cookieJar: StoredCookie[] = [];
    const serverAuth = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => cookieJar,
        setAll: (cookies) => {
          for (const cookie of cookies) {
            const existing = cookieJar.findIndex(
              (item) => item.name === cookie.name,
            );
            if (existing >= 0) cookieJar.splice(existing, 1);
            cookieJar.push(cookie);
          }
        },
      },
    });
    const { error: setSessionError } = await serverAuth.auth.setSession({
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
    });
    assert.ifError(setSessionError);
    const cookieHeader = cookieJar
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    assert.ok(cookieHeader, 'Supabase session cookie was not generated');

    const [variant] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(products.slug, 'xteink-x3-protective-case'),
          eq(productVariants.isActive, true),
        ),
      )
      .limit(1);
    assert.ok(variant, 'X3 feasibility product has no active variant');

    const cartResponse = await fetch(`${baseUrl}/api/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ variantId: variant.id, quantity: 1 }),
    });
    assert.equal(cartResponse.status, 201, 'Failed to seed isolated cart');

    const endpoints = [
      ['product_list', '/api/products'],
      ['x3_product_detail', '/api/products/xteink-x3-protective-case'],
      [
        'x3_live_availability',
        '/api/products/xteink-x3-protective-case/availability',
      ],
      ['authenticated_cart', '/api/cart'],
      ['x3_device_detail', '/api/devices/xteink/x3'],
    ] as const;
    const results: Measurement[] = [];
    for (const [label, path] of endpoints) {
      results.push(
        await measure(baseUrl, label, path, cookieHeader, sampleCount),
      );
    }

    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        measuredAt: new Date().toISOString(),
        location,
        baseUrl,
        warmupSamples: 5,
        sampleCount,
        results,
      })}\n`,
    );
  } finally {
    if (authUserId) {
      await db.delete(userProfiles).where(eq(userProfiles.id, authUserId));
      await admin.auth.admin.deleteUser(authUserId);
    }
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`API latency measurement failed: ${message}\n`);
  process.exitCode = 1;
});
