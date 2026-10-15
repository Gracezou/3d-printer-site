import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  deviceBrands,
  deviceModels,
  emailMessages,
  materials,
  modelRequests,
  orders,
  productDeviceModels,
  products,
  productVariants,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import {
  dispatchBusinessEmails,
  enqueueEligibleModelEmails,
  enqueueOrderEmail,
} from '@/lib/services/business-email.service';
import { databaseHostname, isLocalDatabaseHost } from './assert-local-database';

async function main(): Promise<void> {
  if (!isLocalDatabaseHost(databaseHostname(process.env.DATABASE_URL))) {
    throw new Error('Business mail integration test requires a local database');
  }
  process.env.BUSINESS_MAIL_ENABLED = 'true';
  process.env.BUSINESS_SMTP_HOST = 'smtp.example.invalid';
  process.env.BUSINESS_SMTP_PORT = '587';
  process.env.BUSINESS_SMTP_USER = 'integration';
  process.env.BUSINESS_SMTP_PASSWORD = 'not-a-real-password';
  process.env.BUSINESS_MAIL_FROM = 'notify@example.invalid';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:5003';
  process.env.APP_ENV = 'development';

  const db = getDb();
  const suffix = randomUUID().slice(0, 8);
  const [user] = await db
    .insert(userProfiles)
    .values({ id: randomUUID(), email: `buyer-${suffix}@example.invalid` })
    .returning();
  assert(user);
  const [order] = await db
    .insert(orders)
    .values({
      orderNo: `20261015${suffix}`,
      userId: user.id,
      itemsAmount: '20.00',
      payableAmount: '20.00',
      receiverName: '集成测试',
      receiverPhone: '13800000000',
      receiverProvince: '上海',
      receiverCity: '上海',
      receiverDistrict: '浦东',
      receiverDetail: '本地测试',
    })
    .returning();
  assert(order);
  const [brand] = await db
    .insert(deviceBrands)
    .values({ name: '测试品牌', slug: `mail-${suffix}` })
    .returning();
  assert(brand);
  const [model] = await db
    .insert(deviceModels)
    .values({ brandId: brand.id, name: '测试机型', slug: `model-${suffix}` })
    .returning();
  assert(model);
  const [product] = await db
    .insert(products)
    .values({ name: '测试保护壳', slug: `case-${suffix}`, status: 'draft' })
    .returning();
  assert(product);
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product.id,
      skuCode: `mail-${suffix}`,
      name: '黑色',
      price: '20.00',
    })
    .returning();
  assert(variant);
  const [material] = await db
    .insert(materials)
    .values({
      code: `mail-${suffix}`,
      name: '测试耗材',
      materialType: 'PLA',
      stockGrams: '1000.00',
    })
    .returning();
  assert(material);
  await db.insert(variantMaterials).values({
    variantId: variant.id,
    materialId: material.id,
    grams: '10.00',
  });
  await db.insert(productDeviceModels).values({
    productId: product.id,
    deviceModelId: model.id,
  });
  const [request] = await db
    .insert(modelRequests)
    .values({
      deviceModelId: model.id,
      email: `interest-${suffix}@example.invalid`,
    })
    .returning();
  assert(request);

  try {
    await db.transaction(async (tx) => {
      await enqueueOrderEmail(tx, 'payment_paid', order.id, order.id);
      await enqueueOrderEmail(tx, 'payment_paid', order.id, order.id);
    });
    const paidRows = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.dedupeKey, `payment_paid:${order.id}`));
    assert.equal(
      paidRows.length,
      1,
      'repeat event must not create second email',
    );

    assert.equal(await enqueueEligibleModelEmails(), 0);
    await db
      .update(deviceModels)
      .set({ isMolded: true })
      .where(eq(deviceModels.id, model.id));
    assert.equal(await enqueueEligibleModelEmails(), 0);
    await db
      .update(products)
      .set({ status: 'on_sale' })
      .where(eq(products.id, product.id));
    assert.equal(await enqueueEligibleModelEmails(), 1);
    assert.equal(await enqueueEligibleModelEmails(), 0);

    const delivered: string[] = [];
    const result = await dispatchBusinessEmails({
      async send(input) {
        delivered.push(input.to);
        return { messageId: input.messageId };
      },
    });
    assert.equal(result.sent, 2);
    assert.equal(delivered.length, 2);
    const [updatedRequest] = await db
      .select({ status: modelRequests.status })
      .from(modelRequests)
      .where(eq(modelRequests.id, request.id));
    assert.equal(updatedRequest?.status, 'notified');

    const [temporary] = await db
      .insert(emailMessages)
      .values({
        dedupeKey: `payment_paid:temporary-${suffix}`,
        kind: 'payment_paid',
        recipientEmail: user.email!,
        payload: {
          orderNo: order.orderNo,
          path: `/account/orders/${order.orderNo}`,
        },
      })
      .returning();
    assert(temporary);
    const retryResult = await dispatchBusinessEmails({
      async send() {
        throw { responseCode: 451 };
      },
    });
    assert.equal(retryResult.failed, 1);
    const [retryRow] = await db
      .select({
        status: emailMessages.status,
        attempts: emailMessages.attempts,
      })
      .from(emailMessages)
      .where(eq(emailMessages.id, temporary.id));
    assert.equal(retryRow?.status, 'pending');
    assert.equal(retryRow.attempts, 1);

    await db
      .update(emailMessages)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(emailMessages.id, temporary.id));
    await dispatchBusinessEmails({
      async send() {
        throw new Error('socket timeout after DATA');
      },
    });
    const [unknownRow] = await db
      .select({ status: emailMessages.status })
      .from(emailMessages)
      .where(eq(emailMessages.id, temporary.id));
    assert.equal(unknownRow?.status, 'unknown');

    const [blocked] = await db
      .insert(emailMessages)
      .values({
        dedupeKey: `model_opened:blocked-${suffix}`,
        kind: 'model_opened',
        recipientEmail: request.email,
        payload: { modelName: '测试机型', path: '/devices/test/model' },
      })
      .returning();
    assert(blocked);
    process.env.APP_ENV = 'staging';
    delete process.env.BUSINESS_MAIL_ALLOWED_RECIPIENTS;
    await assert.rejects(
      () =>
        dispatchBusinessEmails({ send: async () => ({ messageId: 'unused' }) }),
      /allowlist is required/,
    );
    process.env.BUSINESS_MAIL_ALLOWED_RECIPIENTS = user.email!;
    let called = false;
    const blockedResult = await dispatchBusinessEmails({
      async send() {
        called = true;
        return { messageId: 'unused' };
      },
    });
    assert.equal(blockedResult.failed, 1);
    assert.equal(called, false);
    const [blockedRow] = await db
      .select({ status: emailMessages.status })
      .from(emailMessages)
      .where(eq(emailMessages.id, blocked.id));
    assert.equal(blockedRow?.status, 'failed');
    console.log(
      'Business mail local integration passed: dedupe, eligibility, delivery, retry, unknown quarantine, Stage allowlist',
    );
  } finally {
    await db
      .delete(emailMessages)
      .where(eq(emailMessages.recipientEmail, user.email!));
    await db
      .delete(emailMessages)
      .where(eq(emailMessages.recipientEmail, request.email));
    await db.delete(modelRequests).where(eq(modelRequests.id, request.id));
    await db
      .delete(productDeviceModels)
      .where(eq(productDeviceModels.deviceModelId, model.id));
    await db
      .delete(variantMaterials)
      .where(eq(variantMaterials.variantId, variant.id));
    await db.delete(productVariants).where(eq(productVariants.id, variant.id));
    await db.delete(materials).where(eq(materials.id, material.id));
    await db.delete(products).where(eq(products.id, product.id));
    await db.delete(deviceModels).where(eq(deviceModels.id, model.id));
    await db.delete(deviceBrands).where(eq(deviceBrands.id, brand.id));
    await db.delete(orders).where(eq(orders.id, order.id));
    await db.delete(userProfiles).where(eq(userProfiles.id, user.id));
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
