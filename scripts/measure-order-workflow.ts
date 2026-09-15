import assert from 'node:assert/strict';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  materialStockMovements,
  materials,
  orders,
  productVariants,
  products,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';

interface StoredCookie {
  name: string;
  value: string;
  options?: CookieOptions;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return Math.round((sorted[index] ?? 0) * 100) / 100;
}

function summarize(values: number[]) {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    minMs: Math.round(Math.min(...values) * 100) / 100,
    maxMs: Math.round(Math.max(...values) * 100) / 100,
  };
}

async function timedPost(
  baseUrl: string,
  path: string,
  cookieHeader: string,
  body: unknown,
  expectedStatus: number,
): Promise<number> {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });
  const durationMs = performance.now() - startedAt;
  const payload = (await response.json()) as {
    code?: number;
    message?: string;
  };
  assert.equal(
    response.status,
    expectedStatus,
    `${path} returned HTTP ${response.status}: ${payload.message ?? ''}`,
  );
  assert.equal(
    payload.code,
    0,
    `${path} returned business code ${payload.code}`,
  );
  return durationMs;
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
    Number.isInteger(sampleCount) && sampleCount >= 10 && sampleCount <= 50,
    'MEASURE_SAMPLES must be an integer from 10 to 50',
  );

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  assert.ok(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required');
  assert.ok(anonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required');

  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `v023-flow-${suffix}@daxiaoxiang.com`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = getDb();
  let userId = '';
  let productId = '';
  let materialId = '';
  const cartDurations: number[] = [];
  const previewDurations: number[] = [];
  const createDurations: number[] = [];
  const workflowDurations: number[] = [];

  try {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    assert.ifError(createError);
    assert.ok(created.user);
    userId = created.user.id;
    await db.insert(userProfiles).values({
      id: userId,
      email,
      nickname: `v0.2.3 ${location} workflow probe`,
    });
    const [address] = await db
      .insert(addresses)
      .values({
        userId,
        receiverName: 'v0.2.3 全链路测试',
        receiverPhone: '18800000000',
        province: '上海市',
        provinceCode: '310000',
        city: '上海市',
        district: '浦东新区',
        detail: '隔离测试地址 2 号',
      })
      .returning({ id: addresses.id });
    assert.ok(address);

    const [material] = await db
      .insert(materials)
      .values({
        code: `V023-FLOW-${suffix}`,
        name: `v0.2.3 ${location} 全链路耗材`,
        materialType: 'PLA',
        stockGrams: String(sampleCount * 20),
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert.ok(material);
    materialId = material.id;
    const [product] = await db
      .insert(products)
      .values({
        name: `v0.2.3 ${location} 全链路商品`,
        slug: `v023-order-workflow-${location}-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    assert.ok(product);
    productId = product.id;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        skuCode: `V023-FLOW-${location}-${suffix}`.toUpperCase(),
        name: '全链路测试款',
        price: '10.00',
        weightGrams: '10.00',
      })
      .returning({ id: productVariants.id });
    assert.ok(variant);
    await db.insert(variantMaterials).values({
      variantId: variant.id,
      materialId,
      grams: '10.00',
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

    for (let index = 0; index < sampleCount; index += 1) {
      const workflowStartedAt = performance.now();
      cartDurations.push(
        await timedPost(
          baseUrl,
          '/api/cart/items',
          cookieHeader,
          { variantId: variant.id, quantity: 1 },
          201,
        ),
      );
      previewDurations.push(
        await timedPost(
          baseUrl,
          '/api/orders/preview',
          cookieHeader,
          {
            items: [{ variantId: variant.id, quantity: 1 }],
            addressId: address.id,
          },
          200,
        ),
      );
      createDurations.push(
        await timedPost(
          baseUrl,
          '/api/orders',
          cookieHeader,
          {
            items: [{ variantId: variant.id, quantity: 1 }],
            addressId: address.id,
            fromCart: true,
            buyerRemark: `v0.2.3 workflow sample ${index + 1}`,
          },
          201,
        ),
      );
      workflowDurations.push(performance.now() - workflowStartedAt);
    }

    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        measuredAt: new Date().toISOString(),
        location,
        baseUrl,
        sampleCount,
        successCount: workflowDurations.length,
        errorCount: sampleCount - workflowDurations.length,
        workflow: summarize(workflowDurations),
        phases: {
          cartAdd: summarize(cartDurations),
          orderPreview: summarize(previewDurations),
          orderCreate: summarize(createDurations),
        },
      })}\n`,
    );
  } finally {
    if (userId) {
      const createdOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.userId, userId));
      if (createdOrders.length) {
        await db.delete(orders).where(
          inArray(
            orders.id,
            createdOrders.map((order) => order.id),
          ),
        );
      }
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialId) {
      await db
        .delete(materialStockMovements)
        .where(eq(materialStockMovements.materialId, materialId));
      await db.delete(materials).where(eq(materials.id, materialId));
    }
    if (userId) {
      await db.delete(userProfiles).where(eq(userProfiles.id, userId));
      await admin.auth.admin.deleteUser(userId);
    }
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Order workflow measurement failed: ${message}\n`);
  process.exitCode = 1;
});
